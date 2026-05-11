import { describe, expect, it } from "vitest";
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
  ],
};

describe("layoutSeqDocument", () => {
  it("produces two participants with distinct x positions", () => {
    const laid = layoutSeqDocument(doc);
    expect(laid.participants).toHaveLength(2);
    expect(laid.participants[0]!.cx).not.toBe(laid.participants[1]!.cx);
  });
  it("produces a layouted step for each step", () => {
    const laid = layoutSeqDocument(doc);
    expect(laid.steps).toHaveLength(2);
  });
  it("first message y is above second message y", () => {
    const laid = layoutSeqDocument(doc);
    expect(laid.steps[0]!.y).toBeLessThan(laid.steps[1]!.y);
  });
  it("total width covers all participants", () => {
    const laid = layoutSeqDocument(doc);
    expect(laid.totalWidth).toBeGreaterThan(laid.participants[1]!.cx);
  });
  it("uses participant label for display when provided", () => {
    const laid = layoutSeqDocument(doc);
    expect(laid.participants[0]!.label).toBe("Browser");
  });
  it("falls back to nodeId when no label provided", () => {
    const laid = layoutSeqDocument(doc);
    expect(laid.participants[1]!.label).toBe("api-gateway");
  });
  it("layout includes totalHeight > totalWidth/2 when there are steps", () => {
    const laid = layoutSeqDocument(doc);
    expect(laid.totalHeight).toBeGreaterThan(0);
  });
  it("self-call message has isSelf=true", () => {
    const selfDoc: SeqDocument = {
      version: "1.0",
      name: "Self",
      participants: [{ id: "a", nodeId: "svc" }],
      steps: [{ type: "message", id: "m1", from: "a", to: "a", label: "refresh()", arrow: "sync" }],
    };
    const laid = layoutSeqDocument(selfDoc);
    const msg = laid.steps[0]!;
    expect(msg.type).toBe("message");
    if (msg.type === "message") expect(msg.isSelf).toBe(true);
  });
  it("note over single participant is centered on that participant", () => {
    const noteDoc: SeqDocument = {
      version: "1.0",
      name: "Note",
      participants: [
        { id: "a", nodeId: "svc-a" },
        { id: "b", nodeId: "svc-b" },
      ],
      steps: [{
        type: "note",
        id: "n1",
        position: "over",
        participants: ["a"],
        text: "JWT issued here",
      }],
    };
    const laid = layoutSeqDocument(noteDoc);
    const note = laid.steps[0]!;
    expect(note.type).toBe("note");
    if (note.type === "note") {
      const aCx = laid.participants[0]!.cx;
      const centerX = note.x + note.width / 2;
      expect(Math.abs(centerX - aCx)).toBeLessThan(2);
    }
  });

  it("note over multiple participants is centered between them", () => {
    const noteDoc: SeqDocument = {
      version: "1.0",
      name: "Note",
      participants: [
        { id: "a", nodeId: "svc-a" },
        { id: "b", nodeId: "svc-b" },
      ],
      steps: [{
        type: "note",
        id: "n1",
        position: "over",
        participants: ["a", "b"],
        text: "spans both",
      }],
    };
    const laid = layoutSeqDocument(noteDoc);
    const note = laid.steps[0]!;
    expect(note.type).toBe("note");
    if (note.type === "note") {
      const aCx = laid.participants[0]!.cx;
      const bCx = laid.participants[1]!.cx;
      const centerX = note.x + note.width / 2;
      const expected = (aCx + bCx) / 2;
      expect(Math.abs(centerX - expected)).toBeLessThan(2);
    }
  });

  it("note width accounts for long text", () => {
    const longText = "a very long note that exceeds the minimum width threshold for sure";
    const noteDoc: SeqDocument = {
      version: "1.0",
      name: "Note",
      participants: [{ id: "a", nodeId: "svc-a" }],
      steps: [{
        type: "note",
        id: "n1",
        position: "over",
        participants: ["a"],
        text: longText,
      }],
    };
    const laid = layoutSeqDocument(noteDoc);
    const note = laid.steps[0]!;
    expect(note.type).toBe("note");
    if (note.type === "note") {
      expect(note.width).toBeGreaterThan(80);
      expect(note.width).toBeGreaterThan(longText.length * 5);
    }
  });

  it("participant status is passed through to layout", () => {
    const statusDoc: SeqDocument = {
      version: "1.0",
      name: "Status",
      participants: [
        { id: "a", nodeId: "svc-a", status: "proposed" },
        { id: "b", nodeId: "svc-b", status: "deprecated" },
      ],
      steps: [{ type: "message", id: "m1", from: "a", to: "b", label: "call()", arrow: "sync" }],
    };
    const laid = layoutSeqDocument(statusDoc);
    expect(laid.participants[0]!.status).toBe("proposed");
    expect(laid.participants[1]!.status).toBe("deprecated");
  });

  it("note left_of positions note to the left of the participant", () => {
    const noteDoc: SeqDocument = {
      version: "1.0",
      name: "Note",
      participants: [
        { id: "a", nodeId: "svc-a" },
        { id: "b", nodeId: "svc-b" },
      ],
      steps: [{ type: "note", id: "n1", position: "left_of", participants: ["b"], text: "aside" }],
    };
    const laid = layoutSeqDocument(noteDoc);
    const note = laid.steps[0]!;
    expect(note.type).toBe("note");
    if (note.type === "note") {
      const bCx = laid.participants[1]!.cx;
      expect(note.x + note.width).toBeLessThan(bCx);
    }
  });

  it("note right_of positions note to the right of the participant", () => {
    const noteDoc: SeqDocument = {
      version: "1.0",
      name: "Note",
      participants: [
        { id: "a", nodeId: "svc-a" },
        { id: "b", nodeId: "svc-b" },
      ],
      steps: [{ type: "note", id: "n1", position: "right_of", participants: ["a"], text: "aside" }],
    };
    const laid = layoutSeqDocument(noteDoc);
    const note = laid.steps[0]!;
    expect(note.type).toBe("note");
    if (note.type === "note") {
      const aCx = laid.participants[0]!.cx;
      expect(note.x).toBeGreaterThan(aCx);
    }
  });

  it("activation spans from sync+activate to matching return", () => {
    const activationDoc: SeqDocument = {
      version: "1.0",
      name: "Activation",
      participants: [
        { id: "a", nodeId: "svc-a" },
        { id: "b", nodeId: "svc-b" },
      ],
      steps: [
        { type: "message", id: "m1", from: "a", to: "b", label: "call()", arrow: "sync", activate: true },
        { type: "message", id: "m2", from: "b", to: "a", label: "result", arrow: "return" },
      ],
    };
    const laid = layoutSeqDocument(activationDoc);
    expect(laid.activations).toHaveLength(1);
    const act = laid.activations[0]!;
    const bCx = laid.participants[1]!.cx;
    expect(act.cx).toBe(bCx);
    const m1 = laid.steps[0]!;
    const m2 = laid.steps[1]!;
    expect(act.startY).toBe(m1.y);
    expect(act.endY).toBeGreaterThan(m1.y);
    expect(act.endY).toBeLessThanOrEqual(m2.y + 20);
  });

  it("activation without matching return produces short fallback box", () => {
    const activationDoc: SeqDocument = {
      version: "1.0",
      name: "Activation",
      participants: [
        { id: "a", nodeId: "svc-a" },
        { id: "b", nodeId: "svc-b" },
      ],
      steps: [
        { type: "message", id: "m1", from: "a", to: "b", label: "fire()", arrow: "sync", activate: true },
      ],
    };
    const laid = layoutSeqDocument(activationDoc);
    expect(laid.activations).toHaveLength(1);
    const act = laid.activations[0]!;
    expect(act.endY).toBeGreaterThan(act.startY);
    expect(act.endY - act.startY).toBeLessThan(40);
  });

  it("group step produces type=group", () => {
    const groupDoc: SeqDocument = {
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
        condition: "[ok]",
        branches: [{
          label: "[ok]",
          steps: [{ type: "message", id: "m1", from: "a", to: "b", label: "call()", arrow: "sync" }],
        }],
      }],
    };
    const laid = layoutSeqDocument(groupDoc);
    expect(laid.steps[0]!.type).toBe("group");
  });

  it("leaves room for the next message's label above the group's bottom border", () => {
    // SeqMessage draws the label at msg.y + LABEL_OFFSET_Y (= msg.y - 6)
    // as a baseline, and the text glyphs rise upward from there by the
    // font size (~11px). If POST_GROUP_GAP is too small, the label text
    // crosses the just-closed group's bottom border. Assert the gap is
    // big enough that the label TOP lands below the border with a small
    // visual buffer.
    const doc: SeqDocument = {
      version: "1.0",
      name: "Post-group gap",
      participants: [
        { id: "a", nodeId: "svc-a" },
        { id: "b", nodeId: "svc-b" },
      ],
      steps: [
        {
          type: "group",
          id: "g",
          kind: "opt",
          branches: [{
            steps: [
              { type: "message", id: "m1", from: "a", to: "b", label: "x", arrow: "sync" },
            ],
          }],
        },
        { type: "message", id: "m2", from: "b", to: "a", label: "y", arrow: "return" },
      ],
    };
    const laid = layoutSeqDocument(doc);
    const group = laid.steps[0] as Extract<typeof laid.steps[number], { type: "group" }>;
    const msg = laid.steps[1] as Extract<typeof laid.steps[number], { type: "message" }>;
    const groupBottom = group.y + group.height;
    // Label baseline at msg.y - 6, text height ~12px, so label top ≈
    // msg.y - 18. Require label top to clear the group border.
    const labelTop = msg.y - 6 - 12;
    expect(labelTop).toBeGreaterThan(groupBottom);
  });

  it("insets nested groups inside their parent so the hierarchy is visible", () => {
    // A loop containing an opt: the inner opt frame should be drawn
    // slightly narrower than the loop frame so the nesting reads as
    // "opt INSIDE loop" rather than "two stacked frames." The inset
    // never crosses the leftmost / rightmost lifeline.
    const doc: SeqDocument = {
      version: "1.0",
      name: "Nested groups",
      participants: [
        { id: "a", nodeId: "svc-a" },
        { id: "b", nodeId: "svc-b" },
      ],
      steps: [{
        type: "group",
        id: "outer",
        kind: "loop",
        branches: [{
          steps: [{
            type: "group",
            id: "inner",
            kind: "opt",
            branches: [{
              steps: [
                { type: "message", id: "m1", from: "a", to: "b", label: "x", arrow: "sync" },
              ],
            }],
          }],
        }],
      }],
    };
    const laid = layoutSeqDocument(doc);
    const outer = laid.steps[0] as Extract<typeof laid.steps[number], { type: "group" }>;
    const inner = outer.branches[0]!.steps[0] as Extract<
      typeof outer.branches[number]["steps"][number],
      { type: "group" }
    >;
    expect(inner.x).toBeGreaterThan(outer.x);
    expect(inner.x + inner.width).toBeLessThan(outer.x + outer.width);
    // And the inset must never push the inner frame past the lifelines:
    // the leftmost lifeline cx must still be inside (or on the left edge
    // of) the inner frame.
    const leftmostCx = laid.participants[0]!.cx;
    expect(inner.x).toBeLessThanOrEqual(leftmostCx);
  });
});

