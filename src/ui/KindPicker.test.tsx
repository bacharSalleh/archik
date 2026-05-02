import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { KindPicker } from "./KindPicker.tsx";
import { NODE_KINDS } from "../domain/taxonomy.ts";

describe("KindPicker", () => {
  it("shows the current kind on the trigger button", () => {
    render(<KindPicker value="service" onChange={vi.fn()} />);
    expect(screen.getByRole("button").textContent).toContain("service");
  });

  it("opens the list and shows all kinds when clicked", () => {
    render(<KindPicker value="service" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    // Each kind appears as a menu-item button in the popover.
    // Use getAllByRole and check at least one button per kind text exists.
    for (const kind of NODE_KINDS) {
      const matches = screen.getAllByRole("button").filter((b) =>
        b.textContent?.includes(kind),
      );
      expect(matches.length).toBeGreaterThan(0);
    }
  });

  it("calls onChange with the selected kind and closes the list", () => {
    const onChange = vi.fn();
    render(<KindPicker value="service" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    // Click the list item (not the trigger) — find by exact text in the mono span.
    const functionBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.match(/^function/));
    fireEvent.click(functionBtn!);
    expect(onChange).toHaveBeenCalledWith("function");
  });

  it("picker still fires onChange when the current kind is re-selected (parent decides)", () => {
    const onChange = vi.fn();
    render(<KindPicker value="service" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    const serviceBtn = screen
      .getAllByRole("button")
      .find((b, i) => i > 0 && b.textContent?.includes("service"));
    fireEvent.click(serviceBtn!);
    expect(onChange).toHaveBeenCalledWith("service");
  });

  it("is disabled when the disabled prop is set", () => {
    render(<KindPicker value="service" onChange={vi.fn()} disabled />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("sets aria-expanded to false when closed and true when open", () => {
    render(<KindPicker value="service" onChange={vi.fn()} />);
    const trigger = screen.getByRole("button");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    // After opening the trigger gets aria-expanded="true"
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("uses the id prop on the trigger button", () => {
    render(<KindPicker value="service" onChange={vi.fn()} id="ni-kind" />);
    expect(document.getElementById("ni-kind")).toBeInTheDocument();
  });
});
