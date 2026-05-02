import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { ExportMenu } from "./ExportMenu.tsx";
import type { Document } from "../domain/types.ts";

vi.mock("../io/fileAdapter.ts", () => ({
  saveDocumentAsDownload: vi.fn(),
}));
vi.mock("../io/canvasExport.ts", () => ({
  downloadBlob: vi.fn(),
  exportFilename: vi.fn((filename: string, ext: string) => `${filename}.${ext}`),
  snapshotSvgBlob: vi.fn(() => new Blob(["<svg/>"], { type: "image/svg+xml" })),
  snapshotPngBlob: vi.fn(() => Promise.resolve(new Blob(["png"], { type: "image/png" }))),
}));

import { saveDocumentAsDownload } from "../io/fileAdapter.ts";
import { downloadBlob } from "../io/canvasExport.ts";

const writeText = vi.fn().mockResolvedValue(undefined);

const doc: Document = {
  version: "1.0",
  name: "Orders",
  nodes: [{ id: "api", kind: "external", name: "API", description: "test fixture" }],
  edges: [],
};

describe("ExportMenu", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });

  afterEach(() => {
    writeText.mockClear();
    vi.clearAllMocks();
  });

  it("renders the Export trigger button", () => {
    render(<ExportMenu document={doc} filename="orders" />);
    expect(screen.getByRole("button", { name: /export/i })).toBeInTheDocument();
  });

  it("opens the menu when the trigger is clicked", () => {
    render(<ExportMenu document={doc} filename="orders" />);
    fireEvent.click(screen.getByRole("button", { name: /export/i }));
    expect(screen.getAllByText("YAML").length).toBeGreaterThan(0);
    expect(screen.getByText("JSON")).toBeInTheDocument();
    expect(screen.getByText("Markdown")).toBeInTheDocument();
  });

  it("hides SVG and PNG download buttons when getSvg is not provided", () => {
    render(<ExportMenu document={doc} filename="orders" />);
    fireEvent.click(screen.getByRole("button", { name: /export/i }));
    expect(screen.queryByRole("button", { name: /svg/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /png/i })).not.toBeInTheDocument();
  });

  it("shows SVG and PNG download buttons when getSvg is provided", () => {
    const mockSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    render(<ExportMenu document={doc} filename="orders" getSvg={() => mockSvg} />);
    fireEvent.click(screen.getByRole("button", { name: /export/i }));
    expect(screen.getByRole("button", { name: /svg/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /png/i })).toBeInTheDocument();
  });

  it("writes YAML to clipboard when Copy YAML is clicked", async () => {
    render(<ExportMenu document={doc} filename="orders" />);
    fireEvent.click(screen.getByRole("button", { name: /export/i }));
    const yamlButtons = screen.getAllByRole("button");
    const copyYaml = yamlButtons.find((b) => b.textContent?.includes("YAML") && b.textContent?.includes("Copy"));
    fireEvent.click(copyYaml!);
    expect(writeText).toHaveBeenCalledOnce();
    const written = writeText.mock.calls[0]![0] as string;
    expect(written).toContain("Orders");
  });

  it("calls saveDocumentAsDownload when Download YAML is clicked", () => {
    render(<ExportMenu document={doc} filename="orders" />);
    fireEvent.click(screen.getByRole("button", { name: /export/i }));
    const buttons = screen.getAllByRole("button");
    const downloadYaml = buttons.find((b) => b.textContent?.includes("YAML") && b.textContent?.includes("Download"));
    fireEvent.click(downloadYaml!);
    expect(saveDocumentAsDownload).toHaveBeenCalledWith("orders", doc);
  });

  it("calls downloadBlob when Download SVG is clicked", () => {
    const mockSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    render(<ExportMenu document={doc} filename="orders" getSvg={() => mockSvg} />);
    fireEvent.click(screen.getByRole("button", { name: /export/i }));
    fireEvent.click(screen.getByRole("button", { name: /svg/i }));
    expect(downloadBlob).toHaveBeenCalled();
  });
});
