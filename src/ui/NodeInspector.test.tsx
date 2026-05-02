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
      { id: "platform", kind: "custom" as const, name: "Platform", description: "test fixture" },
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
      { id: "platform", kind: "custom" as const, name: "Platform", description: "test fixture" },
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

  it("disables every field and hides delete in readOnly mode", () => {
    render(<NodeInspector node={apiNode} dispatch={vi.fn()} readOnly />);
    expect(screen.getByLabelText(/name/i)).toBeDisabled();
    expect(screen.getByLabelText(/stack/i)).toBeDisabled();
    expect(screen.getByLabelText(/description/i)).toBeDisabled();
    expect(screen.getByLabelText(/parent/i)).toBeDisabled();
    expect(screen.getByLabelText(/kind/i)).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /delete/i }),
    ).not.toBeInTheDocument();
  });

  it("hides add/remove buttons and disables inputs for responsibilities in readOnly mode", () => {
    const nodeWithResp: Node = { ...apiNode, responsibilities: ["accept orders"] };
    render(<NodeInspector node={nodeWithResp} dispatch={vi.fn()} readOnly />);
    expect(screen.queryByRole("button", { name: /add responsibility/i })).not.toBeInTheDocument();
    expect(screen.queryByTitle(/remove responsibility/i)).not.toBeInTheDocument();
    const inputs = screen.getAllByPlaceholderText(/responsibility/i);
    expect(inputs[0]).toBeDisabled();
  });

  it("hides add/remove buttons and disables inputs for notes in readOnly mode", () => {
    const nodeWithNotes: Node = { ...apiNode, notes: ["check the runbook"] };
    render(<NodeInspector node={nodeWithNotes} dispatch={vi.fn()} readOnly />);
    expect(screen.queryByRole("button", { name: /add note/i })).not.toBeInTheDocument();
    expect(screen.queryByTitle(/remove note/i)).not.toBeInTheDocument();
    const textareas = screen.getAllByPlaceholderText(/^note/i);
    expect(textareas[0]).toBeDisabled();
  });

  it("renders existing responsibilities and allows adding a new one", () => {
    const dispatch = vi.fn();
    const nodeWithResp: Node = {
      ...apiNode,
      responsibilities: ["accept orders", "emit events"],
    };
    render(<NodeInspector node={nodeWithResp} dispatch={dispatch} />);
    expect(screen.getByDisplayValue("accept orders")).toBeInTheDocument();
    expect(screen.getByDisplayValue("emit events")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add responsibility/i }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "update_node",
      id: "api",
      patch: { responsibilities: ["accept orders", "emit events", ""] },
    });
  });

  it("dispatches update_node when a responsibility is edited", () => {
    const dispatch = vi.fn();
    const nodeWithResp: Node = {
      ...apiNode,
      responsibilities: ["accept orders"],
    };
    render(<NodeInspector node={nodeWithResp} dispatch={dispatch} />);
    const inputs = screen.getAllByPlaceholderText(/responsibility/i);
    fireEvent.change(inputs[0]!, { target: { value: "validate cart" } });
    expect(dispatch).toHaveBeenCalledWith({
      type: "update_node",
      id: "api",
      patch: { responsibilities: ["validate cart"] },
    });
  });

  it("dispatches update_node removing responsibility when X is clicked", () => {
    const dispatch = vi.fn();
    const nodeWithResp: Node = {
      ...apiNode,
      responsibilities: ["accept orders", "emit events"],
    };
    render(<NodeInspector node={nodeWithResp} dispatch={dispatch} />);
    const removeButtons = screen.getAllByTitle(/remove responsibility/i);
    fireEvent.click(removeButtons[0]!);
    expect(dispatch).toHaveBeenCalledWith({
      type: "update_node",
      id: "api",
      patch: { responsibilities: ["emit events"] },
    });
  });

  it("renders existing interfaces", () => {
    const nodeWithIfaces: Node = {
      ...apiNode,
      interfaces: [
        { name: "POST /orders", protocol: "http", description: "Place order" },
        { name: "OrderPlaced", protocol: "event" },
      ],
    };
    render(<NodeInspector node={nodeWithIfaces} dispatch={vi.fn()} />);
    expect(screen.getByDisplayValue("POST /orders")).toBeInTheDocument();
    expect(screen.getByDisplayValue("http")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Place order")).toBeInTheDocument();
    expect(screen.getByDisplayValue("OrderPlaced")).toBeInTheDocument();
    expect(screen.getByDisplayValue("event")).toBeInTheDocument();
  });

  it("allows adding a new interface", () => {
    const dispatch = vi.fn();
    const nodeWithIfaces: Node = {
      ...apiNode,
      interfaces: [{ name: "GET /health", protocol: "http" }],
    };
    render(<NodeInspector node={nodeWithIfaces} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: /add interface/i }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "update_node",
      id: "api",
      patch: { interfaces: [{ name: "GET /health", protocol: "http" }, { name: "", protocol: "" }] },
    });
  });

  it("dispatches update_node when an interface name is edited", () => {
    const dispatch = vi.fn();
    const nodeWithIfaces: Node = {
      ...apiNode,
      interfaces: [{ name: "GET /health", protocol: "http" }],
    };
    render(<NodeInspector node={nodeWithIfaces} dispatch={dispatch} />);
    const nameInputs = screen.getAllByPlaceholderText(/interface name/i);
    fireEvent.change(nameInputs[0]!, { target: { value: "POST /orders" } });
    expect(dispatch).toHaveBeenCalledWith({
      type: "update_node",
      id: "api",
      patch: { interfaces: [{ name: "POST /orders", protocol: "http" }] },
    });
  });

  it("dispatches update_node removing an interface when X is clicked", () => {
    const dispatch = vi.fn();
    const nodeWithIfaces: Node = {
      ...apiNode,
      interfaces: [
        { name: "GET /health", protocol: "http" },
        { name: "OrderPlaced", protocol: "event" },
      ],
    };
    render(<NodeInspector node={nodeWithIfaces} dispatch={dispatch} />);
    const removeButtons = screen.getAllByTitle(/remove interface/i);
    fireEvent.click(removeButtons[0]!);
    expect(dispatch).toHaveBeenCalledWith({
      type: "update_node",
      id: "api",
      patch: { interfaces: [{ name: "OrderPlaced", protocol: "event" }] },
    });
  });

  it("hides add-interface button and disables fields in readOnly mode", () => {
    const nodeWithIfaces: Node = {
      ...apiNode,
      interfaces: [{ name: "GET /health", protocol: "http" }],
    };
    render(<NodeInspector node={nodeWithIfaces} dispatch={vi.fn()} readOnly />);
    expect(screen.queryByRole("button", { name: /add interface/i })).not.toBeInTheDocument();
    const nameInputs = screen.getAllByPlaceholderText(/interface name/i);
    expect(nameInputs[0]).toBeDisabled();
  });

  it("dispatches update_node clearing parentId when '(none)' is chosen", () => {
    const dispatch = vi.fn();
    const child: Node = { ...apiNode, parentId: "platform" };
    const allNodes = [
      child,
      { id: "platform", kind: "custom" as const, name: "Platform", description: "test fixture" },
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
