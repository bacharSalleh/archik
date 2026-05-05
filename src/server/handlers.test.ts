import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  handleActors,
  handleAlphas,
  handleTrace,
  handleUseCases,
  listArchikFiles,
  safeResolveProjectFile,
} from "./handlers.ts";

/**
 * Lightweight stand-ins for node:http req/res. The new JSON
 * endpoints only touch req.url + req.method, and res.statusCode +
 * res.setHeader + res.end — covering those is enough.
 */
type MockRes = ServerResponse & {
  _headers: Record<string, string | number | string[]>;
  _body: string;
  _ended: boolean;
};

function mockReq(url: string, method = "GET"): IncomingMessage {
  return { url, method, headers: {} } as unknown as IncomingMessage;
}

function mockRes(): MockRes {
  const headers: Record<string, string | number | string[]> = {};
  const res: MockRes = {
    statusCode: 200,
    _headers: headers,
    _body: "",
    _ended: false,
    setHeader(name: string, value: string | number | string[]) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
    writeHead(this: MockRes, status: number, h?: Record<string, string | number | string[]>) {
      this.statusCode = status;
      if (h) for (const [k, v] of Object.entries(h)) headers[k.toLowerCase()] = v;
      return this;
    },
    end(this: MockRes, chunk?: string) {
      if (typeof chunk === "string") this._body += chunk;
      this._ended = true;
      return this;
    },
  } as unknown as MockRes;
  return res;
}

describe("safeResolveProjectFile", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "archik-sandbox-"));
    await mkdir(path.join(root, ".archik"));
    await writeFile(path.join(root, ".archik", "main.archik.yaml"), "");
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("accepts a relative .archik.yaml under the project root", () => {
    const out = safeResolveProjectFile(root, ".archik/main.archik.yaml");
    expect(out).toBe(path.join(root, ".archik", "main.archik.yaml"));
  });

  it("accepts a .archik.suggested.yaml sibling", () => {
    const out = safeResolveProjectFile(
      root,
      ".archik/main.archik.suggested.yaml",
    );
    expect(out).toBe(
      path.join(root, ".archik", "main.archik.suggested.yaml"),
    );
  });

  it("rejects a path that escapes the root via `..`", () => {
    expect(safeResolveProjectFile(root, "../escape.archik.yaml")).toBeNull();
    expect(
      safeResolveProjectFile(root, ".archik/../../escape.archik.yaml"),
    ).toBeNull();
  });

  it("rejects an absolute path", () => {
    expect(safeResolveProjectFile(root, "/etc/passwd.archik.yaml")).toBeNull();
  });

  it("rejects a Windows drive-letter path", () => {
    expect(safeResolveProjectFile(root, "C:/secrets.archik.yaml")).toBeNull();
  });

  it("rejects a path containing backslashes", () => {
    expect(
      safeResolveProjectFile(root, ".archik\\main.archik.yaml"),
    ).toBeNull();
  });

  it("rejects files with the wrong extension", () => {
    expect(safeResolveProjectFile(root, ".archik/notes.yaml")).toBeNull();
    expect(safeResolveProjectFile(root, ".archik/main.json")).toBeNull();
    expect(safeResolveProjectFile(root, ".archik/main")).toBeNull();
  });

  it("rejects empty / non-string input", () => {
    expect(safeResolveProjectFile(root, "")).toBeNull();
  });

  it("does not require the file to exist (404 is the handler's job)", () => {
    const out = safeResolveProjectFile(
      root,
      ".archik/never-created.archik.yaml",
    );
    expect(out).toBe(
      path.join(root, ".archik", "never-created.archik.yaml"),
    );
  });
});

