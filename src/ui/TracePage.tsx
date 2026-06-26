import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  FileCode2,
} from "lucide-react";
import { TraceDocumentSchema } from "../domain/trace-schema.ts";
import type { TraceDocument, TraceStep } from "../domain/trace-schema.ts";
import type { SeqBackTarget } from "./SequencePage.tsx";

/**
 * TracePage — renders one concrete run (`*.archik.trace.json`) as a
 * vertical dataflow timeline. Pure presentational over a `TraceDocument`
 * so it's testable without the network. The `TraceRoute` wrapper below
 * fetches the JSON via the same file-endpoint pattern SequencePage uses
 * (`/__archik/trace-file?path=…`) and hands the parsed doc down.
 *
 * Read-only: trace files are machine-generated; nothing is written back.
 * Binding to the abstract seq diagram is v1-minimal — when `seqFile` is
 * set we show a "bound to <seqFile>" affordance, not a full overlay.
 */

export function TracePage({
  trace,
  back,
}: {
  trace: TraceDocument;
  back?: SeqBackTarget | null;
}): React.ReactElement {
  return (
    <div
      className="archik-trace-page"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--archik-canvas)",
        color: "var(--archik-fg)",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <TraceHeader trace={trace} back={back ?? null} />
      <main style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <TraceMeta trace={trace} />
          <ol
            style={{
              listStyle: "none",
              margin: "20px 0 0",
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 0,
            }}
          >
            {trace.steps.map((step, i) => (
              <StepRow
                key={step.id ?? `${step.from}->${step.to}:${i}`}
                step={step}
                index={i}
                last={i === trace.steps.length - 1}
              />
            ))}
          </ol>
        </div>
      </main>
    </div>
  );
}

function TraceHeader({
  trace,
  back,
}: {
  trace: TraceDocument;
  back: SeqBackTarget | null;
}): React.ReactElement {
  const backHref = back
    ? back.type === "usecase"
      ? `/__archik/usecases?uc=${encodeURIComponent(back.value)}`
      : `/?file=${encodeURIComponent(back.value)}`
    : `/__archik/usecases?uc=${encodeURIComponent(trace.useCase)}`;
  const backLabel = back?.type === "file" ? "Architecture" : "Use cases";

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "0 16px",
        height: 48,
        borderBottom: "1px solid var(--archik-border)",
        background: "var(--archik-panel)",
        flexShrink: 0,
        fontSize: 13,
      }}
    >
      <a
        href={backHref}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 2,
          color: "var(--archik-fg-dim)",
          textDecoration: "none",
        }}
      >
        <ChevronLeft size={14} />
        {backLabel}
      </a>
      <Crumb />
      <a
        href={`/__archik/usecases?uc=${encodeURIComponent(trace.useCase)}`}
        style={{
          color: "var(--archik-fg-dim)",
          textDecoration: "none",
          fontFamily: "ui-monospace, monospace",
          fontSize: 12,
        }}
      >
        {trace.useCase}
      </a>
      <Crumb />
      <span
        style={{
          color: "var(--archik-fg)",
          fontFamily: "ui-monospace, monospace",
          fontSize: 12,
        }}
      >
        {trace.slice}
      </span>
      <span
        className="archik-pill"
        style={{ fontSize: 9, marginLeft: 8 }}
        title="Concrete run — recorded values from a real test"
      >
        concrete run
      </span>
    </header>
  );
}

function Crumb(): React.ReactElement {
  return (
    <ChevronRight
      size={12}
      color="var(--archik-fg-muted)"
      style={{ marginInline: 2 }}
    />
  );
}

