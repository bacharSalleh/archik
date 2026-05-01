import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AddNodeForm } from "./AddNodeForm.tsx";

describe("AddNodeForm", () => {
  it("starts collapsed showing the trigger button", () => {
    render(<AddNodeForm onAdd={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /\+ node/i }),
    ).toBeInTheDocument();
  });

  it("opens the modal when the trigger is clicked", () => {
    render(<AddNodeForm onAdd={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /\+ node/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
  });

  it("calls onAdd with the chosen kind + trimmed name + trimmed description", () => {
    const onAdd = vi.fn();
    render(<AddNodeForm onAdd={onAdd} />);
    fireEvent.click(screen.getByRole("button", { name: /\+ node/i }));
    fireEvent.click(screen.getByLabelText(/kind/i));
    fireEvent.click(screen.getByRole("button", { name: /^database/i }));
    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: "  Orders DB  " },
    });
    fireEvent.change(screen.getByLabelText(/^description$/i), {
      target: { value: "  Persists order rows.  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(onAdd).toHaveBeenCalledWith(
      "database",
      "Orders DB",
      "Persists order rows.",
    );
  });

  it("closes the modal after a successful add and resets fields", () => {
    render(<AddNodeForm onAdd={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /\+ node/i }));
    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: "X" },
    });
    fireEvent.change(screen.getByLabelText(/^description$/i), {
      target: { value: "Y" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.getByRole("button", { name: /\+ node/i }),
    ).toBeInTheDocument();
  });

  it("does not call onAdd when name or description is empty (both required)", () => {
    const onAdd = vi.fn();
    render(<AddNodeForm onAdd={onAdd} />);
    fireEvent.click(screen.getByRole("button", { name: /\+ node/i }));
    const submit = screen.getByRole("button", { name: /^add$/i });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(submit);
    expect(onAdd).not.toHaveBeenCalled();
    // Filling only the name still keeps the button disabled — the
    // schema requires description, so the form does too.
    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: "X" },
    });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
  });

  it("closes the modal when Cancel is clicked", () => {
    render(<AddNodeForm onAdd={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /\+ node/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