describe("listArchikFiles", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "archik-list-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("finds files under .archik/ and the legacy root file", async () => {
    await writeFile(path.join(root, "architecture.archik.yaml"), "");
    await mkdir(path.join(root, ".archik"));
    await writeFile(path.join(root, ".archik", "orders.archik.yaml"), "");
    await writeFile(path.join(root, ".archik", "payments.archik.yaml"), "");
    const files = await listArchikFiles(root);
    expect(files.map((f) => f.path)).toEqual([
      "architecture.archik.yaml",
      ".archik/orders.archik.yaml",
      ".archik/payments.archik.yaml",
    ]);
  });

  it("flags files that have a pending suggestion sidecar", async () => {
    await mkdir(path.join(root, ".archik"));
    await writeFile(path.join(root, ".archik", "main.archik.yaml"), "");
    await writeFile(
      path.join(root, ".archik", "orders.archik.yaml"),
      "",
    );
    await writeFile(
      path.join(root, ".archik", "orders.archik.suggested.yaml"),
      "",
    );
    const files = await listArchikFiles(root);
    const main = files.find((f) => f.path === ".archik/main.archik.yaml");
    const orders = files.find((f) => f.path === ".archik/orders.archik.yaml");
    expect(main?.hasSuggestion).toBe(false);
    expect(orders?.hasSuggestion).toBe(true);
  });

  it("surfaces orphan suggestion sidecars (no sibling main file)", async () => {
    await mkdir(path.join(root, ".archik"));
    await writeFile(path.join(root, ".archik", "main.archik.yaml"), "");
    // memory.archik.suggested.yaml exists but memory.archik.yaml does not —
    // the canvas needs to see this so the user can act on it.
    await writeFile(
      path.join(root, ".archik", "memory.archik.suggested.yaml"),
      "",
    );
    const files = await listArchikFiles(root);
    const memory = files.find(
      (f) => f.path === ".archik/memory.archik.suggested.yaml",
    );
    expect(memory).toBeDefined();
    expect(memory?.isOrphanSuggestion).toBe(true);
    expect(memory?.hasSuggestion).toBe(true);
    expect(memory?.name).toBe("memory");
  });

  it("does NOT mark a sidecar with a sibling main file as orphan", async () => {
    await mkdir(path.join(root, ".archik"));
    await writeFile(path.join(root, ".archik", "main.archik.yaml"), "");
    await writeFile(path.join(root, ".archik", "orders.archik.yaml"), "");
    await writeFile(
      path.join(root, ".archik", "orders.archik.suggested.yaml"),
      "",
    );
    const files = await listArchikFiles(root);
    // Only two entries (main + orders) — the sidecar shows up as
    // hasSuggestion:true on the orders main entry, NOT as a third
    // standalone orphan entry.
    expect(files).toHaveLength(2);
    const orders = files.find((f) => f.path === ".archik/orders.archik.yaml");
    expect(orders?.hasSuggestion).toBe(true);
    expect(orders?.isOrphanSuggestion).toBeUndefined();
  });

  it("renames the legacy `architecture` file to display name 'main'", async () => {
    await writeFile(path.join(root, "architecture.archik.yaml"), "");
    const files = await listArchikFiles(root);
    expect(files[0]?.name).toBe("main");
  });

  it("flags `isRoot` on the file the resolver picked", async () => {
    await mkdir(path.join(root, ".archik"));
    const main = path.join(root, ".archik", "main.archik.yaml");
    const orders = path.join(root, ".archik", "orders.archik.yaml");
    await writeFile(main, "");
    await writeFile(orders, "");
    const files = await listArchikFiles(root, main);
    expect(files.find((f) => f.path === ".archik/main.archik.yaml")?.isRoot).toBe(
      true,
    );
    expect(
      files.find((f) => f.path === ".archik/orders.archik.yaml")?.isRoot,
    ).toBe(false);
  });

  it("skips node_modules, dist, and other ignored directories", async () => {
    await mkdir(path.join(root, "node_modules", "archik", ".archik"), {
      recursive: true,
    });
    await writeFile(
      path.join(
        root,
        "node_modules",
        "archik",
        ".archik",
        "main.archik.yaml",
      ),
      "",
    );
    await mkdir(path.join(root, ".archik"));
    await writeFile(path.join(root, ".archik", "main.archik.yaml"), "");
    const files = await listArchikFiles(root);
    expect(files.map((f) => f.path)).toEqual([".archik/main.archik.yaml"]);
  });

  it("ignores .suggested files (they're sidecars, not docs)", async () => {
    await mkdir(path.join(root, ".archik"));
    await writeFile(path.join(root, ".archik", "main.archik.yaml"), "");
    await writeFile(
      path.join(root, ".archik", "main.archik.suggested.yaml"),
      "",
    );
    const files = await listArchikFiles(root);
    expect(files.map((f) => f.path)).toEqual([".archik/main.archik.yaml"]);
  });

  it("ignores .archik.yaml files outside the legacy root + .archik/", async () => {
    // Sample / fixture / example files anywhere else aren't the
    // project's own architecture and shouldn't pollute the switcher.
    await mkdir(path.join(root, ".archik"));
    await writeFile(path.join(root, ".archik", "main.archik.yaml"), "");
    await mkdir(path.join(root, "docs"));
    await writeFile(path.join(root, "docs", "sample.archik.yaml"), "");
    await mkdir(path.join(root, "examples", "tutorial"), { recursive: true });
    await writeFile(
      path.join(root, "examples", "tutorial", "demo.archik.yaml"),
      "",
    );
    const files = await listArchikFiles(root);
    expect(files.map((f) => f.path)).toEqual([".archik/main.archik.yaml"]);
  });
});

