import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { NodeInspector } from "./NodeInspector.tsx";
import type { Node } from "../domain/types.ts";

const apiNode: Node = {
  id: "api",
  kind: "service",
  name: "Orders API",
  stack: "Go",
  description: "Owns order lifecycle",
};

describe("NodeInspector", () => {
  it("shows an empty state when no node is selected", () => {
    render(<NodeInspector node={undefined} dispatch={vi.fn()} />);
    expect(screen.getByText(/select a node/i)).toBeInTheDocument();
  });

  it("populates form fields from the node", () => {
    render(<NodeInspector node={apiNode} dispatch={vi.fn()} />);
    expect(
      (screen.getByLabelText(/name/i) as HTMLInputElement).value,
    ).toBe("Orders API");
    expect(
      (screen.getByLabelText(/stack/i) as HTMLInputElement).value,
    ).toBe("Go");
    expect(
      (screen.getByLabelText(/description/i) as HTMLTextAreaElement).value,
    ).toBe("Owns order lifecycle");
  });

  it("dispatches update_node when the name changes", () => {
    const dispatch = vi.fn();
    render(<NodeInspector node={apiNode} dispatch={dispatch} />);
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "Renamed API" },
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "update_node",
      id: "api",
      patch: { name: "Renamed API" },
    });
  });

  it("dispatches update_node when the kind changes", () => {
    const dispatch = vi.fn();
    render(<NodeInspector node={apiNode} dispatch={dispatch} />);
    // KindPicker is a button that opens a popover with kind options.
    fireEvent.click(screen.getByLabelText(/kind/i));
    fireEvent.click(screen.getByRole("button", { name: /^function/i }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "update_node",
      id: "api",
      patch: { kind: "function" },
    });
  });

  it("dispatches update_node when stack changes", () => {
    const dispatch = vi.fn();
    render(<NodeInspector node={apiNode} dispatch={dispatch} />);
    fireEvent.change(screen.getByLabelText(/stack/i), {
      target: { value: "Rust" },
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "update_node",
      id: "api",
      patch: { stack: "Rust" },
    });
  });

  it("dispatches remove_node when the delete button is clicked", () => {
    const dispatch = vi.fn();
    render(<NodeInspector node={apiNode} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "remove_node", id: "api" });
  });

  it("shows the node id (read-only)", () => {
    render(<NodeInspector node={apiNode} dispatch={vi.fn()} />);
    expect(screen.getByText("api")).toBeInTheDocument();
  });

  it("offers other nodes as parent options", () => {
    const allNodes = [
      apiNode,
      { id: "platform", kind: "custom" as const, name: "Platform" },
    ];
    render(
      <NodeInspector
        node={apiNode}
        dispatch={vi.fn()}
        allNodes={allNodes}
      />,
    );
    const select = screen.getByLabelText(/parent/i) as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toContain("");
    expect(optionValues).toContain("platform");
    expect(optionValues).not.toContain("api");
  });

  it("dispatches update_node with parentId when a parent is chosen", () => {
    const dispatch = vi.fn();
    const allNodes = [
      apiNode,
      { id: "platform", kind: "custom" as const, name: "Platform" },
    ];
    render(
      <NodeInspector
        node={apiNode}
        dispatch={dispatch}
        allNodes={allNodes}
      />,
    );
    fireEvent.change(screen.getByLabelText(/parent/i), {
      target: { value: "platform" },
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "update_node",
      id: "api",
      patch: { parentId: "platform" },
    });
  });

  it("dispatches update_node clearing parentId when '(none)' is chosen", () => {
    const dispatch = vi.fn();
    const child: Node = { ...apiNode, parentId: "platform" };
    const allNodes = [
      child,
      { id: "platform", kind: "custom" as const, name: "Platform" },
    ];
    render(
      <NodeInspector node={child} dispatch={dispatch} allNodes={allNodes} />,
    );
    fireEvent.change(screen.getByLabelText(/parent/i), {
      target: { value: "" },
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "update_node",
      id: "api",
      patch: { parentId: undefined },
    });
  });
});
