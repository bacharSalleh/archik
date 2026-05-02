import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { SocketIcon, InterfaceIcon } from "./customIcons.tsx";

describe("SocketIcon", () => {
  it("renders an aria-hidden SVG", () => {
    const { container } = render(<SocketIcon />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("defaults to size 16", () => {
    const { container } = render(<SocketIcon />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("16");
    expect(svg?.getAttribute("height")).toBe("16");
  });

  it("accepts a custom numeric size", () => {
    const { container } = render(<SocketIcon size={24} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("24");
    expect(svg?.getAttribute("height")).toBe("24");
  });

  it("applies a custom stroke color", () => {
    const { container } = render(<SocketIcon color="#ff0000" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("stroke")).toBe("#ff0000");
  });

  it("contains the outlet slot lines", () => {
    const { container } = render(<SocketIcon />);
    const lines = container.querySelectorAll("line");
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });
});

describe("InterfaceIcon", () => {
  it("renders an aria-hidden SVG", () => {
    const { container } = render(<InterfaceIcon />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("defaults to size 16", () => {
    const { container } = render(<InterfaceIcon />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("16");
    expect(svg?.getAttribute("height")).toBe("16");
  });

  it("accepts a custom string size", () => {
    const { container } = render(<InterfaceIcon size="32" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("32");
    expect(svg?.getAttribute("height")).toBe("32");
  });

  it("applies a custom stroke color", () => {
    const { container } = render(<InterfaceIcon color="#00ff00" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("stroke")).toBe("#00ff00");
  });
});
