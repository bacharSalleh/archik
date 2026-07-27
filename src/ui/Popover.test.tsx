import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Popover, popoverShift } from "./Popover.tsx";

function make(align?: "start" | "end"): ReturnType<typeof render> {
  const trigger = (open: boolean): React.ReactNode => (
    <button type="button" aria-expanded={open}>
      Toggle
    </button>
  );
  const children = (): React.ReactNode => (
    <div data-testid="content">Panel content</div>
  );
  return align === undefined
    ? render(<Popover trigger={trigger}>{children}</Popover>)
    : render(<Popover align={align} trigger={trigger}>{children}</Popover>);
}

describe("Popover", () => {
  it("does not render children when closed", () => {
    make();
    expect(screen.queryByTestId("content")).toBeNull();
  });

  it("renders children after the trigger is clicked", () => {
    make();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("hides children again after a second click (toggle)", () => {
    make();
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByTestId("content")).toBeNull();
  });

  it("closes when Escape is pressed", () => {
    make();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("content")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("content")).toBeNull();
  });

  it("closes when clicking outside the popover", () => {
    make();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("content")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId("content")).toBeNull();
  });

  it("sets right positioning for align='end' (default)", () => {
    make("end");
    fireEvent.click(screen.getByRole("button"));
    const panel = screen.getByTestId("content").parentElement!;
    // jsdom normalises 0 → "0px"
    expect(panel.style.right).toMatch(/^0/);
    expect(panel.style.left).toBe("");
  });

  it("sets left positioning for align='start'", () => {
    make("start");
    fireEvent.click(screen.getByRole("button"));
    const panel = screen.getByTestId("content").parentElement!;
    expect(panel.style.left).toMatch(/^0/);
    expect(panel.style.right).toBe("");
  });

  it("passes the open state to the trigger render prop", () => {
    make();
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });
});

describe("popoverShift", () => {
  it("returns 0 when the popover fits", () => {
    expect(popoverShift({ left: 100, right: 300 }, 1000)).toBe(0);
  });

  it("shifts left when overflowing the right edge", () => {
    // right edge 950 on a 800px viewport with 8px margin → -158
    expect(popoverShift({ left: 700, right: 950 }, 800)).toBe(800 - 8 - 950);
  });

  it("shifts right when overflowing the left edge", () => {
    expect(popoverShift({ left: -50, right: 100 }, 800)).toBe(58);
  });

  it("pins oversized content to the left margin", () => {
    // 1000px wide content in an 800px viewport: right-fix would push it
    // further left than the margin, so the left pin wins.
    expect(popoverShift({ left: 0, right: 1000 }, 800)).toBe(8);
  });

  it("respects a custom margin", () => {
    expect(popoverShift({ left: 700, right: 950 }, 800, 20)).toBe(
      800 - 20 - 950,
    );
  });
});
