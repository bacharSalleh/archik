import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { EdgeInspector } from "./EdgeInspector.tsx";
import type { Edge } from "../domain/types.ts";

const edge: Edge = {
  id: "api-db",
  from: "api",
  to: "db",
  relationship: "writes",
  label: "writes orders",
};

describe("EdgeInspector", () => {
  it("shows an empty state when no edge is selected", () => {
    render(<EdgeInspector edge={undefined} dispatch={vi.fn()} />);
    expect(screen.getByText(/select an edge/i)).toBeInTheDocument();
  });

  it("populates fields from the edge", () => {
    render(<EdgeInspector edge={edge} dispatch={vi.fn()} />);
    expect(screen.getByText("api")).toBeInTheDocument();
    expect(screen.getByText("db")).toBeInTheDocument();
    expect(
      (screen.getByLabelText(/relationship/i) as HTMLSelectElement).value,
    ).toBe("writes");
    expect(
      (screen.getByLabelText(/label/i) as HTMLInputElement).value,
    ).toBe("writes orders");
  });

  it("dispatches update_edge when relationship changes", () => {
    const dispatch = vi.fn();
    render(<EdgeInspector edge={edge} dispatch={dispatch} />);
    fireEvent.change(screen.getByLabelText(/relationship/i), {
      target: { value: "reads" },
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "update_edge",
      id: "api-db",
      patch: { relationship: "reads" },
    });
  });

  it("dispatches update_edge when label changes", () => {
    const dispatch = vi.fn();
    render(<EdgeInspector edge={edge} dispatch={dispatch} />);
    fireEvent.change(screen.getByLabelText(/label/i), {
      target: { value: "renamed" },
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "update_edge",
      id: "api-db",
      patch: { label: "renamed" },
    });
  });

  it("dispatches disconnect when delete is clicked", () => {
    const dispatch = vi.fn();
    render(<EdgeInspector edge={edge} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "disconnect",
      id: "api-db",
    });
  });

  it("dispatches update_edge when description changes", () => {
    const dispatch = vi.fn();
    render(<EdgeInspector edge={edge} dispatch={dispatch} />);
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "sends order rows to the warehouse" },
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "update_edge",
      id: "api-db",
      patch: { description: "sends order rows to the warehouse" },
    });
  });

  it("dispatches update_edge when protocol changes", () => {
    const dispatch = vi.fn();
    render(<EdgeInspector edge={edge} dispatch={dispatch} />);
    fireEvent.change(screen.getByLabelText(/protocol/i), {
      target: { value: "grpc" },
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "update_edge",
      id: "api-db",
      patch: { protocol: "grpc" },
    });
  });

  it("dispatches update_edge when lifecycle status changes", () => {
    const dispatch = vi.fn();
    render(<EdgeInspector edge={edge} dispatch={dispatch} />);
    fireEvent.change(screen.getByLabelText(/lifecycle status/i), {
      target: { value: "proposed" },
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "update_edge",
      id: "api-db",
      patch: { status: "proposed" },
    });
  });

  it("dispatches update_edge with undefined status when 'active' is selected (schema default)", () => {
    const dispatch = vi.fn();
    const proposedEdge: Edge = { ...edge, status: "proposed" };
    render(<EdgeInspector edge={proposedEdge} dispatch={dispatch} />);
    fireEvent.change(screen.getByLabelText(/lifecycle status/i), {
      target: { value: "active" },
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "update_edge",
      id: "api-db",
      patch: { status: undefined },
    });
  });

  it("dispatches update_edge when the color text input changes", () => {
    const dispatch = vi.fn();
    render(<EdgeInspector edge={edge} dispatch={dispatch} />);
    const colorTextInput = screen.getAllByRole("textbox").find(
      (el) => (el as HTMLInputElement).placeholder === "default (whitish)",
    ) as HTMLInputElement;
    fireEvent.change(colorTextInput, { target: { value: "#ff0000" } });
    expect(dispatch).toHaveBeenCalledWith({
      type: "update_edge",
      id: "api-db",
      patch: { color: "#ff0000" },
    });
  });

  it("dispatches update_edge with undefined color when Reset is clicked", () => {
    const dispatch = vi.fn();
    const coloredEdge: Edge = { ...edge, color: "#ff0000" };
    render(<EdgeInspector edge={coloredEdge} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "update_edge",
      id: "api-db",
      patch: { color: undefined },
    });
  });

  it("disables every field and hides delete in readOnly mode", () => {
    render(<EdgeInspector edge={edge} dispatch={vi.fn()} readOnly />);
    expect(screen.getByLabelText(/relationship/i)).toBeDisabled();
    expect(screen.getByLabelText(/label/i)).toBeDisabled();
    expect(screen.getByLabelText(/description/i)).toBeDisabled();
    expect(screen.getByLabelText(/protocol/i)).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /delete/i }),
    ).not.toBeInTheDocument();
  });
});
