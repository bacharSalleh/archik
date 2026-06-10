import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import YAML from "yaml";
import { importCommand } from "./import.ts";

const composeYaml = [
  "services:",
  "  api:",
  "    build: ./api",
  "    depends_on: [db]",
  "  db:",
  "    image: postgres:16",
  "",
].join("\n");

describe("importCommand", () => {
  let cwd: string;
  let originalCwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), "archik-import-"));
    await mkdir(path.join(cwd, "api"));
    await writeFile(path.join(cwd, "docker-compose.yml"), composeYaml);
    originalCwd = process.cwd();
    process.chdir(cwd);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    logSpy.mockRestore();
    errSpy.mockRestore();
    await rm(cwd, { recursive: true, force: true });
  });

  it("prints valid archik YAML to stdout by default", async () => {
    const code = await importCommand({ _: ["compose"] });
    expect(code).toBe(0);
    const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    const doc = YAML.parse(out);
    expect(doc.nodes.map((n: { id: string }) => n.id)).toEqual(["api", "db"]);
    expect(doc.nodes[0].sourcePath).toBe("api");
    expect(doc.edges[0]).toMatchObject({ from: "api", to: "db" });
  });

  it("writes to --out and refuses to overwrite without --force", async () => {
    const code = await importCommand({
      _: ["compose"],
      out: ".archik/main.archik.yaml",
    });
    expect(code).toBe(0);
    const written = await readFile(
      path.join(cwd, ".archik/main.archik.yaml"),
      "utf-8",
    );
    expect(YAML.parse(written).nodes).toHaveLength(2);

    const again = await importCommand({
      _: ["compose"],
      out: ".archik/main.archik.yaml",
    });
    expect(again).toBe(1);
    const err = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(err).toContain("--force");

    const forced = await importCommand({
      _: ["compose"],
      out: ".archik/main.archik.yaml",
      force: "true",
    });
    expect(forced).toBe(0);
  });

  it("errors when no compose file exists", async () => {
    await rm(path.join(cwd, "docker-compose.yml"));
    const code = await importCommand({ _: ["compose"] });
    expect(code).toBe(1);
    const err = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(err).toContain("no compose file found");
  });

  it("errors on an unknown subcommand", async () => {
    const code = await importCommand({ _: ["terraform"] });
    expect(code).toBe(2);
  });
});
