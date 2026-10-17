import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Breadcrumbs } from "./Breadcrumbs.tsx";
import type { FileFrame } from "./App.tsx";

const root: FileFrame = {
  label: "main",
  docUrl: "/architecture.archik.yaml",
  sidecarUrl: "/architecture.archik.suggested.yaml",
  acceptUrl: "/__archik/accept-suggestion",
  archikFile: null,
};

const orders: FileFrame = {
  label: "Orders",
  docUrl: "/__archik/file?path=.archik%2Forders.archik.yaml",
  sidecarUrl: "/__archik/file?path=.archik%2Forders.archik.suggested.yaml",
  acceptUrl: "/__archik/file-accept?path=.archik%2Forders.archik.yaml",
  archikFile: ".archik/orders.archik.yaml",
};

describe("Breadcrumbs", () => {
  it("renders nothing at root depth (no useful crumbs to show)", () => {
    const { container } = render(
      <Breadcrumbs stack={[root]} onGoToFrame={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders previous frames as buttons and the current frame as text", () => {
    render(<Breadcrumbs stack={[root, orders]} onGoToFrame={vi.fn()} />);
    // "main" is a button (not the current frame)
    expect(screen.getByRole("button", { name: /main/i })).toBeInTheDocument();
    // "Orders" is current — rendered with aria-current="page"
    const current = screen.getByText("Orders");
    expect(current).toHaveAttribute("aria-current", "page");
  });

  it("invokes onGoToFrame with the correct index when an earlier crumb is clicked", () => {
    const onGoToFrame = vi.fn();
    render(<Breadcrumbs stack={[root, orders]} onGoToFrame={onGoToFrame} />);
    fireEvent.click(screen.getByRole("button", { name: /main/i }));
    expect(onGoToFrame).toHaveBeenCalledWith(0);
  });

  it("only renders preceding crumbs as buttons (current frame is not a button)", () => {
    render(<Breadcrumbs stack={[root, orders]} onGoToFrame={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    // Just the one for "main"; "Orders" is current and not clickable.
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent(/main/i);
  });
});