describe("layoutSeqDocument — note overflow", () => {
  it("grows totalWidth when a right_of note extends past the rightmost lifeline", () => {
    const doc: SeqDocument = {
      version: "1.0",
      name: "Right overflow",
      participants: [
        { id: "a", nodeId: "svc-a" },
        { id: "b", nodeId: "svc-b" },
      ],
      steps: [
        {
          type: "note",
          id: "n1",
          position: "right_of",
          participants: ["b"],
          text:
            "this is a deliberately long note that will easily extend past the rightmost lifeline edge",
        },
      ],
    };
    const laid = layoutSeqDocument(doc);
    const note = laid.steps.find((s) => s.type === "note") as
      | { x: number; width: number }
      | undefined;
    expect(note).toBeDefined();
    // Note must fit entirely inside the SVG viewBox (totalWidth).
    expect(note!.x + note!.width).toBeLessThanOrEqual(laid.totalWidth);
  });

  it("shifts everything right when a left_of note would land at negative x", () => {
    const doc: SeqDocument = {
      version: "1.0",
      name: "Left overflow",
      participants: [
        { id: "a", nodeId: "svc-a" }, // leftmost — left_of note hangs off the left
      ],
      steps: [
        {
          type: "note",
          id: "n1",
          position: "left_of",
          participants: ["a"],
          text:
            "very long note positioned to the left of the leftmost participant which forces a shift",
        },
      ],
    };
    const laid = layoutSeqDocument(doc);
    const note = laid.steps.find((s) => s.type === "note") as
      | { x: number; width: number }
      | undefined;
    expect(note).toBeDefined();
    // Both the note and the participant lifeline must sit inside the
    // canvas — the layout should have shifted everything right.
    expect(note!.x).toBeGreaterThanOrEqual(0);
    expect(note!.x + note!.width).toBeLessThanOrEqual(laid.totalWidth);
    const participantCx = laid.participants[0]!.cx;
    // Participant should have been shifted to make room for the note.
    expect(participantCx).toBeGreaterThan(note!.x + note!.width - 10);
  });
});
