import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight, ChevronLeft } from "lucide-react";

/**
 * UseCasesPage — full-page master/detail view of every use case in the
 * project. Left rail lists use cases with their rolled-up trace level;
 * right pane shows the selected use case's flows + slices, with each
 * slice surfacing its test paths and (if realised) a clickable link to
 * the seq diagram. The selected use case id round-trips through the URL
 * (`?uc=<id>`) so the page is shareable and the back button works.
 *
 * Data source: same `/__archik/usecases` and `/__archik/trace` JSON
 * endpoints the toolbar dropdown uses — fetch logic intentionally
 * duplicated rather than lifted because the page mounts independently.
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
  goal?: string;
  preconditions?: string[];
  postconditions?: string[];
  /** Optional in the type so the renderer can degrade gracefully if
   *  the listing endpoint is ever trimmed again or the file is
   *  mid-author. The schema still requires it for valid documents. */
  flows?: {
    basic: { steps: string[] };
    alternates?: Array<{ id: string; branchFrom?: string; steps: string[] }>;
  };
  slices: Slice[];
};

type TraceRow = {
  useCase: string;
  slice: string;
  level: "full" | "partial" | "none";
  ecbTagged?: number;
  ecbTotal?: number;
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; useCases: UseCase[]; trace: TraceRow[] };

const USECASES_URL = "/__archik/usecases";
const TRACE_URL = "/__archik/trace";

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { cache: "no-store", signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

type Props = { selectedId: string | null };

export function UseCasesPage({ selectedId }: Props): React.ReactElement {
  const [state, setState] = useState<LoadState>({ status: "loading" });

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
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--archik-canvas)",
        color: "var(--archik-fg)",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <Header state={state} />
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {state.status === "loading" && <CenterMsg>Loading…</CenterMsg>}
        {state.status === "error" && (
          <CenterMsg tone="error">Couldn't load: {state.message}</CenterMsg>
        )}
        {state.status === "ready" && state.useCases.length === 0 && (
          <CenterMsg>
            No use cases defined yet. Add a <code>*.archik.uc.yaml</code> file
            under <code>.archik/usecases/</code>.
          </CenterMsg>
        )}
        {state.status === "ready" && state.useCases.length > 0 && (
          <Body
            useCases={state.useCases}
            trace={state.trace}
            selectedId={selectedId}
          />
        )}
      </div>
    </div>
  );
}

function Header({ state }: { state: LoadState }): React.ReactElement {
  const totals = useMemo(() => {
    if (state.status !== "ready") return null;
    let full = 0;
    let partial = 0;
    let none = 0;
    for (const r of state.trace) {
      if (r.level === "full") full++;
      else if (r.level === "partial") partial++;
      else none++;
    }
    return { full, partial, none, total: state.trace.length };
  }, [state]);

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 20px",
        height: 52,
        borderBottom: "1px solid var(--archik-border)",
        background: "var(--archik-panel)",
        flexShrink: 0,
      }}
    >
      <a
        href="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          color: "var(--archik-fg-dim)",
          fontSize: 13,
          textDecoration: "none",
        }}
      >
        <ChevronLeft size={14} />
        Architecture
      </a>
      <span style={{ color: "var(--archik-border-strong)" }}>|</span>
      <h1
        style={{
          fontSize: 14,
          fontWeight: 600,
          margin: 0,
          color: "var(--archik-fg)",
        }}
      >
        Use cases
      </h1>
      {totals && totals.total > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginLeft: "auto",
            fontSize: 12,
            color: "var(--archik-fg-dim)",
          }}
        >
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
          <span style={{ color: "var(--archik-fg-muted)" }}>
            · {totals.total} {totals.total === 1 ? "slice" : "slices"}
          </span>
        </div>
      )}
    </header>
  );
}

