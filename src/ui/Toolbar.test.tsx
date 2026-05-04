import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Toolbar } from "./Toolbar.tsx";
import type { Document } from "../domain/types.ts";

/**
 * Toolbar focus tests for the M5c robustness-mode toggle. The other
 * toolbar wiring (save, view, export, etc.) is covered indirectly
 * through App.test.tsx; this file pins:
 *   - the toggle is hidden when no nodes are stereotyped
 *   - the toggle reflects + flips the prop on click
 *   - aria-pressed mirrors the active state
 */

const document: Document = {
  version: "1.0",
  name: "Demo",
  nodes: [],
  edges: [],
};

describe("Toolbar — robustness toggle", () => {
  it("hides the toggle when stereotypedCount is 0", () => {
    render(
      <Toolbar
        document={document}
        onToggleRobustness={() => {}}
        stereotypedCount={0}
      />,
    );
    expect(
      screen.queryByLabelText(/toggle robustness view/i),
    ).toBeNull();
  });

  it("hides the toggle when no callback is provided", () => {
    render(<Toolbar document={document} stereotypedCount={3} />);
    expect(
      screen.queryByLabelText(/toggle robustness view/i),
    ).toBeNull();
  });

  it("shows the toggle when stereotypedCount > 0 and a callback is provided", () => {
    render(
      <Toolbar
        document={document}
        onToggleRobustness={() => {}}
        stereotypedCount={3}
      />,
    );
    const btn = screen.getByLabelText(/toggle robustness view/i);
    expect(btn).toBeInTheDocument();
    // React renders aria-pressed={false} as no attribute. The contract
    // we need is "not pressed" — anything other than "true" satisfies it.
    expect(btn.getAttribute("aria-pressed")).not.toBe("true");
  });

  it("reflects robustnessMode in aria-pressed", () => {
    render(
      <Toolbar
        document={document}
        onToggleRobustness={() => {}}
        stereotypedCount={3}
        robustnessMode
      />,
    );
    expect(
      screen.getByLabelText(/toggle robustness view/i).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("calls the toggle callback on click", () => {
    const onToggle = vi.fn();
    render(
      <Toolbar
        document={document}
        onToggleRobustness={onToggle}
        stereotypedCount={3}
      />,
    );
    fireEvent.click(screen.getByLabelText(/toggle robustness view/i));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("title hints differ between active and inactive states", () => {
    const { rerender } = render(
      <Toolbar
        document={document}
        onToggleRobustness={() => {}}
        stereotypedCount={4}
      />,
    );
    expect(
      screen.getByLabelText(/toggle robustness view/i).getAttribute("title"),
    ).toMatch(/4 stereotyped nodes/);
    rerender(
      <Toolbar
        document={document}
        onToggleRobustness={() => {}}
        stereotypedCount={4}
        robustnessMode
      />,
    );
    expect(
      screen.getByLabelText(/toggle robustness view/i).getAttribute("title"),
    ).toMatch(/Exit robustness view/);
  });
});
