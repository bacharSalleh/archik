import { describe, it, expect } from "vitest";
import {
  isSuggestion,
  stripSuggestionMarker,
  suggestionPath,
} from "./suggestion.ts";
import type { Document } from "./types.ts";

describe("suggestionPath", () => {
  it("inserts .suggested before the extension", () => {
    expect(suggestionPath("/x/architecture.archik.yaml")).toBe(
      "/x/architecture.archik.suggested.yaml",
    );
  });

  it("works for .json", () => {
    expect(suggestionPath("/x/foo.archik.json")).toBe(
      "/x/foo.archik.suggested.json",
    );
  });

  it("works for a plain extension", () => {
    expect(suggestionPath("/plain.yaml")).toBe("/plain.suggested.yaml");
  });

  it("works when there is no extension", () => {
    expect(suggestionPath("/file")).toBe("/file.suggested");
  });
});

const baseDoc: Document = {
  version: "1.0",
  name: "Demo",
  nodes: [],
  edges: [],
};

describe("isSuggestion", () => {
  it("is false for a vanilla document", () => {
    expect(isSuggestion(baseDoc)).toBe(false);
  });

  it("is false when metadata exists but lacks the suggestion block", () => {
    expect(
      isSuggestion({
        ...baseDoc,
        metadata: { createdAt: "x", updatedAt: "y" },
      }),
    ).toBe(false);
  });

  it("is true when metadata.suggestion is present", () => {
    expect(
      isSuggestion({
        ...baseDoc,
        metadata: {
          suggestion: { from: "a.yaml", at: "2026-01-01T00:00:00Z" },
        },
      }),
    ).toBe(true);
  });
});

describe("stripSuggestionMarker", () => {
  it("removes the suggestion block but keeps other metadata", () => {
    const out = stripSuggestionMarker({
      ...baseDoc,
      metadata: {
        createdAt: "x",
        updatedAt: "y",
        suggestion: { from: "a.yaml", at: "2026-01-01T00:00:00Z" },
      },
    });
    expect(out.metadata).toEqual({ createdAt: "x", updatedAt: "y" });
  });

  it("removes the entire metadata key when only suggestion was there", () => {
    const out = stripSuggestionMarker({
      ...baseDoc,
      metadata: {
        suggestion: { from: "a.yaml", at: "2026-01-01T00:00:00Z" },
      },
    });
    expect(out.metadata).toBeUndefined();
  });

  it("is a no-op when no suggestion block exists", () => {
    expect(stripSuggestionMarker(baseDoc)).toEqual(baseDoc);
  });
});
