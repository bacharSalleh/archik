import { useEffect, useRef, useState } from "react";
import YAML from "yaml";
import { SeqDocumentSchema } from "../domain/seq-schema.ts";
import type { SeqDocument } from "../domain/seq-schema.ts";
import type { NodeKind } from "../domain/types.ts";
import { layoutSeqDocument } from "../render/seq/seqLayout.ts";
import { SeqDiagramSvg } from "../render/seq/SeqDiagramSvg.tsx";
import { ExportMenu } from "./ExportMenu.tsx";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; doc: SeqDocument };

/** Typed back-target. Different parents need different back semantics:
 *  - file → architecture canvas with a specific file selected
 *  - usecase → use cases page with a specific uc selected
 *  Absent → fall back to "/". */
export type SeqBackTarget =
  | { type: "file"; value: string }
  | { type: "usecase"; value: string };

type Props = {
  path: string;
  back: SeqBackTarget | null;
};

export function SequencePage({ path, back }: Props): React.ReactElement {
  const [state, setState] = useState<State>({ status: "loading" });
  const [kinds, setKinds] = useState<Map<string, NodeKind> | undefined>(undefined);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    fetch("/__archik/node-kinds")
      .then((r) => r.ok ? r.json() as Promise<Record<string, string>> : null)
      .then((data) => {
        if (data) setKinds(new Map(Object.entries(data) as [string, NodeKind][]));
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
        setState({ status: "ready", doc: result.data });
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
    // Two fixes vs the original:
    //   1. URL prefix was `/seq` but the SPA route is `/__archik/seq`
    //      — the old form 404'd against any real route.
    //   2. The back-target was being set to the CURRENT seq file path
    //      under the legacy `from=` param, which SequencePage's parser
    //      interprets as an *architecture file* path. Clicking back
    //      tried to open a `.archik.seq.yaml` as if it were `main.archik.yaml`
    //      and failed silently. Propagate THIS page's back target
    //      instead so the back-button stays sticky across ref hops.
    const params = new URLSearchParams();
    params.set("path", seqFile);
    if (back?.type === "usecase") params.set("from-uc", back.value);
    else if (back?.type === "file") params.set("from-file", back.value);
    window.location.href = `/__archik/seq?${params.toString()}`;
  };

  return (
    <div className="flex h-screen flex-col" style={{ background: "var(--archik-bg)" }}>
      <div
        className="flex items-center gap-3 px-4"
        style={{
          height: 48,
          borderBottom: "1px solid var(--archik-node-stroke)",
          background: "var(--archik-toolbar-bg, var(--archik-node-fill))",
        }}
      >
        <a
          href={backHref}
          style={{ color: "var(--archik-fg-muted)", fontSize: 13, textDecoration: "none" }}
        >
          ← {backLabel}
        </a>
        <span style={{ color: "var(--archik-node-stroke)" }}>|</span>
        <span style={{ fontWeight: 500, fontSize: 14, color: "var(--archik-fg)" }}>
          {state.doc.name}
        </span>
        <div className="ml-auto">
          <ExportMenu
            filename={filename}
            getSvg={() => svgRef.current}
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <SeqDiagramSvg laid={laid} svgRef={svgRef} onRefClick={handleRefClick} />
      </div>
    </div>
  );
}
