import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Popover } from "./Popover.tsx";

function make(align?: "start" | "end"): ReturnType<typeof render> {
  return render(
    <Popover
      align={align}
      trigger={(open) => (
        <button type="button" aria-expanded={open}>
          Toggle
        </button>
      )}
    >
      {() => <div data-testid="content">Panel content</div>}
    </Popover>,
  );
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