function Body({
  useCases,
  trace,
  selectedId,
}: {
  useCases: UseCase[];
  trace: TraceRow[];
  selectedId: string | null;
}): React.ReactElement {
  // Roll trace up to use-case granularity for the rail badges. Worst
  // level wins (untraced > partial > full) so the rail colour matches
  // the most actionable problem in the use case.
  const ucLevel = useMemo(() => {
    const rollUp = new Map<string, "full" | "partial" | "none">();
    for (const r of trace) {
      const cur = rollUp.get(r.useCase);
      if (!cur) {
        rollUp.set(r.useCase, r.level);
        continue;
      }
      if (cur === "none" || r.level === "none") rollUp.set(r.useCase, "none");
      else if (cur === "partial" || r.level === "partial")
        rollUp.set(r.useCase, "partial");
    }
    return rollUp;
  }, [trace]);

  const traceByKey = useMemo(() => {
    const m = new Map<string, TraceRow>();
    for (const r of trace) m.set(`${r.useCase}/${r.slice}`, r);
    return m;
  }, [trace]);

  // Default to the first use case if no id requested or the requested
  // id doesn't exist (stale URL after rename / removal).
  const selected =
    useCases.find((uc) => uc.id === selectedId) ?? useCases[0]!;

  return (
    <>
      <Rail useCases={useCases} ucLevel={ucLevel} selectedId={selected.id} />
      <Detail useCase={selected} traceByKey={traceByKey} />
    </>
  );
}

