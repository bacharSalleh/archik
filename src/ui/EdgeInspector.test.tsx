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
