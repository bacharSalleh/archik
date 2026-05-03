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
  it("renders lifelines for each participant", () => {
    const laid = layoutSeqDocument(doc);
    const { container } = render(<SeqDiagramSvg laid={laid} />);
    // lifelines are the only <line> elements with a direct opacity attribute
    const lifelines = container.querySelectorAll("line[opacity]");
    expect(lifelines.length).toBe(doc.participants.length);
  });

  const docWithGroup: SeqDocument = {
    version: "1.0",
    name: "With Group",
    participants: [
      { id: "a", nodeId: "svc-a" },
      { id: "b", nodeId: "svc-b" },
    ],
    steps: [{
      type: "group",
      id: "g1",
      kind: "alt",
      condition: "[auth ok]",
      branches: [
        {
          label: "[success]",
          steps: [{ type: "message", id: "m1", from: "a", to: "b", label: "call()", arrow: "sync" }],
        },
        {
          label: "[failure]",
          steps: [{ type: "message", id: "m2", from: "b", to: "a", label: "error()", arrow: "return" }],
        },
      ],
    }],
  };

  const docWithNote: SeqDocument = {
    version: "1.0",
    name: "With Note",
    participants: [
      { id: "a", nodeId: "svc-a" },
      { id: "b", nodeId: "svc-b" },
    ],
    steps: [{
      type: "note",
      id: "n1",
      position: "over",
      participants: ["a", "b"],
      text: "JWT issued here",
    }],
  };

  it("renders a group frame with condition and branch labels", () => {
    const laid = layoutSeqDocument(docWithGroup);
    const { getByText } = render(<SeqDiagramSvg laid={laid} />);
    expect(getByText("[auth ok]")).not.toBeNull();
    expect(getByText("[success]")).not.toBeNull();
    expect(getByText("[failure]")).not.toBeNull();
  });

  it("renders a note with text", () => {
    const laid = layoutSeqDocument(docWithNote);
    const { getByText } = render(<SeqDiagramSvg laid={laid} />);
    expect(getByText("JWT issued here")).not.toBeNull();
  });
});
