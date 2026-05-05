import { useEffect, useMemo, useState } from "react";
import { Popover } from "./Popover.tsx";

/**
 * UseCasesPanel — the toolbar popover that lists every use case
 * defined in `.archik/usecases/`, with coverage indicators per
 * slice. Read-only: data fetched from `/__archik/usecases` and
 * `/__archik/trace` (both mirror the CLI's --json output).
 *
 * Display contract — three coverage levels (matches the CLI):
 *   ✓  full     tests + realisation seq + ECB stereotypes complete
 *   ~  partial  some signal but not fully traced
 *   ✗  none     no tests, no realisation
 *
 * No mutation — write paths stay in the CLI (and slash commands).
 */

type Slice = {
  id: string;
  description: string;
  status?: "active" | "proposed" | "deprecated";
  flows: string[];
  tests?: string[];
  realization?: { seqFile: string };
};

type UseCase = {
  relPath: string;
  id: string;
  name: string;
  status?: "active" | "proposed" | "deprecated";
  primaryActor: string;
  secondaryActors?: string[];
  slices: Slice[];
};

type TraceRow = {
  useCase: string;
  slice: string;
  level: "full" | "partial" | "none";
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; useCases: UseCase[]; trace: TraceRow[] }
  | { status: "error"; message: string };

