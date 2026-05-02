import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Logo } from "./Logo.tsx";

describe("Logo", () => {
  it("renders an svg with aria-label 'Archik'", () => {
    render(<Logo />);
    expect(screen.getByRole("img", { name: "Archik" })).toBeInTheDocument();
  });

  it("defaults to size 22", () => {
    render(<Logo />);
    const svg = screen.getByRole("img");
    expect(svg.getAttribute("width")).toBe("22");
    expect(svg.getAttribute("height")).toBe("22");
  });

  it("respects a custom size prop", () => {
    render(<Logo size={48} />);
    const svg = screen.getByRole("img");
    expect(svg.getAttribute("width")).toBe("48");
    expect(svg.getAttribute("height")).toBe("48");
  });

  it("contains three path elements (the A-frame strokes)", () => {
    const { container } = render(<Logo />);
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBe(3);
  });

  it("contains three circle elements (the vertex dots)", () => {
    const { container } = render(<Logo />);
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBe(3);
  });
});
