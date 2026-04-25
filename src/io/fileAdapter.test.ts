import { describe, it, expect, vi, afterEach } from "vitest";
import {
  detectFormat,
  loadDocumentFromUrl,
  loadDocumentFromUrlWithText,
  saveDocumentToUrl,
  serializeDocument,
} from "./fileAdapter.ts";
import { ordersDocument } from "../domain/__fixtures__/orders.ts";
import { stringifyYaml } from "./yaml.ts";
import { stringifyJson } from "./json.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("detectFormat", () => {
  it.each([
    ["foo.yaml", "yaml"],
    ["foo.YAML", "yaml"],
    ["nested/path/foo.yml", "yaml"],
    ["foo.archik.yaml", "yaml"],
    ["foo.json", "json"],
    ["nested/foo.JSON", "json"],
    ["http://example.com/doc.yaml?ts=123", "yaml"],
    ["http://example.com/doc.json#anchor", "json"],
  ] as const)("infers format from %s as %s", (path, expected) => {
    expect(detectFormat(path)).toBe(expected);
  });

  it("throws when the format is unknown", () => {
    expect(() => detectFormat("foo.txt")).toThrow(/format/i);
  });
});

describe("serializeDocument", () => {
  it("serializes to YAML", () => {
    expect(serializeDocument(ordersDocument, "yaml")).toBe(
      stringifyYaml(ordersDocument),
    );
  });

  it("serializes to JSON", () => {
    expect(serializeDocument(ordersDocument, "json")).toBe(
      stringifyJson(ordersDocument),
    );
  });
});

describe("loadDocumentFromUrl", () => {
  it("fetches a YAML document and returns the parsed Document", async () => {
    const yaml = stringifyYaml(ordersDocument);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      text: async () => yaml,
    } as Response);
    const doc = await loadDocumentFromUrl("/architecture.archik.yaml");
    expect(doc).toEqual(ordersDocument);
  });

  it("fetches a JSON document and returns the parsed Document", async () => {
    const json = stringifyJson(ordersDocument);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      text: async () => json,
    } as Response);
    const doc = await loadDocumentFromUrl("/architecture.json");
    expect(doc).toEqual(ordersDocument);
  });

  it("throws a helpful error on a non-OK response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as Response);
    await expect(loadDocumentFromUrl("/missing.yaml")).rejects.toThrow(
      /404/,
    );
  });

  it("propagates parse errors with the source URL in the message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      text: async () => `version: "9.9"\nname: bad\nnodes: []\nedges: []\n`,
    } as Response);
    await expect(loadDocumentFromUrl("/bad.yaml")).rejects.toThrow(
      /bad\.yaml/,
    );
  });
});

describe("loadDocumentFromUrlWithText", () => {
  it("returns both the parsed document and its raw text", async () => {
    const yaml = stringifyYaml(ordersDocument);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      text: async () => yaml,
    } as Response);
    const out = await loadDocumentFromUrlWithText(
      "/architecture.archik.yaml",
    );
    expect(out.document).toEqual(ordersDocument);
    expect(out.text).toBe(yaml);
  });
});

describe("saveDocumentToUrl", () => {
  it("PUTs the serialized document and returns the text", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: true } as Response);
    const out = await saveDocumentToUrl(
      "/architecture.archik.yaml",
      ordersDocument,
    );
    expect(out.text).toBe(stringifyYaml(ordersDocument));
    const [, init] = fetchSpy.mock.calls[0]!;
    expect(init?.method).toBe("PUT");
    expect(init?.body).toBe(stringifyYaml(ordersDocument));
  });

  it("throws on a non-OK response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal",
    } as Response);
    await expect(
      saveDocumentToUrl("/architecture.archik.yaml", ordersDocument),
    ).rejects.toThrow(/500/);
  });
});