const USECASES_URL = "/__archik/usecases";
const TRACE_URL = "/__archik/trace";

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { cache: "no-store", signal });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export function UseCasesPanel(): React.ReactElement {
  // State is owned at the panel level (not the popover body) so the
  // toolbar TRIGGER button itself can show "am I done?" — fully traced
  // (✓), partial (◐), or untraced (○) — without the user having to
  // open the popover. We refetch on every open so the badge stays
  // honest after edits in another window or via the CLI.
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    Promise.all([
      fetchJson<{ ok: boolean; useCases: UseCase[] }>(USECASES_URL, ctrl.signal),
      fetchJson<{ ok: boolean; rows: TraceRow[] }>(TRACE_URL, ctrl.signal),
    ])
      .then(([uc, tr]) => {
        if (cancelled) return;
        setState({
          status: "ready",
          useCases: uc.useCases ?? [],
          trace: tr.rows ?? [],
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
  }, [reloadTick]);

  return (
    <Popover
      align="end"
      trigger={(open) => (
        <button
          type="button"
          className="archik-btn"
          aria-expanded={open}
          onClick={() => {
            // Refetch on every open click — popover state flip happens
            // in the parent Popover wrapper. This way the badge stays
            // honest if files changed since the last fetch.
            if (!open) setReloadTick((t) => t + 1);
          }}
        >
          <UseCasesTriggerLabel state={state} />
          <span style={{ opacity: 0.6, marginLeft: 6 }}>
            {open ? "▴" : "▾"}
          </span>
        </button>
      )}
    >
      {() => <UseCasesPanelBody state={state} />}
    </Popover>
  );
}

function UseCasesTriggerLabel({
  state,
}: {
  state: LoadState;
}): React.ReactElement {
  if (state.status !== "ready" || state.trace.length === 0) {
    return <>Use cases</>;
  }
  const totals = countLevels(state.trace);
  // Worst-case wins: untraced > partial > full. Surfacing the most
  // actionable problem keeps the label honest at a glance.
  if (totals.none > 0) {
    return (
      <span title={`${totals.none} untraced — needs tests + seq`}>
        Use cases{" "}
        <span style={{ color: "var(--archik-danger)" }}>
          ○ {totals.none} untraced
        </span>
      </span>
    );
  }
  if (totals.partial > 0) {
    return (
      <span
        title={`${totals.partial} partial — missing test or realisation`}
      >
        Use cases{" "}
        <span style={{ color: "var(--archik-warning)" }}>
          ◐ {totals.partial} to finish
        </span>
      </span>
    );
  }
  return (
    <span title={`All ${totals.full} slices traced — ready to ship`}>
      Use cases{" "}
      <span style={{ color: "var(--archik-success)", fontWeight: 600 }}>
        ✓ all traced
      </span>
    </span>
  );
}

function countLevels(trace: TraceRow[]): {
  full: number;
  partial: number;
  none: number;
} {
  let full = 0;
  let partial = 0;
  let none = 0;
  for (const row of trace) {
    if (row.level === "full") full++;
    else if (row.level === "partial") partial++;
    else none++;
  }
  return { full, partial, none };
}

function UseCasesPanelBody({
  state,
}: {
  state: LoadState;
}): React.ReactElement {
  return (
    <div
      style={{
        minWidth: 360,
        maxHeight: "min(70vh, 560px)",
        overflowY: "auto",
        padding: 6,
      }}
    >
      <PanelHeader label="Use cases">
        <a
          href="/__archik/usecases"
          style={{
            fontSize: 10,
            letterSpacing: "0.04em",
            textTransform: "none",
            color: "var(--archik-accent)",
            textDecoration: "none",
            fontWeight: 500,
          }}
          title="Open the full use cases page (clickable test paths + seq links)"
        >
          Open page →
        </a>
      </PanelHeader>
      {state.status === "loading" && <PanelMsg>Loading…</PanelMsg>}
      {state.status === "error" && (
        <PanelMsg tone="error">Couldn't load: {state.message}</PanelMsg>
      )}
      {state.status === "ready" && state.useCases.length === 0 && (
        <PanelMsg>
          No use cases defined. Add a <code>*.archik.uc.yaml</code> file under{" "}
          <code>.archik/usecases/</code>.
        </PanelMsg>
      )}
      {state.status === "ready" && state.useCases.length > 0 && (
        <>
          <TraceSummary trace={state.trace} />
          <UseCaseList useCases={state.useCases} trace={state.trace} />
        </>
      )}
    </div>
  );
}

function TraceSummary({ trace }: { trace: TraceRow[] }): React.ReactElement {
  const totals = useMemo(() => countLevels(trace), [trace]);
  const total = trace.length;

  if (total === 0) return <></>;

  return (
    <div
      title="Coverage matrix — same as `npx archik trace`. ● fully traced (test + seq), ◐ partial, ○ untraced."
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "6px 10px",
        margin: "2px 2px 6px",
        borderRadius: 6,
        background: "var(--archik-surface)",
        fontSize: 11,
        color: "var(--archik-fg-dim)",
      }}
    >
      <span style={{ fontWeight: 600, color: "var(--archik-fg)" }}>
        Trace
      </span>
      <span>
        <span style={{ color: "var(--archik-success)" }}>●</span>{" "}
        {totals.full} full
      </span>
      <span>
        <span style={{ color: "var(--archik-warning)" }}>◐</span>{" "}
        {totals.partial} partial
      </span>
      <span>
        <span style={{ color: "var(--archik-fg-muted)" }}>○</span>{" "}
        {totals.none} untraced
      </span>
      <span style={{ marginLeft: "auto", color: "var(--archik-fg-muted)" }}>
        {total} {total === 1 ? "slice" : "slices"}
      </span>
    </div>
  );
}

function UseCaseList({
  useCases,
  trace,
}: {
  useCases: UseCase[];
  trace: TraceRow[];
}): React.ReactElement {
  // Build (useCase, slice) → level lookup once.
  const traceByKey = useMemo(() => {
    const map = new Map<string, TraceRow["level"]>();
    for (const row of trace) {
      map.set(`${row.useCase}/${row.slice}`, row.level);
    }
    return map;
  }, [trace]);

  return (
    <div>
      {useCases.map((uc) => (
        <UseCaseCard key={uc.id} uc={uc} traceByKey={traceByKey} />
      ))}
    </div>
  );
}

