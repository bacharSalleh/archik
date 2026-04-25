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

  it("opens the form when the trigger is clicked", () => {
    render(<AddNodeForm onAdd={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /\+ node/i }));
    expect(screen.getByPlaceholderText(/name/i)).toBeInTheDocument();
  });

  it("calls onAdd with the chosen kind + trimmed name", () => {
    const onAdd = vi.fn();
    render(<AddNodeForm onAdd={onAdd} />);
    fireEvent.click(screen.getByRole("button", { name: /\+ node/i }));
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "database" },
    });
    fireEvent.change(screen.getByPlaceholderText(/name/i), {
      target: { value: "  Orders DB  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(onAdd).toHaveBeenCalledWith("database", "Orders DB");
  });

  it("closes the form after a successful add and resets fields", () => {
    render(<AddNodeForm onAdd={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /\+ node/i }));
    fireEvent.change(screen.getByPlaceholderText(/name/i), {
      target: { value: "X" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(screen.queryByPlaceholderText(/name/i)).toBeNull();
    expect(
      screen.getByRole("button", { name: /\+ node/i }),
    ).toBeInTheDocument();
  });

  it("does not call onAdd when name is empty", () => {
    const onAdd = vi.fn();
    render(<AddNodeForm onAdd={onAdd} />);
    fireEvent.click(screen.getByRole("button", { name: /\+ node/i }));
    const submit = screen.getByRole("button", { name: /^add$/i });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(submit);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("closes the form when Cancel is clicked", () => {
    render(<AddNodeForm onAdd={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /\+ node/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByPlaceholderText(/name/i)).toBeNull();
  });
});
