import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CopyButton } from "./CopyButton.tsx";
import { yamlExporter } from "../io/exporters.ts";
import { ordersDocument } from "../domain/__fixtures__/orders.ts";
import { stringifyYaml } from "../io/yaml.ts";

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  Object.defineProperty(globalThis.navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

afterEach(() => {
  writeText.mockClear();
});

describe("CopyButton", () => {
  it("labels itself with the exporter's label", () => {
    render(<CopyButton exporter={yamlExporter} document={ordersDocument} />);
    expect(screen.getByRole("button", { name: /yaml/i })).toBeInTheDocument();
  });

  it("writes the exporter's output to the clipboard on click", async () => {
    render(<CopyButton exporter={yamlExporter} document={ordersDocument} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(stringifyYaml(ordersDocument)),
    );
  });

  it("shows a 'Copied' state immediately after click", async () => {
    render(<CopyButton exporter={yamlExporter} document={ordersDocument} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByRole("button").textContent).toMatch(/copied/i);
    });
  });
});
