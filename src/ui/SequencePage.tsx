import { useEffect, useMemo, useRef, useState } from "react";
import YAML from "yaml";
import { ChevronLeft, ChevronRight, FileCode2, PanelRightClose, PanelRightOpen } from "lucide-react";
import { SeqDocumentSchema } from "../domain/seq-schema.ts";
import type { SeqDocument } from "../domain/seq-schema.ts";
import type { NodeKind } from "../domain/types.ts";
import { layoutSeqDocument } from "../render/seq/seqLayout.ts";
import { SeqDiagramSvg } from "../render/seq/SeqDiagramSvg.tsx";
import { ExportMenu } from "./ExportMenu.tsx";
import { KIND_META } from "../render/kindPalette.ts";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; doc: SeqDocument; raw: string };

/** Typed back-target. Different parents need different back semantics:
 *  - file → architecture canvas with a specific file selected
 *  - usecase → use cases page with a specific uc selected
 *  Absent → fall back to "/". */
export type SeqBackTarget =
  | { type: "file"; value: string }
  | { type: "usecase"; value: string };

type UseCaseLite = {
  id: string;
  name: string;
  primaryActor: string;
  slices: Array<{
    id: string;
    description?: string;
    tests?: string[];
    realization?: { seqFile: string };
  }>;
};

type RealizedSliceShape = {
  useCase: string;
  slice: string;
  name?: string | undefined;
  primaryActor?: string | undefined;
  slice_data?:
    | {
        id: string;
        description?: string;
        tests?: string[];
      }
    | undefined;
};

type Props = {
  path: string;
  back: SeqBackTarget | null;
};

const RAIL_OPEN_KEY = "archik.seq.rail.open";