// ============================================================================
//  /__archik/usecases | /actors | /alphas | /trace
// ============================================================================

const minimalArch = `
version: "1.0"
name: Demo
nodes:
  - id: ui
    kind: frontend
    name: UI
    description: x
    sourcePath: src/ui
    stereotype: boundary
    seqFiles:
      - .archik/flow.archik.seq.yaml
  - id: api
    kind: service
    name: API
    description: x
    sourcePath: src/api
    stereotype: control
edges: []
`.trim();

const minimalActors = `
version: "1.0"
actors:
  - id: customer
    kind: human
    description: End-user.
  - id: admin
    kind: human
    description: Operator.
`.trim();

const minimalUC = (id = "place-order", primary = "customer") =>
  [
    'version: "1.0"',
    `id: ${id}`,
    `name: ${id}`,
    `primaryActor: ${primary}`,
    "goal: Customer pays.",
    "flows:",
    "  basic:",
    "    steps: [a]",
    "slices:",
    "  - id: happy",
    "    description: Happy path.",
    "    flows: [basic]",
    "    tests: [tests/happy.spec.ts]",
    "    realization:",
    "      seqFile: .archik/flow.archik.seq.yaml",
    "",
  ].join("\n");

const minimalSeq = (ucId = "place-order") =>
  [
    'version: "1.0"',
    "name: Flow",
    "realizes:",
    `  useCase: ${ucId}`,
    "  slice: happy",
    "participants:",
    "  - id: u",
    "    nodeId: ui",
    "  - id: a",
    "    nodeId: api",
    "steps:",
    "  - type: message",
    "    id: m1",
    "    from: u",
    "    to: a",
    "    label: go",
    "    arrow: sync",
    "",
  ].join("\n");

