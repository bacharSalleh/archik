import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Legend } from "./Legend.tsx";
import { NODE_KINDS } from "../domain/taxonomy.ts";

describe("Legend", () => {
  it("renders a trigger button labelled 'Legend'", () => {
    render(<Legend />);
    expect(screen.getByRole("button")).toHaveTextContent(/Legend/);
  });

  it("does not show kind list before the trigger is clicked", () => {
    render(<Legend />);
    // Pick a kind we know is in the list — should not be visible yet
    expect(screen.queryByText(/service/i)).toBeNull();
  });

  it("shows every node kind after clicking the trigger", () => {
    render(<Legend />);
    fireEvent.click(screen.getByRole("button"));
    for (const kind of NODE_KINDS) {
      expect(screen.getByText(kind)).toBeInTheDocument();
    }
  });

  it("shows description text beyond just the kind names", () => {
    const { container } = render(<Legend />);
    fireEvent.click(screen.getByRole("button"));
    // The panel has kind names + description prose — total text is substantially
    // longer than just the concatenated kind names.
    const allText = container.textContent ?? "";
    const kindNamesOnly = NODE_KINDS.join("");
    expect(allText.length).toBeGreaterThan(kindNamesOnly.length * 2);
  });

  it("trigger aria-expanded is false when closed and true when open", () => {
    render(<Legend />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });
});
