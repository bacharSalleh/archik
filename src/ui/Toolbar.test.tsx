import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Toolbar } from "./Toolbar.tsx";
import { ordersDocument } from "../domain/__fixtures__/orders.ts";

/** Minimal props the Toolbar always needs to render. */
const baseProps = {
  document: ordersDocument,
} as const;

describe("Toolbar view controls", () => {
  it("renders a hide-weak-edges toggle and collapse/expand buttons", () => {
    render(
      <Toolbar
        {...baseProps}
        hideStructural={false}
        onToggleHideStructural={() => {}}
        onCollapseAll={() => {}}
        onExpandAll={() => {}}
      />,
    );
    expect(screen.getByLabelText(/hide weak edges/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/collapse all/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/expand all/i)).toBeInTheDocument();
  });

  it("calls the toggle / collapse / expand handlers on click", () => {
    const onToggleHideStructural = vi.fn();
    const onCollapseAll = vi.fn();
    const onExpandAll = vi.fn();
    render(
      <Toolbar
        {...baseProps}
        hideStructural={false}
        onToggleHideStructural={onToggleHideStructural}
        onCollapseAll={onCollapseAll}
        onExpandAll={onExpandAll}
      />,
    );
    fireEvent.click(screen.getByLabelText(/hide weak edges/i));
    fireEvent.click(screen.getByLabelText(/collapse all/i));
    fireEvent.click(screen.getByLabelText(/expand all/i));
    expect(onToggleHideStructural).toHaveBeenCalledTimes(1);
    expect(onCollapseAll).toHaveBeenCalledTimes(1);
    expect(onExpandAll).toHaveBeenCalledTimes(1);
  });

  it("hides the focus depth stepper unless focusDepth is provided", () => {
    const { rerender } = render(
      <Toolbar {...baseProps} onCollapseAll={() => {}} />,
    );
    expect(
      screen.queryByLabelText(/increase focus depth/i),
    ).not.toBeInTheDocument();

    rerender(
      <Toolbar
        {...baseProps}
        onCollapseAll={() => {}}
        focusDepth={1}
        onFocusDepthChange={() => {}}
        onClearFocus={() => {}}
      />,
    );
    expect(
      screen.getByLabelText(/increase focus depth/i),
    ).toBeInTheDocument();
  });

  it("steps focus depth up and down (clamped at 0) and clears focus", () => {
    const onFocusDepthChange = vi.fn();
    const onClearFocus = vi.fn();
    render(
      <Toolbar
        {...baseProps}
        onCollapseAll={() => {}}
        focusDepth={0}
        onFocusDepthChange={onFocusDepthChange}
        onClearFocus={onClearFocus}
      />,
    );
    fireEvent.click(screen.getByLabelText(/increase focus depth/i));
    expect(onFocusDepthChange).toHaveBeenLastCalledWith(1);
    // depth 0 cannot go below 0
    fireEvent.click(screen.getByLabelText(/decrease focus depth/i));
    expect(onFocusDepthChange).toHaveBeenLastCalledWith(0);
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(onClearFocus).toHaveBeenCalledTimes(1);
  });
});
