import { describe, expect, it } from "vitest";
import { exportFilename } from "./canvasExport.ts";

describe("exportFilename", () => {
  it("converts .archik/main.archik.yaml to main.archik.svg", () => {
    expect(exportFilename(".archik/main.archik.yaml", "svg")).toBe(
      "main.archik.svg",
    );
  });

  it("converts .archik/main.archik.yaml to main.archik.png", () => {
    expect(exportFilename(".archik/main.archik.yaml", "png")).toBe(
      "main.archik.png",
    );
  });

  it("handles the legacy root path architecture.archik.yaml", () => {
    expect(exportFilename("architecture.archik.yaml", "svg")).toBe(
      "architecture.archik.svg",
    );
  });

  it("strips a leading dot from a dotfile stem", () => {
    // path.basename(".archik/main.archik.yaml") = "main.archik.yaml"
    // The dot-strip only applies to a leading dot in the whole basename,
    // e.g. ".hidden.yaml" → "hidden.yaml.svg" is the contract.
    expect(exportFilename(".hidden.archik.yaml", "svg")).toBe(
      "hidden.archik.svg",
    );
  });

  it("works with an absolute path", () => {
    expect(
      exportFilename("/home/user/.archik/payments.archik.yaml", "png"),
    ).toBe("payments.archik.png");
  });

  it("accepts .yml extension as well", () => {
    expect(exportFilename("diagram.archik.yml", "svg")).toBe(
      "diagram.archik.svg",
    );
  });
});
