import { useState } from "react";
import type { Decision } from "../domain/decision.ts";
import type { DoorClassification } from "../domain/door.ts";

/**
 * "Why?" — asked when the architect saves a structural change made on
 * the canvas. The answers become the decision record written next to
 * the model (.archik/decisions/), the same record agents must write.
 */
export function DecisionDialog({
  changes,
  door,
  defaultNote,
  error,
  busy,
  onSubmit,
  onCancel,
}: {
  /** One line per model change, shown for context. */
  changes: string[];
  door: DoorClassification;
  defaultNote: string;
  error?: string | undefined;
  busy: boolean;
  onSubmit: (note: string, decision: Decision) => void;
  onCancel: () => void;
}): React.ReactElement {
  const [note, setNote] = useState(defaultNote);
  const [context, setContext] = useState("");
  const [decision, setDecision] = useState("");
  const [alternatives, setAlternatives] = useState("");
  const [consequences, setConsequences] = useState("");
  const [security, setSecurity] = useState("");
  const [observability, setObservability] = useState("");
  const [rollback, setRollback] = useState("");

  const alts = alternatives.split("\n").map((a) => a.trim()).filter((a) => a.length > 0);
  const filled = (v: string): boolean => v.trim().length > 0;
  const crossOk = !door.needsCrossCutting || (filled(security) && filled(observability) && filled(rollback));
  const ready = filled(context) && filled(decision) && alts.length > 0 && filled(consequences) && crossOk;

  const submit = (): void => {
    if (!ready || busy) return;
    onSubmit(note.trim(), {
      context: context.trim(),
      decision: decision.trim(),
      alternatives: alts,
      consequences: consequences.trim(),
      ...(door.needsCrossCutting
        ? { crossCutting: { security: security.trim(), observability: observability.trim(), rollback: rollback.trim() } }
        : {}),
    });
  };

  const field = (
    label: string,
    hint: string,
    value: string,
    set: (v: string) => void,
    rows = 2,
  ): React.ReactElement => (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="archik-label">{label}</span>
      <textarea
        className="archik-input"
        rows={rows}
        placeholder={hint}
        value={value}
        onChange={(e) => set(e.target.value)}
        style={{ resize: "vertical", fontSize: 12 }}
      />
    </label>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Why this change"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div
        style={{
          width: "min(560px, 100%)",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "var(--archik-panel)",
          border: "1px solid var(--archik-border)",
          borderRadius: 10,
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          fontSize: 12,
          color: "var(--archik-fg)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <strong style={{ fontSize: 14 }}>Why this change?</strong>
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 10,
              fontSize: 10,
              fontWeight: 700,
              border: `1px solid ${door.oneWay ? "var(--archik-warning)" : "var(--archik-border)"}`,
              color: door.oneWay ? "var(--archik-warning)" : "var(--archik-fg-muted)",
            }}
          >
            {door.oneWay ? "ONE-WAY DOOR" : "TWO-WAY DOOR"}
          </span>
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, color: "var(--archik-fg-dim)" }}>
          {changes.slice(0, 8).map((c) => (
            <li key={c}>{c}</li>
          ))}
          {changes.length > 8 ? <li>… and {changes.length - 8} more</li> : null}
        </ul>
        <span style={{ color: "var(--archik-fg-muted)" }}>
          Saved as a decision record in .archik/decisions/ — agents read it before they touch this area.
        </span>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="archik-label">Title</span>
          <input className="archik-input" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {field("Context", "The problem and the forces — facts, not the solution.", context, setContext)}
        {field("Decision", "What you chose.", decision, setDecision)}
        {field("Alternatives", "One per line — options you weighed and did not choose.", alternatives, setAlternatives)}
        {field("Consequences", "What gets easier, and what gets harder.", consequences, setConsequences)}
        {door.needsCrossCutting ? (
          <>
            <span style={{ color: "var(--archik-warning)" }}>
              {door.reasons.filter((r) => r.crossCutting).map((r) => r.text).join("; ")} — say how it is secured, observed and rolled back.
            </span>
            {field("Security", "Who can reach it, secrets, data exposure.", security, setSecurity, 1)}
            {field("Observability", "How you will see it work or fail.", observability, setObservability, 1)}
            {field("Rollback", "How to undo it safely.", rollback, setRollback, 1)}
          </>
        ) : null}
        {error ? (
          <div role="alert" style={{ color: "var(--archik-danger)", whiteSpace: "pre-wrap" }}>
            {error}
          </div>
        ) : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="archik-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="archik-btn"
            disabled={!ready || busy}
            onClick={submit}
            style={{ background: "var(--archik-success)", color: "white", borderColor: "var(--archik-success)" }}
          >
            {busy ? "Saving…" : "Save with decision"}
          </button>
        </div>
      </div>
    </div>
  );
}