function TraceMeta({ trace }: { trace: TraceDocument }): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 24,
        padding: "12px 16px",
        background: "var(--archik-surface)",
        borderRadius: 8,
        fontSize: 12,
      }}
    >
      <Field label="Use case / slice">
        <code style={mono()}>
          {trace.useCase} / {trace.slice}
        </code>
      </Field>
      <Field label="Recorded at">
        <span style={{ color: "var(--archik-fg)" }}>{trace.recordedAt}</span>
      </Field>
      <Field label="Steps">
        <span style={{ color: "var(--archik-fg)" }}>{trace.steps.length}</span>
      </Field>
      {trace.seqFile && (
        <Field label="Bound to">
          <a
            href={`/__archik/seq?path=${encodeURIComponent(trace.seqFile)}&from-uc=${encodeURIComponent(trace.useCase)}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              color: "var(--archik-accent)",
              textDecoration: "none",
              ...mono(),
            }}
            title="Open the abstract sequence diagram this run realises"
          >
            <FileCode2 size={11} />
            {trace.seqFile}
          </a>
        </Field>
      )}
    </div>
  );
}

function StepRow({
  step,
  index,
  last,
}: {
  step: TraceStep;
  index: number;
  last: boolean;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const hasData =
    step.data !== undefined &&
    (step.data.in !== undefined || step.data.out !== undefined);

  return (
    <li
      style={{
        display: "grid",
        gridTemplateColumns: "20px 1fr",
        columnGap: 12,
      }}
    >
      {/* Timeline rail: a dot per step, a connector line between them. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <StatusDot status={step.status} />
        {!last && (
          <span
            style={{
              flex: 1,
              width: 2,
              minHeight: 12,
              background: "var(--archik-border)",
            }}
          />
        )}
      </div>

      <div style={{ paddingBottom: last ? 0 : 16 }}>
        <button
          type="button"
          onClick={() => hasData && setOpen((v) => !v)}
          className="archik-btn"
          aria-expanded={hasData ? open : undefined}
          disabled={!hasData}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            padding: "6px 10px",
            background: "var(--archik-panel)",
            border: "1px solid var(--archik-border)",
            borderRadius: 8,
            textAlign: "left",
            cursor: hasData ? "pointer" : "default",
          }}
        >
          <span style={{ color: "var(--archik-fg-muted)", fontSize: 11 }}>
            {index + 1}.
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
            }}
          >
            <code style={mono()}>{step.from}</code>
            <ChevronRight size={11} color="var(--archik-fg-muted)" />
            <code style={mono()}>{step.to}</code>
          </span>
          <span
            style={{
              fontSize: 13,
              color: "var(--archik-fg)",
              fontWeight: 500,
              marginLeft: 4,
            }}
          >
            {step.label}
          </span>
          {step.status === "error" && (
            <span
              className="archik-pill"
              style={{
                fontSize: 9,
                color: "var(--archik-danger)",
                borderColor: "var(--archik-danger)",
              }}
            >
              error
            </span>
          )}
          {hasData && (
            <ChevronDown
              size={14}
              color="var(--archik-fg-muted)"
              style={{
                marginLeft: "auto",
                transform: open ? "rotate(180deg)" : "none",
                transition: "transform 0.12s",
              }}
            />
          )}
          {!hasData && (
            <span
              style={{
                marginLeft: "auto",
                fontSize: 10,
                color: "var(--archik-fg-muted)",
              }}
            >
              no data
            </span>
          )}
        </button>

        {open && hasData && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginTop: 8,
            }}
          >
            {step.data?.in !== undefined && (
              <DataBlock label="in" value={step.data.in} />
            )}
            {step.data?.out !== undefined && (
              <DataBlock label="out" value={step.data.out} />
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function DataBlock({
  label,
  value,
}: {
  label: string;
  value: unknown;
}): React.ReactElement {
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--archik-fg-muted)",
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <pre
        style={{
          margin: 0,
          padding: 10,
          background: "var(--archik-surface)",
          border: "1px solid var(--archik-border)",
          borderRadius: 6,
          fontSize: 11,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          color: "var(--archik-fg-dim)",
          overflowX: "auto",
          whiteSpace: "pre",
        }}
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function StatusDot({
  status,
}: {
  status: TraceStep["status"];
}): React.ReactElement {
  if (status === "error") {
    return (
      <span aria-label="error" title="error" style={{ display: "inline-flex" }}>
        <CircleAlert size={16} color="var(--archik-danger)" />
      </span>
    );
  }
  return (
    <span aria-label="ok" title="ok" style={{ display: "inline-flex" }}>
      <CircleCheck size={16} color="var(--archik-success)" />
    </span>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span
        style={{
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--archik-fg-muted)",
        }}
      >
        {label}
      </span>
      <span>{children}</span>
    </div>
  );
}

function mono(extra?: React.CSSProperties): React.CSSProperties {
  return {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 11,
    color: "var(--archik-fg)",
    textDecoration: "none",
    ...extra,
  };
}

// ============================================================================
//  TraceRoute — the self-fetching page wrapper mounted by main.tsx for the
//  `/__archik/trace-page?path=…` route. Mirrors SequencePage's fetch shape:
//  GET the raw file from a data endpoint, parse + validate, then render the
//  pure TracePage. Kept separate so TracePage stays trivially testable.
// ============================================================================

type RouteState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; doc: TraceDocument };

export function TraceRoute({
  path,
  back,
}: {
  path: string;
  back: SeqBackTarget | null;
}): React.ReactElement {
  const [state, setState] = useState<RouteState>({ status: "loading" });

  useEffect(() => {
    setState({ status: "loading" });
    const encoded = encodeURIComponent(path);
    fetch(`/__archik/trace-file?path=${encoded}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.text();
      })
      .then((text) => {
        const raw = JSON.parse(text);
        const result = TraceDocumentSchema.safeParse(raw);
        if (!result.success) {
          throw new Error(result.error.issues.map((i) => i.message).join("; "));
        }
        setState({ status: "ready", doc: result.data });
      })
      .catch((err) => {
        setState({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
  }, [path]);

  if (state.status === "loading") {
    return (
      <div
        className="flex h-screen items-center justify-center"
        style={{ color: "var(--archik-fg-muted)" }}
      >
        Loading trace…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <div style={{ color: "var(--archik-danger)" }}>
          {state.message}
        </div>
        <a
          href="/__archik/usecases"
          style={{ color: "var(--archik-fg-muted)", fontSize: 13 }}
        >
          ← Use cases
        </a>
      </div>
    );
  }

  return <TracePage trace={state.doc} back={back} />;
}
