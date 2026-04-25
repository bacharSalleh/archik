import { useEffect, useRef, useState } from "react";
import type { Document } from "../domain/types.ts";
import type { Exporter } from "../io/exporters.ts";

type Props = {
  exporter: Exporter;
  document: Document;
};

export function CopyButton({ exporter, document }: Props): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    };
  }, []);

  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(exporter.export(document));
      setCopied(true);
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard write can fail (e.g. permissions in cross-origin iframe).
      // Falling back silently is fine for v1; the YAML download still works.
    }
  };

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      className="archik-btn"
    >
      {copied ? `Copied ${exporter.label}` : `Copy ${exporter.label}`}
    </button>
  );
}
