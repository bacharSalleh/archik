import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { App } from "./App.tsx";
import { stringifyYaml } from "../io/yaml.ts";
import { ordersDocument } from "../domain/__fixtures__/orders.ts";
import { emitDocumentChanged } from "../io/liveReload.ts";

const SUGGESTION_URL = "/architecture.archik.suggested.yaml";

/**
 * Wrap the original fetch with a router that always 404s the
 * suggestion-sidecar URL so App's pending-suggestion poll doesn't
 * consume one of the test's mocked-doc responses. Each test still
 * controls the main /architecture.archik.yaml call via its own
 * mockResolvedValueOnce on globalThis.fetch.
 */
function mockFetchWithSuggestionDisabled(...mainResponses: Response[]) {
  let mainCalls = 0;
  const impl = async (
    input: URL | RequestInfo,
    _init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    if (url.includes(SUGGESTION_URL)) {
      return { ok: false, status: 404, statusText: "Not Found" } as Response;
    }
    // The file-switcher fetches the project's archik-file list on
    // mount and on every doc/suggestion-changed event. Tests don't
    // care about that surface — return an empty list so it's harmless.
    if (url.includes("/__archik/files")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ files: [] }),
      } as unknown as Response;
    }
    // UseCasesPanel fetches usecases + trace on app mount so the
    // toolbar trigger button can show "am I done?" without the user
    // opening the popover. Tests don't drive that surface — return
    // empty payloads so the mount fetch is harmless.
    if (url.includes("/__archik/usecases")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, useCases: [] }),
      } as unknown as Response;
    }
    if (url.includes("/__archik/trace")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, rows: [] }),
      } as unknown as Response;
    }
    const next = mainResponses[mainCalls++];
    if (next === undefined) {
      throw new Error(`unexpected fetch to ${url} (no more mocked responses)`);
    }
    return next;
  };
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(impl as typeof globalThis.fetch);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("renders the project name and the document name once loaded", async () => {
    mockFetchWithSuggestionDisabled({
      ok: true,
      text: async () => stringifyYaml(ordersDocument),
    } as Response);

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText("Archik")).toBeInTheDocument();
    });
    expect(screen.getByText(ordersDocument.name)).toBeInTheDocument();
  });

  it("shows an error if the document fails to load", async () => {
    mockFetchWithSuggestionDisabled({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as Response);

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/404/)).toBeInTheDocument();
    });
  });

  it("refetches the document when emitDocumentChanged fires", async () => {
    const renamed = { ...ordersDocument, name: "Live-reloaded" };
    const fetchSpy = mockFetchWithSuggestionDisabled(
      {
        ok: true,
        text: async () => stringifyYaml(ordersDocument),
      } as Response,
      {
        ok: true,
        text: async () => stringifyYaml(renamed),
      } as Response,
    );

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(ordersDocument.name)).toBeInTheDocument();
    });

    emitDocumentChanged();

    await waitFor(() => {
      expect(screen.getByText(renamed.name)).toBeInTheDocument();
    });
    // Two main-doc fetches plus any number of suggestion 404s,
    // file-list calls, and use-case/trace mounts — only assert the
    // doc fetches landed.
    const mainCalls = fetchSpy.mock.calls.filter(([input]) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      return (
        !url.includes(SUGGESTION_URL) &&
        !url.includes("/__archik/files") &&
        !url.includes("/__archik/usecases") &&
        !url.includes("/__archik/trace")
      );
    });
    expect(mainCalls).toHaveLength(2);
  });
});
