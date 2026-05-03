import type { Document } from "../domain/types.ts";
import {
  downloadBlob,
  exportFilename,
  snapshotPngBlob,
  snapshotSvgBlob,
} from "../io/canvasExport.ts";
import { exporters } from "../io/exporters.ts";
import { saveDocumentAsDownload } from "../io/fileAdapter.ts";
import { Popover } from "./Popover.tsx";

type Props = {
  /** Architecture document for copy/download YAML options.
   *  When absent (e.g. on the sequence page) those menu items are hidden. */
  document?: Document | undefined;
  filename: string;
  /** Returns the live canvas <svg> element, or null when the canvas
   *  hasn't mounted / laid out yet. SVG and PNG downloads are
   *  hidden until this returns something. */
  getSvg?: () => SVGSVGElement | null;
};

export function ExportMenu({
  document,
  filename,
  getSvg,
}: Props): React.ReactElement {
  const copy = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore — clipboard may be blocked on http://
    }
  };

  const downloadSvg = (): void => {
    const svg = getSvg?.();
    if (!svg) return;
    downloadBlob(exportFilename(filename, "svg"), snapshotSvgBlob(svg));
  };

  const downloadPng = async (): Promise<void> => {
    const svg = getSvg?.();
    if (!svg) return;
    try {
      const blob = await snapshotPngBlob(svg);
      downloadBlob(exportFilename(filename, "png"), blob);
    } catch (err) {
      console.error("PNG export failed:", err);
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
          {document && exporters.map((e) => (
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
          {document && (
            <>
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
          {getSvg && (
            <>
              <button
                type="button"
                className="archik-menu-item"
                onClick={() => {
                  downloadSvg();
                  close();
                }}
              >
                <span style={{ minWidth: 60, color: "var(--archik-fg-dim)" }}>
                  Download
                </span>
                <span>SVG</span>
              </button>
              <button
                type="button"
                className="archik-menu-item"
                onClick={() => {
                  void downloadPng();
                  close();
                }}
              >
                <span style={{ minWidth: 60, color: "var(--archik-fg-dim)" }}>
                  Download
                </span>
                <span>PNG</span>
              </button>
            </>
          )}
        </>
      )}
    </Popover>
  );
}
