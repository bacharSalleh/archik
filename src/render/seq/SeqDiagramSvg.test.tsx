import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { SeqDiagramSvg } from "./SeqDiagramSvg.tsx";
import { layoutSeqDocument } from "./seqLayout.ts";
import type { SeqDocument } from "../../domain/seq-schema.ts";

const doc: SeqDocument = {
  version: "1.0",
  name: "Login",
  participants: [
    { id: "browser", nodeId: "frontend", label: "Browser" },
    { id: "gw", nodeId: "api-gateway" },
  ],
  steps: [
    { type: "message", id: "m1", from: "browser", to: "gw", label: "POST /login", arrow: "sync" },
    { type: "message", id: "m2", from: "gw", to: "browser", label: "200 OK", arrow: "return" },
    { type: "message", id: "m3", from: "gw", to: "gw", label: "refresh()", arrow: "sync" },
  ],
};

describe("SeqDiagramSvg", () => {
  it("renders an svg element", () => {
    const laid = layoutSeqDocument(doc);
    const { container } = render(<SeqDiagramSvg laid={laid} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
  it("renders participant labels", () => {
    const laid = layoutSeqDocument(doc);
    const { getByText } = render(<SeqDiagramSvg laid={laid} />);
    expect(getByText("Browser")).not.toBeNull();
    expect(getByText("api-gateway")).not.toBeNull();
  });
  it("renders message labels", () => {
    const laid = layoutSeqDocument(doc);
    const { getByText } = render(<SeqDiagramSvg laid={laid} />);
    expect(getByText("POST /login")).not.toBeNull();
    expect(getByText("200 OK")).not.toBeNull();
  });
  it("renders a self-call message", () => {
    const laid = layoutSeqDocument(doc);
    const { getByText, container } = render(<SeqDiagramSvg laid={laid} />);
    expect(getByText("refresh()")).not.toBeNull();
    expect(container.querySelector("path")).not.toBeNull();
  });
});
