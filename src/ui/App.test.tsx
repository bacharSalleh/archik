import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { App } from "./App.tsx";
import { stringifyYaml } from "../io/yaml.ts";
import { ordersDocument } from "../domain/__fixtures__/orders.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("renders the project name and the document name once loaded", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
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
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as Response);

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/404/)).toBeInTheDocument();
    });
  });
});