export function SequencePage({ path, back }: Props): React.ReactElement {
  const [state, setState] = useState<State>({ status: "loading" });
  const [kinds, setKinds] = useState<Map<string, NodeKind> | undefined>(undefined);
  const [useCases, setUseCases] = useState<UseCaseLite[]>([]);
  const [railOpen, setRailOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const v = window.localStorage.getItem(RAIL_OPEN_KEY);
    return v === null ? true : v === "1";
  });
  const [yamlOpen, setYamlOpen] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(RAIL_OPEN_KEY, railOpen ? "1" : "0");
    }
  }, [railOpen]);

  // Node-kind index — used to draw kind icons next to participant ids
  // in the rail. Lookup is best-effort: missing data just means no icon.
  useEffect(() => {
    fetch("/__archik/node-kinds")
      .then((r) => r.ok ? r.json() as Promise<Record<string, string>> : null)
      .then((data) => {
        if (data) setKinds(new Map(Object.entries(data) as [string, NodeKind][]));
      })
      .catch(() => {});
  }, []);

  // Use cases — needed to resolve the seq's `realizes` block to a slice
  // (so the rail can show the slice's test paths and the slice card's
  // human description). Fetch once on mount; the page is read-only.
  useEffect(() => {
    fetch("/__archik/usecases")
      .then((r) => r.ok ? r.json() as Promise<{ useCases: UseCaseLite[] }> : null)
      .then((data) => {
        if (data) setUseCases(data.useCases ?? []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setState({ status: "loading" });
    const encoded = encodeURIComponent(path);
    fetch(`/__archik/seq-file?path=${encoded}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.text();
      })
      .then((text) => {
        const raw = YAML.parse(text);
        const result = SeqDocumentSchema.safeParse(raw);
        if (!result.success) {
          throw new Error(result.error.issues.map((i) => i.message).join("; "));
        }
        setState({ status: "ready", doc: result.data, raw: text });
      })
      .catch((err) => {
        setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
      });
  }, [path]);

  const backHref = back
    ? back.type === "usecase"
      ? `/__archik/usecases?uc=${encodeURIComponent(back.value)}`
      : `/?file=${encodeURIComponent(back.value)}`
    : "/";
  const backLabel = back?.type === "usecase" ? "Use cases" : "Architecture";

  const realizedSlice = useMemo(() => {
    if (state.status !== "ready") return null;
    const r = state.doc.realizes;
    if (!r) return null;
    const uc = useCases.find((u) => u.id === r.useCase);
    if (!uc) return { useCase: r.useCase, slice: r.slice, name: undefined, slice_data: undefined };
    const slice = uc.slices.find((s) => s.id === r.slice);
    return {
      useCase: r.useCase,
      slice: r.slice,
      name: uc.name,
      slice_data: slice,
      primaryActor: uc.primaryActor,
    };
  }, [state, useCases]);

  if (state.status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center" style={{ color: "var(--archik-fg-muted)" }}>
        Loading sequence diagram…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <div style={{ color: "var(--archik-fg-error, #ef4444)" }}>{state.message}</div>
        <a href={backHref} style={{ color: "var(--archik-fg-muted)", fontSize: 13 }}>
          ← {backLabel}
        </a>
      </div>
    );
  }

  const laid = layoutSeqDocument(state.doc, kinds);
  const filename = path.replace(/^.*\//, "").replace(/\.archik\.seq\.yaml$/, "");

  const handleRefClick = (seqFile: string): void => {
    const params = new URLSearchParams();
    params.set("path", seqFile);
    if (back?.type === "usecase") params.set("from-uc", back.value);
    else if (back?.type === "file") params.set("from-file", back.value);
    window.location.href = `/__archik/seq?${params.toString()}`;
  };

  return (
    <div className="flex h-screen flex-col" style={{ background: "var(--archik-canvas)" }}>
      <Header
        backHref={backHref}
        backLabel={backLabel}
        realizedSlice={realizedSlice}
        seqName={state.doc.name}
        railOpen={railOpen}
        onToggleRail={() => setRailOpen((v) => !v)}
        filename={filename}
        getSvg={() => svgRef.current}
      />
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          <SeqDiagramSvg laid={laid} svgRef={svgRef} onRefClick={handleRefClick} />
        </div>
        {railOpen && (
          <Rail
            doc={state.doc}
            raw={state.raw}
            yamlOpen={yamlOpen}
            onToggleYaml={() => setYamlOpen((v) => !v)}
            realizedSlice={realizedSlice}
            kinds={kinds}
          />
        )}
      </div>
    </div>
  );
}

function Header({
  backHref,
  backLabel,
  realizedSlice,
  seqName,
  railOpen,
  onToggleRail,
  filename,
  getSvg,
}: {
  backHref: string;
  backLabel: string;
  realizedSlice: RealizedSliceShape | null;
  seqName: string;
  railOpen: boolean;
  onToggleRail: () => void;
  filename: string;
  getSvg: () => SVGSVGElement | null;
}): React.ReactElement {
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
      {realizedSlice && (
        <>
          <Crumb />
          <a
            href={`/__archik/usecases?uc=${encodeURIComponent(realizedSlice.useCase)}`}
            style={{
              color: "var(--archik-fg-dim)",
              textDecoration: "none",
              fontFamily: "ui-monospace, monospace",
              fontSize: 12,
            }}
          >
            {realizedSlice.useCase}
          </a>
          <Crumb />
          <span style={{ color: "var(--archik-fg)", fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
            {realizedSlice.slice}
          </span>
        </>
      )}
      {!realizedSlice && (
        <>
          <Crumb />
          <span style={{ color: "var(--archik-fg)", fontWeight: 500 }}>
            {seqName}
          </span>
        </>
      )}
      <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
        <ExportMenu filename={filename} getSvg={getSvg} />
        <button
          type="button"
          onClick={onToggleRail}
          aria-label={railOpen ? "Hide details" : "Show details"}
          aria-pressed={railOpen}
          title={railOpen ? "Hide details panel" : "Show details panel"}
          className="archik-btn"
          style={{ padding: "5px 8px" }}
        >
          {railOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
        </button>
      </div>
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


function Rail({
  doc,
  raw,
  yamlOpen,
  onToggleYaml,
  realizedSlice,
  kinds,
}: {
  doc: SeqDocument;
  raw: string;
  yamlOpen: boolean;
  onToggleYaml: () => void;
  realizedSlice: RealizedSliceShape | null;
  kinds: Map<string, NodeKind> | undefined;
}): React.ReactElement {
  return (
    <aside
      style={{
        width: 300,
        flexShrink: 0,
        borderLeft: "1px solid var(--archik-border)",
        background: "var(--archik-panel)",
        overflowY: "auto",
        padding: 16,
        fontSize: 12,
        color: "var(--archik-fg-dim)",
      }}
    >
      {/* Realizes */}
      <Section title="Realizes">
        {realizedSlice ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <Field label="Use case">
              <a
                href={`/__archik/usecases?uc=${encodeURIComponent(realizedSlice.useCase)}`}
                style={mono({ color: "var(--archik-accent)" })}
              >
                {realizedSlice.useCase}
                {realizedSlice.name ? ` — ${realizedSlice.name}` : ""}
              </a>
            </Field>
            <Field label="Slice">
              <code style={mono()}>{realizedSlice.slice}</code>
            </Field>
            {realizedSlice.slice_data?.description && (
              <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.5 }}>
                {realizedSlice.slice_data.description}
              </div>
            )}
          </div>
        ) : (
          <Empty>
            No <code>realizes</code> block — this is an ad-hoc / scratch
            flow, not bound to a use case slice.
          </Empty>
        )}
      </Section>

      {/* Participants */}
      <Section title={`Participants (${doc.participants.length})`}>
        <ul style={listStyle}>
          {doc.participants.map((p) => {
            const kind = kinds?.get(p.nodeId);
            const meta = kind ? KIND_META[kind] : undefined;
            const Icon = meta?.icon;
            return (
              <li
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "3px 0",
                }}
              >
                {Icon ? (
                  <Icon size={12} color={meta!.color} strokeWidth={2} />
                ) : (
                  <span style={{ width: 12 }} />
                )}
                <code style={mono()}>{p.nodeId}</code>
                {p.id !== p.nodeId && (
                  <span style={{ fontSize: 10, color: "var(--archik-fg-muted)" }}>
                    [{p.id}]
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      {/* Tests — sourced from the realized slice. Hidden when there's
          no realizes block since "tests for what" isn't answerable. */}
      {realizedSlice?.slice_data && (
        <Section title="Proved by">
          {(realizedSlice.slice_data.tests?.length ?? 0) === 0 ? (
            <Empty>No tests declared on this slice.</Empty>
          ) : (
            <ul style={{ ...listStyle, listStyle: "none", paddingLeft: 0 }}>
              {realizedSlice.slice_data.tests!.map((t) => (
                <li
                  key={t}
                  style={{ ...mono(), fontSize: 11, padding: "2px 0" }}
                >
                  <span style={{ color: "var(--archik-fg-muted)" }}>•</span>{" "}
                  {t}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* View YAML */}
      <Section title="Source">
        <button
          type="button"
          onClick={onToggleYaml}
          className="archik-btn"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            padding: "4px 8px",
          }}
        >
          <FileCode2 size={11} />
          {yamlOpen ? "Hide YAML" : "View YAML"}
        </button>
        {yamlOpen && (
          <pre
            style={{
              marginTop: 8,
              padding: 10,
              background: "var(--archik-surface)",
              border: "1px solid var(--archik-border)",
              borderRadius: 4,
              fontSize: 10,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              color: "var(--archik-fg-dim)",
              overflowX: "auto",
              whiteSpace: "pre",
              maxHeight: 360,
              overflowY: "auto",
            }}
          >
            {raw}
          </pre>
        )}
      </Section>
    </aside>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section style={{ marginBottom: 18 }}>
      <h2
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--archik-fg-muted)",
          margin: "0 0 6px",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
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
    <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
      <span
        style={{
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--archik-fg-muted)",
          width: 56,
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div
      style={{
        fontSize: 11,
        color: "var(--archik-fg-muted)",
        lineHeight: 1.5,
      }}
    >
      {children}
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

const listStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 0,
  listStyle: "none",
};
