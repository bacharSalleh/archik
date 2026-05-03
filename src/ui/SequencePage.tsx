import { useEffect, useRef, useState } from "react";
import YAML from "yaml";
import { SeqDocumentSchema } from "../domain/seq-schema.ts";
import type { SeqDocument } from "../domain/seq-schema.ts";
import { layoutSeqDocument } from "../render/seq/seqLayout.ts";
import { SeqDiagramSvg } from "../render/seq/SeqDiagramSvg.tsx";
import { ExportMenu } from "./ExportMenu.tsx";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; doc: SeqDocument };

type Props = {
  path: string;
  fromViewKey: string | null;
};

export function SequencePage({ path, fromViewKey }: Props): React.ReactElement {
  const [state, setState] = useState<State>({ status: "loading" });
  const svgRef = useRef<SVGSVGElement | null>(null);

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

  const backHref = fromViewKey
    ? `/?viewKey=${encodeURIComponent(fromViewKey)}`
    : "/";

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
          ← Architecture
        </a>
      </div>
    );
  }

  const laid = layoutSeqDocument(state.doc);
  const filename = path.replace(/^.*\//, "").replace(/\.archik\.seq\.yaml$/, "");

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
          ← Architecture
        </a>
        <span style={{ color: "var(--archik-node-stroke)" }}>|</span>
        <span style={{ fontWeight: 500, fontSize: 14, color: "var(--archik-fg)" }}>
          {state.doc.name}
        </span>
        <div className="ml-auto">
          <ExportMenu
            document={{ version: "1.0", name: state.doc.name, nodes: [], edges: [] }}
            filename={filename}
            getSvg={() => svgRef.current}
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <SeqDiagramSvg laid={laid} svgRef={svgRef} />
      </div>
    </div>
  );
}
