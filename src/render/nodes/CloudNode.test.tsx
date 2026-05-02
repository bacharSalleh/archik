import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { CloudNode } from "./CloudNode.tsx";
import type { PositionedNode } from "../../layout/types.ts";

function makeCloudNode(overrides: Partial<PositionedNode> = {}): PositionedNode {
  return {
    id: "cdn",
    kind: "cloud",
    name: "CDN",
    description: "test fixture",
    x: 0,
    y: 0,
    width: 160,
    height: 90,
    children: [],
    ...overrides,
  };
}

describe("CloudNode", () => {
  it("renders without crashing", () => {
    const { container } = render(
      <svg>
        <CloudNode node={makeCloudNode()} />
      </svg>,
    );
    expect(container.querySelector("g.archik-node--cloud")).not.toBeNull();
  });

  it("renders the node name as text", () => {
    const { container } = render(
      <svg>
        <CloudNode node={makeCloudNode({ name: "S3 Bucket" })} />
      </svg>,
    );
    const texts = Array.from(container.querySelectorAll("text"));
    const nameText = texts.find((t) => t.textContent?.includes("S3 Bucket"));
    expect(nameText).not.toBeUndefined();
  });

  it("renders the KIND label in uppercase", () => {
    const { container } = render(
      <svg>
        <CloudNode node={makeCloudNode()} />
      </svg>,
    );
    const texts = Array.from(container.querySelectorAll("text"));
    const kindLabel = texts.find((t) => t.textContent === "CLOUD");
    expect(kindLabel).not.toBeUndefined();
  });

  it("selected node adds archik-selected-glow to the cloud path", () => {
    const { container } = render(
      <svg>
        <CloudNode node={makeCloudNode()} selected />
      </svg>,
    );
    expect(container.querySelector("path.archik-selected-glow")).not.toBeNull();
  });

  it("renders stack text when node has a stack field", () => {
    const { container } = render(
      <svg>
        <CloudNode node={makeCloudNode({ stack: "AWS CloudFront" })} />
      </svg>,
    );
    const texts = Array.from(container.querySelectorAll("text"));
    const stackText = texts.find((t) => t.textContent?.includes("CloudFront"));
    expect(stackText).not.toBeUndefined();
  });
});