function UseCaseCard({
  uc,
  traceByKey,
}: {
  uc: UseCase;
  traceByKey: Map<string, TraceRow["level"]>;
}): React.ReactElement {
  return (
    <div
      style={{
        padding: "8px 8px 6px",
        borderTop: "1px solid var(--archik-border)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 6,
          marginBottom: 2,
        }}
      >
        <code
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 12,
            color: "var(--archik-fg)",
          }}
        >
          {uc.id}
        </code>
        <span style={{ color: "var(--archik-fg-dim)", fontSize: 11 }}>
          {uc.name}
        </span>
        {uc.status && uc.status !== "active" && (
          <span
            className="archik-pill"
            style={{ fontSize: 9, marginLeft: "auto" }}
          >
            {uc.status}
          </span>
        )}
      </div>
      <div style={{ color: "var(--archik-fg-muted)", fontSize: 11 }}>
        primary <code>{uc.primaryActor}</code>
        {uc.secondaryActors && uc.secondaryActors.length > 0 && (
          <>
            {" "}· secondary{" "}
            {uc.secondaryActors.map((a, i) => (
              <span key={a}>
                {i > 0 && ", "}
                <code>{a}</code>
              </span>
            ))}
          </>
        )}
      </div>
      <ul style={{ marginTop: 6, listStyle: "none", padding: 0 }}>
        {uc.slices.map((s) => {
          const level = traceByKey.get(`${uc.id}/${s.id}`);
          return <SliceRow key={s.id} slice={s} level={level} />;
        })}
      </ul>
    </div>
  );
}

function SliceRow({
  slice,
  level,
}: {
  slice: Slice;
  level?: "full" | "partial" | "none" | undefined;
}): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  return (
    <li style={{ padding: "3px 0" }}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="archik-btn"
        style={{
          display: "grid",
          gridTemplateColumns: "16px 1fr",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "4px 6px",
          background: "transparent",
          border: "none",
          textAlign: "left",
          cursor: "pointer",
        }}
        aria-expanded={expanded}
      >
        <CoverageBadge level={level} />
        <span
          style={{
            fontSize: 12,
            color: "var(--archik-fg)",
            display: "flex",
            alignItems: "baseline",
            gap: 6,
          }}
        >
          <code>{slice.id}</code>
          {slice.status && slice.status !== "active" && (
            <span style={{ color: "var(--archik-fg-dim)", fontSize: 10 }}>
              [{slice.status}]
            </span>
          )}
          <span
            style={{
              color: "var(--archik-fg-dim)",
              fontSize: 11,
              marginLeft: "auto",
            }}
          >
            {(() => {
              const n = slice.tests?.length ?? 0;
              const tests = `${n} ${n === 1 ? "test" : "tests"}`;
              const seq = slice.realization ? "realized" : "no seq";
              return `${tests} • ${seq}`;
            })()}
          </span>
        </span>
      </button>
      {expanded && (
        <div
          style={{
            paddingLeft: 24,
            color: "var(--archik-fg-dim)",
            fontSize: 11,
            paddingBottom: 4,
          }}
        >
          <div
            style={{
              color: "var(--archik-fg)",
              marginBottom: 4,
              lineHeight: 1.4,
            }}
          >
            {slice.description}
          </div>
          {slice.tests && slice.tests.length > 0 && (
            <div>
              tests:{" "}
              {slice.tests.map((t, i) => (
                <code key={t}>
                  {i > 0 && ", "}
                  {t}
                </code>
              ))}
            </div>
          )}
          {slice.realization && (
            <div>
              realises: <code>{slice.realization.seqFile}</code>
            </div>
          )}
          {!slice.tests?.length && !slice.realization && (
            <div>(no tests, no realisation)</div>
          )}
        </div>
      )}
    </li>
  );
}

const COVERAGE_BADGE: Record<
  "full" | "partial" | "none" | "missing",
  { glyph: string; tone: string; title: string }
> = {
  full: { glyph: "✓", tone: "var(--archik-status-active, #4ade80)", title: "fully traced" },
  partial: { glyph: "~", tone: "var(--archik-status-proposed, #fbbf24)", title: "partially traced" },
  none: { glyph: "✗", tone: "var(--archik-status-deprecated, #f87171)", title: "untraced" },
  missing: { glyph: "·", tone: "var(--archik-fg-dim)", title: "no trace data" },
};

function CoverageBadge({
  level,
}: {
  level?: "full" | "partial" | "none" | undefined;
}): React.ReactElement {
  const meta = COVERAGE_BADGE[level ?? "missing"];
  return (
    <span
      title={meta.title}
      aria-label={meta.title}
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
  );
}

function PanelHeader({
  label,
  children,
}: {
  label: string;
  children?: React.ReactNode;
}): React.ReactElement {
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
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
      }}
    >
      <span>{label}</span>
      {children}
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
