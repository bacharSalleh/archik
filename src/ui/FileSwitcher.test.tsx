import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FileSwitcher, type FileEntry } from "./FileSwitcher.tsx";

const mainFile: FileEntry = {
  path: "architecture.archik.yaml",
  name: "main",
  hasSuggestion: false,
  isRoot: true,
};

const ordersFile: FileEntry = {
  path: ".archik/orders.archik.yaml",
  name: "orders",
  hasSuggestion: true,
  isRoot: false,
};

const paymentsFile: FileEntry = {
  path: ".archik/payments.archik.yaml",
  name: "payments",
  hasSuggestion: false,
  isRoot: false,
};

describe("FileSwitcher", () => {
  it("renders nothing when there's only one file (no useful switch)", () => {
    const { container } = render(
      <FileSwitcher
        files={[mainFile]}
        currentPath={mainFile.path}
        onSwitchFile={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows the current file's name on the trigger button", () => {
    render(
      <FileSwitcher
        files={[mainFile, ordersFile]}
        currentPath={ordersFile.path}
        onSwitchFile={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /switch architecture file/i }),
    ).toHaveTextContent(/orders/i);
  });

  it("opens a list of files and calls onSwitchFile when a different one is picked", () => {
    const onSwitchFile = vi.fn();
    render(
      <FileSwitcher
        files={[mainFile, ordersFile, paymentsFile]}
        currentPath={mainFile.path}
        onSwitchFile={onSwitchFile}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /switch architecture file/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /payments/i }));
    expect(onSwitchFile).toHaveBeenCalledWith(paymentsFile);
  });

  it("does not invoke onSwitchFile when the current file is re-selected", () => {
    const onSwitchFile = vi.fn();
    render(
      <FileSwitcher
        files={[mainFile, ordersFile]}
        currentPath={mainFile.path}
        onSwitchFile={onSwitchFile}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /switch architecture file/i }),
    );
    // Click the currently-selected entry — should be a no-op
    const mainEntry = screen
      .getAllByRole("button")
      .find((b) => /^main/i.test(b.textContent ?? ""));
    if (!mainEntry) throw new Error("expected a 'main' entry in the dropdown");
    fireEvent.click(mainEntry);
    expect(onSwitchFile).not.toHaveBeenCalled();
  });
});