function Rail({
  useCases,
  ucLevel,
  selectedId,
}: {
  useCases: UseCase[];
  ucLevel: Map<string, "full" | "partial" | "none">;
  selectedId: string;
}): React.ReactElement {
  return (
    <nav
      aria-label="Use cases"
      style={{
        width: 260,
        borderRight: "1px solid var(--archik-border)",
        background: "var(--archik-panel)",
        overflowY: "auto",
        padding: "8px 0",
        flexShrink: 0,
      }}
    >
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {useCases.map((uc) => {
          const level = ucLevel.get(uc.id) ?? "none";
          const isActive = uc.id === selectedId;
          return (
            <li key={uc.id}>
              <a
                href={`/__archik/usecases?uc=${encodeURIComponent(uc.id)}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 14px",
                  textDecoration: "none",
                  color: "var(--archik-fg)",
                  background: isActive
                    ? "var(--archik-surface-hover)"
                    : "transparent",
                  borderLeft: isActive
                    ? "2px solid var(--archik-accent)"
                    : "2px solid transparent",
                  fontSize: 13,
                }}
              >
                <LevelDot level={level} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <code style={{ fontSize: 12, fontFamily: "ui-monospace, monospace" }}>
                    {uc.id}
                  </code>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--archik-fg-muted)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {uc.name}
                  </div>
                </span>
                {uc.status && uc.status !== "active" && (
                  <span
                    style={{
                      fontSize: 9,
                      padding: "1px 6px",
                      borderRadius: 4,
                      background: "var(--archik-surface)",
                      color: "var(--archik-fg-muted)",
                    }}
                  >
                    {uc.status}
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function LevelDot({
  level,
}: {
  level: "full" | "partial" | "none";
}): React.ReactElement {
  const meta =
    level === "full"
      ? { glyph: "●", color: "var(--archik-success)", label: "fully traced" }
      : level === "partial"
        ? { glyph: "◐", color: "var(--archik-warning)", label: "partially traced" }
        : { glyph: "○", color: "var(--archik-fg-muted)", label: "untraced" };
  return (
    <span
      title={meta.label}
      aria-label={meta.label}
      style={{ color: meta.color, fontSize: 12, lineHeight: 1, width: 12 }}
    >
      {meta.glyph}
    </span>
  );
}

function Detail({
  useCase,
  traceByKey,
}: {
  useCase: UseCase;
  traceByKey: Map<string, TraceRow>;
}): React.ReactElement {
  return (
    <main
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "24px 32px",
      }}
    >
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 12,
            marginBottom: 4,
          }}
        >
          <code
            style={{
              fontSize: 18,
              fontFamily: "ui-monospace, monospace",
              fontWeight: 600,
              color: "var(--archik-fg)",
            }}
          >
            {useCase.id}
          </code>
          {useCase.status && useCase.status !== "active" && (
            <span
              className="archik-pill"
              style={{ fontSize: 10 }}
            >
              {useCase.status}
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 15,
            color: "var(--archik-fg-dim)",
            marginBottom: 18,
          }}
        >
          {useCase.name}
        </div>

        <Meta useCase={useCase} />

        {useCase.goal && (
          <Section title="Goal">
            <p style={{ margin: 0, lineHeight: 1.55 }}>{useCase.goal}</p>
          </Section>
        )}

        {(useCase.preconditions?.length ?? 0) > 0 && (
          <Section title="Preconditions">
            <ul style={listStyle}>
              {useCase.preconditions!.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </Section>
        )}

        {/* Defensive: a use case loaded from an older payload shape
            (or hand-edited mid-author) may be missing `flows` entirely.
            The schema requires it, but the UI shouldn't crash on
            partial data — show a placeholder and move on. */}
        {useCase.flows?.basic?.steps && (
          <Section title="Basic flow">
            <ol style={{ ...listStyle, paddingLeft: 22 }}>
              {useCase.flows.basic.steps.map((s, i) => (
                <li key={i} style={{ marginBottom: 4 }}>
                  {s}
                </li>
              ))}
            </ol>
          </Section>
        )}

        {(useCase.flows?.alternates?.length ?? 0) > 0 && (
          <Section title="Alternate flows">
            {useCase.flows!.alternates!.map((alt) => (
              <div
                key={alt.id}
                style={{
                  marginBottom: 12,
                  padding: 12,
                  background: "var(--archik-surface)",
                  borderRadius: 6,
                  borderLeft: "3px solid var(--archik-warning)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "baseline",
                    marginBottom: 6,
                  }}
                >
                  <code style={{ fontSize: 12, fontWeight: 600 }}>{alt.id}</code>
                  {alt.branchFrom && (
                    <span style={{ fontSize: 11, color: "var(--archik-fg-muted)" }}>
                      branches from {alt.branchFrom}
                    </span>
                  )}
                </div>
                <ol style={{ ...listStyle, paddingLeft: 22, fontSize: 13 }}>
                  {alt.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </div>
            ))}
          </Section>
        )}

        {(useCase.postconditions?.length ?? 0) > 0 && (
          <Section title="Postconditions">
            <ul style={listStyle}>
              {useCase.postconditions!.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </Section>
        )}

        <Section title={`Slices (${useCase.slices.length})`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {useCase.slices.map((slice) => (
              <SliceCard
                key={slice.id}
                slice={slice}
                useCaseId={useCase.id}
                trace={traceByKey.get(`${useCase.id}/${slice.id}`)}
              />
            ))}
          </div>
        </Section>

        <div
          style={{
            marginTop: 32,
            paddingTop: 16,
            borderTop: "1px solid var(--archik-border)",
            fontSize: 11,
            color: "var(--archik-fg-muted)",
          }}
        >
          Source:{" "}
          <code style={{ fontFamily: "ui-monospace, monospace" }}>
            {useCase.relPath}
          </code>
        </div>
      </div>
    </main>
  );
}

function Meta({ useCase }: { useCase: UseCase }): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        gap: 24,
        padding: "10px 14px",
        background: "var(--archik-surface)",
        borderRadius: 6,
        marginBottom: 20,
        fontSize: 12,
      }}
    >
      <div>
        <div style={labelStyle}>Primary actor</div>
        <div style={{ marginTop: 2 }}>
          <code style={{ fontFamily: "ui-monospace, monospace" }}>
            {useCase.primaryActor}
          </code>
        </div>
      </div>
      {(useCase.secondaryActors?.length ?? 0) > 0 && (
        <div>
          <div style={labelStyle}>Secondary actors</div>
          <div style={{ marginTop: 2 }}>
            {useCase.secondaryActors!.map((a, i) => (
              <span key={a}>
                <code style={{ fontFamily: "ui-monospace, monospace" }}>{a}</code>
                {i < useCase.secondaryActors!.length - 1 && ", "}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SliceCard({
  slice,
  useCaseId,
  trace,
}: {
  slice: Slice;
  useCaseId: string;
  trace: TraceRow | undefined;
}): React.ReactElement {
  const level = trace?.level ?? "none";
  return (
    <div
      style={{
        padding: 14,
        background: "var(--archik-panel)",
        border: "1px solid var(--archik-border)",
        borderRadius: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <LevelDot level={level} />
        <code
          style={{
            fontSize: 13,
            fontFamily: "ui-monospace, monospace",
            fontWeight: 600,
          }}
        >
          {slice.id}
        </code>
        {slice.status && slice.status !== "active" && (
          <span style={{ fontSize: 10, color: "var(--archik-fg-muted)" }}>
            [{slice.status}]
          </span>
        )}
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: "var(--archik-fg-muted)",
          }}
        >
          {trace?.ecbTotal !== undefined && trace.ecbTotal > 0 && (
            <>
              ECB {trace.ecbTagged ?? 0}/{trace.ecbTotal}
            </>
          )}
        </span>
      </div>
      {slice.description && (
        <div
          style={{
            fontSize: 13,
            color: "var(--archik-fg-dim)",
            marginBottom: 10,
            lineHeight: 1.5,
          }}
        >
          {slice.description}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          columnGap: 14,
          rowGap: 8,
          fontSize: 12,
          alignItems: "start",
        }}
      >
        <div style={miniLabelStyle}>Tests</div>
        <div>
          {(slice.tests?.length ?? 0) === 0 ? (
            <span style={{ color: "var(--archik-fg-muted)" }}>
              — none declared
            </span>
          ) : (
            <ul style={{ ...listStyle, paddingLeft: 0, listStyle: "none" }}>
              {slice.tests!.map((t) => (
                <li
                  key={t}
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    fontSize: 11,
                  }}
                >
                  <span style={{ color: "var(--archik-fg-muted)" }}>•</span>{" "}
                  {t}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={miniLabelStyle}>Realization</div>
        <div>
          {slice.realization ? (
            <a
              href={`/__archik/seq?path=${encodeURIComponent(slice.realization.seqFile)}&from-uc=${encodeURIComponent(useCaseId)}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                color: "var(--archik-accent)",
                textDecoration: "none",
                fontFamily: "ui-monospace, monospace",
                fontSize: 11,
              }}
            >
              <ArrowRight size={11} />
              {seqFileName(slice.realization.seqFile)}
              <ArrowUpRight size={11} style={{ opacity: 0.7 }} />
            </a>
          ) : (
            <span style={{ color: "var(--archik-fg-muted)" }}>
              — no seq file yet
            </span>
          )}
        </div>

        <div style={miniLabelStyle}>Flows</div>
        <div style={{ fontSize: 11, color: "var(--archik-fg-dim)" }}>
          {slice.flows.join(", ")}
        </div>
      </div>
    </div>
  );
}

function seqFileName(path: string): string {
  return path.split("/").pop()?.replace(/\.archik\.seq\.yaml$/, "") ?? path;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section style={{ marginBottom: 24 }}>
      <h2
        style={{
          fontSize: 12,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--archik-fg-muted)",
          margin: "0 0 8px",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function CenterMsg({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "error";
}): React.ReactElement {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color:
          tone === "error" ? "var(--archik-danger)" : "var(--archik-fg-muted)",
        fontSize: 13,
        padding: 24,
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--archik-fg-muted)",
  fontWeight: 600,
};

const miniLabelStyle: React.CSSProperties = {
  ...labelStyle,
  fontSize: 10,
  paddingTop: 1,
};

const listStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  fontSize: 13,
  lineHeight: 1.55,
};
