import { describe, expect, it } from "vitest";
import { checkTraces } from "./trace-validate.ts";
import type { LoadedTraceDoc } from "../io/trace-discovery.ts";
import type { LoadedUseCaseDoc } from "../io/usecase-discovery.ts";
import type { LoadedSeqDoc } from "../io/seq-discovery.ts";

function uc(id: string, slices: string[]): LoadedUseCaseDoc {
  return { abs: "", relPath: `${id}.uc.yaml`, doc: { id, slices: slices.map((s) => ({ id: s })) } } as unknown as LoadedUseCaseDoc;
}
function tr(doc: object): LoadedTraceDoc {
  return { abs: "", relPath: "t.json", doc } as unknown as LoadedTraceDoc;
}
function seq(relPath: string, participants: string[], msgIds: string[]): LoadedSeqDoc {
  return {
    abs: "", relPath,
    doc: { version: "1.0", name: "s", participants: participants.map((id) => ({ id, nodeId: id })), steps: msgIds.map((id) => ({ type: "message", id, from: participants[0], to: participants[0], label: "x", arrow: "sync" })) },
  } as unknown as LoadedSeqDoc;
}

const baseTrace = { version: "1.0", useCase: "uc", slice: "s", recordedAt: "t", steps: [{ from: "a", to: "b", label: "go" }] };

describe("checkTraces", () => {
  it("passes a standalone trace whose slice resolves", () => {
    const r = checkTraces([tr(baseTrace)], [uc("uc", ["s"])], []);
    expect(r.errors).toHaveLength(0);
  });

  it("errors when the use case / slice does not resolve", () => {
    const r = checkTraces([tr(baseTrace)], [uc("uc", ["other"])], []);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("errors when a bound step id is missing from the seq diagram", () => {
    const t = { ...baseTrace, seqFile: "x.seq.yaml", steps: [{ id: "nope", from: "a", to: "b", label: "go" }] };
    const r = checkTraces([tr(t)], [uc("uc", ["s"])], [seq("x.seq.yaml", ["a", "b"], ["m1"])]);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("reports seq steps the trace never hit as info, not error", () => {
    const t = { ...baseTrace, seqFile: "x.seq.yaml", steps: [{ id: "m1", from: "a", to: "b", label: "go" }] };
    const r = checkTraces([tr(t)], [uc("uc", ["s"])], [seq("x.seq.yaml", ["a", "b"], ["m1", "m2"])]);
    expect(r.errors).toHaveLength(0);
    expect(r.info.join(" ")).toContain("m2");
  });

  it("errors when a bound step uses a participant not in the seq diagram", () => {
    const t = { ...baseTrace, seqFile: "x.seq.yaml", steps: [{ id: "m1", from: "ghost", to: "b", label: "go" }] };
    const r = checkTraces([tr(t)], [uc("uc", ["s"])], [seq("x.seq.yaml", ["a", "b"], ["m1"])]);
    expect(r.errors.some((e) => /ghost/.test(e.message) || /participant/i.test(e.message))).toBe(true);
  });
});
