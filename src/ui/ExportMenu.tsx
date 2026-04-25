import type { Document } from "../domain/types.ts";
import { exporters } from "../io/exporters.ts";
import { saveDocumentAsDownload } from "../io/fileAdapter.ts";
import { Popover } from "./Popover.tsx";

type Props = {
  document: Document;
  filename: string;
};

export function ExportMenu({
  document,
  filename,
}: Props): React.ReactElement {
  const copy = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore — clipboard may be blocked on http://
    }
  };

  return (
    <Popover
      trigger={(open) => (
        <button type="button" className="archik-btn">
          Export
          <span style={{ opacity: 0.6 }}>{open ? "▴" : "▾"}</span>
        </button>
      )}
    >
      {(close) => (
        <>
          {exporters.map((e) => (
            <button
              key={e.name}
              type="button"
              className="archik-menu-item"
              onClick={() => {
                void copy(e.export(document));
                close();
              }}
            >
              <span style={{ minWidth: 60, color: "var(--archik-fg-dim)" }}>
                Copy
              </span>
              <span>{e.label}</span>
            </button>
          ))}
          <hr
            style={{
              border: 0,
              borderTop: "1px solid var(--archik-border)",
              margin: "4px 0",
            }}
          />
          <button
            type="button"
            className="archik-menu-item"
            onClick={() => {
              saveDocumentAsDownload(filename, document);
              close();
            }}
          >
            <span style={{ minWidth: 60, color: "var(--archik-fg-dim)" }}>
              Download
            </span>
            <span>YAML</span>
          </button>
        </>
      )}
    </Popover>
  );
}
