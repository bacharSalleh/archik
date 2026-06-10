import { describe, expect, it, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SearchBox } from "./SearchBox.tsx";
import { useUIStore } from "./store.ts";
import type { Document } from "../domain/types.ts";

const doc: Document = {
  version: "1.0",
  name: "Demo",
  nodes: [
    { id: "orders-api", kind: "service", name: "Orders API", description: "owns orders", owner: "team-core" },
    { id: "payments-db", kind: "database", name: "Payments DB", description: "stores payments" },
    { id: "web", kind: "frontend", name: "Storefront", description: "the shop UI" },
  ],
  edges: [],
};

describe("SearchBox", () => {
  beforeEach(() => {
    useUIStore.setState({ selection: [], connectFrom: null });
  });

  const input = (): HTMLElement => screen.getByRole("combobox");

  it("shows matching results while typing", () => {
    render(<SearchBox document={doc} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "orders" } });
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByText("orders-api")).toBeInTheDocument();
    expect(screen.queryByText("web")).toBeNull();
  });

  it("matches by owner and description", () => {
    render(<SearchBox document={doc} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "team-core" } });
    expect(screen.getByText("orders-api")).toBeInTheDocument();
    fireEvent.change(input(), { target: { value: "shop UI" } });
    expect(screen.getByText("web")).toBeInTheDocument();
  });

  it("selects the active result on Enter and clears", () => {
    render(<SearchBox document={doc} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "payments" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(useUIStore.getState().selection).toEqual([
      { type: "node", id: "payments-db" },
    ]);
    expect((input() as HTMLInputElement).value).toBe("");
  });

  it("navigates results with arrow keys", () => {
    render(<SearchBox document={doc} />);
    fireEvent.focus(input());
    // Both orders-api ("owns orders") and payments-db / web don't match
    // "o" uniformly — use a query that hits two nodes by name.
    fireEvent.change(input(), { target: { value: "s" } });
    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThan(1);
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: "Enter" });
    const picked = useUIStore.getState().selection[0];
    expect(picked?.type).toBe("node");
  });

  it("selects a result on click", () => {
    render(<SearchBox document={doc} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "storefront" } });
    fireEvent.mouseDown(screen.getByText("web").closest("button")!);
    expect(useUIStore.getState().selection).toEqual([
      { type: "node", id: "web" },
    ]);
  });

  it("focuses the input on the / shortcut", () => {
    render(<SearchBox document={doc} />);
    fireEvent.keyDown(window, { key: "/" });
    expect(document_active()).toBe(input());
  });

  it("does not steal / from other inputs", () => {
    render(
      <div>
        <input aria-label="other" />
        <SearchBox document={doc} />
      </div>,
    );
    const other = screen.getByLabelText("other");
    other.focus();
    fireEvent.keyDown(other, { key: "/" });
    expect(document_active()).toBe(other);
  });
});

function document_active(): Element | null {
  return globalThis.document.activeElement;
}
