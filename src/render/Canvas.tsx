import { useEffect, useMemo, useState } from "react";
import type { Document } from "../domain/types.ts";
import type { PositionedDocument } from "../layout/types.ts";
import { layout } from "../layout/index.ts";
import { DiagramSvg } from "./DiagramSvg.tsx";

type Props = {
  document: Document;
  className?: string | undefined;
  selectedNodeId?: string | undefined;
  selectedEdgeId?: string | undefined;
  onSelectNode?: ((id: string) => void) | undefined;
  onSelectEdge?: ((id: string) => void) | undefined;
  onSelectNothing?: (() => void) | undefined;
};

export function Canvas({
  document,
  className,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onSelectEdge,
  onSelectNothing,
}: Props): React.ReactElement {
  const layoutPromise = useMemo(() => layout(document), [document]);
  const [positioned, setPositioned] = useState<PositionedDocument | null>(null);

  useEffect(() => {
    let cancelled = false;
    layoutPromise.then((p) => {
      if (!cancelled) setPositioned(p);
    });
    return () => {
      cancelled = true;
    };
  }, [layoutPromise]);

  if (!positioned) {
    return (
      <div
        className={className}
        role="status"
        aria-live="polite"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          color: "#64748b",
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 13,
        }}
      >
        Laying out…
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        overflow: "auto",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <DiagramSvg
        positioned={positioned}
        {...(selectedNodeId !== undefined ? { selectedNodeId } : {})}
        {...(selectedEdgeId !== undefined ? { selectedEdgeId } : {})}
        {...(onSelectNode !== undefined ? { onSelectNode } : {})}
        {...(onSelectEdge !== undefined ? { onSelectEdge } : {})}
        {...(onSelectNothing !== undefined ? { onSelectNothing } : {})}
      />
    </div>
  );
}
