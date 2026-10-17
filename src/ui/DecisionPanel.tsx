import type { Decision } from "../domain/decision.ts";

/**
 * The "why" of a pending suggestion, shown under the review banner.
 * Mirrors the decision record that accept writes to .archik/decisions/.
 */
export function DecisionPanel({ decision }: { decision: Decision }): React.ReactElement {
  const row = (label: string, body: React.ReactNode): React.ReactElement => (
    <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 10 }}>
      <span style={{ color: "var(--archik-fg-muted)", fontWeight: 600 }}>{label}</span>
      <span style={{ color: "var(--archik-fg)" }}>{body}</span>
    </div>
  );
  return (
    <div
      role="region"
      aria-label="Decision record"
      style={{
        background: "rgba(168, 85, 247, 0.06)",
        borderBottom: "1px solid rgba(168, 85, 247, 0.3)",
        padding: "10px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      {row("Context", decision.context)}
      {row("Decision", decision.decision)}
      {row(
        "Alternatives",
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          {decision.alternatives.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>,
      )}
      {row("Consequences", decision.consequences)}
      {decision.crossCutting ? row("Security", decision.crossCutting.security) : null}
      {decision.crossCutting ? row("Observability", decision.crossCutting.observability) : null}
      {decision.crossCutting ? row("Rollback", decision.crossCutting.rollback) : null}
      {decision.supersedes ? row("Supersedes", decision.supersedes.join(", ")) : null}
    </div>
  );
}
