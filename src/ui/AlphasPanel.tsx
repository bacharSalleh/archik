import { useEffect, useState } from "react";
import { Popover } from "./Popover.tsx";

/**
 * AlphasPanel — the toolbar popover that renders the project's
 * Essence alpha snapshot. Read-only; data fetched from
 * `/__archik/alphas` (mirrors `archik alpha show --json`).
 *
 * Each card surfaces:
 *   - claimed state + ladder position
 *   - verification badge (verified / over-claimed / subjective / missing)
 *   - the over-claim reason when the check failed
 *   - user-authored note + evidence (collapsed by default)
 *
 * No mutation here — promote/demote stay in the CLI.
 */

const ALPHA_LABELS: Record<string, string> = {
  stakeholders: "Stakeholders",
  requirements: "Requirements",
  softwareSystem: "Software System",
  work: "Work",
};

type Verification = "verified" | "over-claimed" | "subjective" | "missing";

type AlphaRow = {
  alpha: string;
  state: string | null;
  ladderIndex: number;
  ladderLength: number;
  verification: Verification;
  reason?: string;
  note?: string;
  evidence?: string[];
};

type ApiResp = {
  ok: boolean;
  file: string | null;
  alphas: AlphaRow[];
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; file: string | null; alphas: AlphaRow[] }
  | { status: "error"; message: string };

const ALPHAS_URL = "/__archik/alphas";

async function fetchAlphas(signal: AbortSignal): Promise<ApiResp> {
  const res = await fetch(ALPHAS_URL, { cache: "no-store", signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return (await res.json()) as ApiResp;
}

export function AlphasPanel(): React.ReactElement {
  return (
    <Popover
      align="end"
      trigger={(open) => (
        <button type="button" className="archik-btn" aria-expanded={open}>
          Alphas
          <span style={{ opacity: 0.6 }}>{open ? "▴" : "▾"}</span>
        </button>
      )}
    >
      {/* Body only mounts while the popover is open, so the fetch fires
       *  per-open and parent state stays out of the trigger render. */}
      {() => <AlphasPanelBody />}
    </Popover>
  );
}

function AlphasPanelBody(): React.ReactElement {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    fetchAlphas(ctrl.signal)
      .then((data) => {
        // See UseCasesPanel — guard against setState after unmount.
        if (cancelled) return;
        setState({
          status: "ready",
          file: data.file,
          alphas: data.alphas ?? [],
        });
      })
      .catch((err: unknown) => {
        if (cancelled || ctrl.signal.aborted) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, []);

  return (
    <div
      style={{
        minWidth: 360,
        maxHeight: "min(70vh, 560px)",
        overflowY: "auto",
        padding: 6,
      }}
    >
      <PanelHeader label="Essence alphas" />
      {state.status === "loading" && <PanelMsg>Loading…</PanelMsg>}
      {state.status === "error" && (
        <PanelMsg tone="error">Couldn't load: {state.message}</PanelMsg>
      )}
      {state.status === "ready" && state.file === null && (
        <PanelMsg>
          No alphas file yet. Run{" "}
          <code>archik alpha promote &lt;alpha&gt; &lt;state&gt;</code> to
          create one.
        </PanelMsg>
      )}
      {state.status === "ready" && state.alphas.length > 0 && (
        <div>
          {state.alphas.map((a) => (
            <AlphaCard key={a.alpha} row={a} />
          ))}
        </div>
      )}
    </div>
  );
}

const VERIFICATION_META: Record<
  Verification,
  { glyph: string; tone: string; label: string }
> = {
  verified: {
    glyph: "✓",
    tone: "var(--archik-status-active, #4ade80)",
    label: "verified",
  },
  "over-claimed": {
    glyph: "✗",
    tone: "var(--archik-status-deprecated, #f87171)",
    label: "over-claimed",
  },
  subjective: {
    glyph: "?",
    tone: "var(--archik-status-proposed, #fbbf24)",
    label: "subjective (no machine check)",
  },
  missing: {
    glyph: "·",
    tone: "var(--archik-fg-dim)",
    label: "unset",
  },
};

function AlphaCard({ row }: { row: AlphaRow }): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const meta = VERIFICATION_META[row.verification];
  const hasDetail =
    row.reason !== undefined ||
    row.note !== undefined ||
    (row.evidence !== undefined && row.evidence.length > 0);
  return (
    <div
      style={{
        padding: "8px 8px 6px",
        borderTop: "1px solid var(--archik-border)",
      }}
    >
      <button
        type="button"
        onClick={() => hasDetail && setExpanded((v) => !v)}
        disabled={!hasDetail}
        aria-expanded={expanded}
        style={{
          display: "grid",
          gridTemplateColumns: "16px 1fr auto",
          alignItems: "baseline",
          gap: 8,
          width: "100%",
          padding: 0,
          background: "transparent",
          border: "none",
          textAlign: "left",
          cursor: hasDetail ? "pointer" : "default",
          color: "inherit",
        }}
      >
        <span
          aria-label={meta.label}
          title={meta.label}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 14,
            height: 14,
            fontSize: 11,
            fontWeight: 600,
            color: meta.tone,
          }}
        >
          {meta.glyph}
        </span>
        <span
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <span
            style={{
              fontSize: 12,
              color: "var(--archik-fg)",
              fontWeight: 500,
            }}
          >
            {ALPHA_LABELS[row.alpha] ?? row.alpha}
          </span>
          <span style={{ fontSize: 11, color: "var(--archik-fg-dim)" }}>
            {row.state === null ? (
              "(unset)"
            ) : (
              <>
                <code>{row.state}</code>{" "}
                <span style={{ color: "var(--archik-fg-muted)" }}>
                  {row.ladderIndex + 1}/{row.ladderLength}
                </span>
              </>
            )}
          </span>
        </span>
        {hasDetail && (
          <span style={{ color: "var(--archik-fg-muted)", fontSize: 10 }}>
            {expanded ? "▴" : "▾"}
          </span>
        )}
      </button>
      {expanded && (
        <div
          style={{
            paddingLeft: 24,
            paddingTop: 6,
            color: "var(--archik-fg-dim)",
            fontSize: 11,
          }}
        >
          {row.note && (
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: "var(--archik-fg-muted)" }}>note:</span>{" "}
              {row.note}
            </div>
          )}
          {row.evidence && row.evidence.length > 0 && (
            <ul style={{ margin: "4px 0", paddingLeft: 16 }}>
              {row.evidence.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          {row.reason && (
            <div
              style={{
                color: "var(--archik-status-deprecated, #f87171)",
                marginTop: 4,
              }}
            >
              {row.reason}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PanelHeader({ label }: { label: string }): React.ReactElement {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        background: "var(--archik-panel)",
        fontSize: 10,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--archik-fg-muted)",
        padding: "4px 6px 8px",
        zIndex: 1,
      }}
    >
      {label}
    </div>
  );
}

function PanelMsg({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "error";
}): React.ReactElement {
  return (
    <div
      style={{
        padding: "8px 8px 12px",
        fontSize: 12,
        color:
          tone === "error"
            ? "var(--archik-status-deprecated, #f87171)"
            : "var(--archik-fg-dim)",
      }}
    >
      {children}
    </div>
  );
}
