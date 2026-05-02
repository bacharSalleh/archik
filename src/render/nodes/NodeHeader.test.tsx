import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NodeHeader } from "./NodeHeader.tsx";
import { NODE_KINDS } from "../../domain/taxonomy.ts";
import { KIND_META } from "../kindPalette.ts";

const defaultProps = {
  iconAt: { cx: 14, cy: 14 },
  labelAt: { cx: 60, cy: 16 },
};

describe("NodeHeader", () => {
  it("renders the kind label in uppercase", () => {
    render(
      <svg>
        <NodeHeader kind="service" {...defaultProps} />
      </svg>,
    );
    expect(screen.getByText("SERVICE")).toBeInTheDocument();
  });

  it("renders the kind label for every node kind without crashing", () => {
    for (const kind of NODE_KINDS) {
      const { unmount } = render(
        <svg>
          <NodeHeader kind={kind} {...defaultProps} />
        </svg>,
      );
      expect(screen.getByText(kind.toUpperCase())).toBeInTheDocument();
      unmount();
    }
  });

  it("uses the kind color from KIND_META on the icon", () => {
    const { container } = render(
      <svg>
        <NodeHeader kind="database" {...defaultProps} />
      </svg>,
    );
    const color = KIND_META["database"].color;
    // The lucide icon renders with a `color` prop that becomes stroke/fill attrs
    const colored = container.querySelector(`[color="${color}"], [stroke="${color}"]`);
    expect(colored).not.toBeNull();
  });
});