describe("read-only JSON handlers", () => {
  let root: string;
  let docPath: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "archik-handlers-"));
    await mkdir(path.join(root, ".archik"));
    await mkdir(path.join(root, ".archik/usecases"), { recursive: true });
    await mkdir(path.join(root, "src/ui"), { recursive: true });
    await mkdir(path.join(root, "src/api"), { recursive: true });
    await mkdir(path.join(root, "tests"), { recursive: true });
    await writeFile(path.join(root, "tests/happy.spec.ts"), "");
    docPath = path.join(root, ".archik/main.archik.yaml");
    await writeFile(docPath, minimalArch);
    await writeFile(
      path.join(root, ".archik/actors.archik.actors.yaml"),
      minimalActors,
    );
    await writeFile(
      path.join(root, ".archik/usecases/place-order.archik.uc.yaml"),
      minimalUC(),
    );
    await writeFile(path.join(root, ".archik/flow.archik.seq.yaml"), minimalSeq());
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe("handleUseCases", () => {
    it("lists every use case as JSON", async () => {
      const res = mockRes();
      await handleUseCases(root, mockReq("/__archik/usecases"), res);
      expect(res.statusCode).toBe(200);
      expect(res._headers["content-type"]).toMatch(/application\/json/);
      const body = JSON.parse(res._body);
      expect(body.ok).toBe(true);
      expect(body.count).toBe(1);
      expect(body.useCases[0].id).toBe("place-order");
    });

    it("returns one use case when ?id= is set", async () => {
      const res = mockRes();
      await handleUseCases(
        root,
        mockReq("/__archik/usecases?id=place-order"),
        res,
      );
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res._body);
      expect(body.ok).toBe(true);
      expect(body.useCase.id).toBe("place-order");
      expect(body.file).toMatch(/place-order\.archik\.uc\.yaml/);
    });

    it("returns 404 for an unknown id", async () => {
      const res = mockRes();
      await handleUseCases(root, mockReq("/__archik/usecases?id=ghost"), res);
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res._body);
      expect(body.ok).toBe(false);
    });

    it("filters list by ?actor=", async () => {
      const res = mockRes();
      await handleUseCases(
        root,
        mockReq("/__archik/usecases?actor=admin"),
        res,
      );
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res._body);
      // only "place-order" exists, primaryActor=customer → filter excludes it
      expect(body.count).toBe(0);
    });

    it("returns 405 on non-GET", async () => {
      const res = mockRes();
      await handleUseCases(
        root,
        mockReq("/__archik/usecases", "POST"),
        res,
      );
      expect(res.statusCode).toBe(405);
      expect(res._headers.allow).toBe("GET");
    });
  });

  describe("handleActors", () => {
    it("lists every actor flat across files", async () => {
      const res = mockRes();
      await handleActors(root, mockReq("/__archik/actors"), res);
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res._body);
      expect(body.ok).toBe(true);
      expect(body.count).toBe(2);
      expect(body.actors.map((a: { actor: { id: string } }) => a.actor.id))
        .toEqual(["customer", "admin"]);
    });

    it("returns 405 on non-GET", async () => {
      const res = mockRes();
      await handleActors(root, mockReq("/__archik/actors", "DELETE"), res);
      expect(res.statusCode).toBe(405);
    });
  });

  describe("handleAlphas", () => {
    it("returns four alphas with verification badges (no alphas file → all missing)", async () => {
      const res = mockRes();
      await handleAlphas(root, docPath, mockReq("/__archik/alphas"), res);
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res._body);
      expect(body.ok).toBe(true);
      expect(body.file).toBeNull();
      expect(body.alphas).toHaveLength(4);
      expect(body.alphas.every(
        (a: { verification: string }) => a.verification === "missing",
      )).toBe(true);
    });

    it("verifies a claim that holds against current artifacts", async () => {
      await writeFile(
        path.join(root, ".archik/alphas.archik.alphas.yaml"),
        `version: "1.0"\nalphas:\n  requirements:\n    state: acceptable\n`,
      );
      const res = mockRes();
      await handleAlphas(root, docPath, mockReq("/__archik/alphas"), res);
      const body = JSON.parse(res._body);
      const req = body.alphas.find(
        (a: { alpha: string }) => a.alpha === "requirements",
      );
      expect(req.verification).toBe("verified");
    });

    it("flags an over-claimed state with a reason", async () => {
      await writeFile(
        path.join(root, ".archik/alphas.archik.alphas.yaml"),
        `version: "1.0"\nalphas:\n  softwareSystem:\n    state: ready\n`,
      );
      // Drop a stereotype so the trace shows partial → "ready" fails.
      await writeFile(
        docPath,
        minimalArch.replace("    stereotype: boundary\n", ""),
      );
      const res = mockRes();
      await handleAlphas(root, docPath, mockReq("/__archik/alphas"), res);
      const body = JSON.parse(res._body);
      const ss = body.alphas.find(
        (a: { alpha: string }) => a.alpha === "softwareSystem",
      );
      expect(ss.verification).toBe("over-claimed");
      expect(ss.reason).toBeTruthy();
    });

    it("returns 405 on non-GET", async () => {
      const res = mockRes();
      await handleAlphas(
        root,
        docPath,
        mockReq("/__archik/alphas", "PUT"),
        res,
      );
      expect(res.statusCode).toBe(405);
    });
  });

  describe("handleTrace", () => {
    it("emits the full TraceMatrix shape", async () => {
      const res = mockRes();
      await handleTrace(root, docPath, mockReq("/__archik/trace"), res);
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res._body);
      expect(body.ok).toBe(true);
      expect(body.summary.slices).toBe(1);
      expect(body.rows[0].useCase).toBe("place-order");
      expect(body.rows[0].level).toBe("full");
    });

    it("filters by ?use-case=", async () => {
      const res = mockRes();
      await handleTrace(
        root,
        docPath,
        mockReq("/__archik/trace?use-case=ghost"),
        res,
      );
      const body = JSON.parse(res._body);
      expect(body.summary.slices).toBe(0);
    });

    it("filters by ?coverage=full", async () => {
      const res = mockRes();
      await handleTrace(
        root,
        docPath,
        mockReq("/__archik/trace?coverage=full"),
        res,
      );
      const body = JSON.parse(res._body);
      expect(body.summary.slices).toBe(1);
    });

    it("rejects invalid ?status=", async () => {
      const res = mockRes();
      await handleTrace(
        root,
        docPath,
        mockReq("/__archik/trace?status=weird"),
        res,
      );
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res._body);
      expect(body.ok).toBe(false);
    });

    it("returns 405 on non-GET", async () => {
      const res = mockRes();
      await handleTrace(
        root,
        docPath,
        mockReq("/__archik/trace", "POST"),
        res,
      );
      expect(res.statusCode).toBe(405);
    });
  });
});
