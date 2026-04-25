import { NODE_KINDS } from "../domain/taxonomy.ts";
import { KIND_META } from "../render/kindPalette.ts";
import { Popover } from "./Popover.tsx";

export function Legend(): React.ReactElement {
  return (
    <Popover
      align="end"
      trigger={(open) => (
        <button
          type="button"
          className="archik-btn"
          aria-expanded={open}
        >
          Legend
          <span style={{ opacity: 0.6 }}>{open ? "▴" : "▾"}</span>
        </button>
      )}
    >
      {() => (
        <div style={{ minWidth: 280, padding: 6 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--archik-fg-muted)",
              padding: "4px 6px 8px",
            }}
          >
            Node kinds
          </div>
          {NODE_KINDS.map((kind) => {
            const meta = KIND_META[kind];
            return (
              <div
                key={kind}
                style={{
                  display: "grid",
                  gridTemplateColumns: "16px 80px 1fr",
                  alignItems: "center",
                  gap: 8,
                  padding: "5px 6px",
                  fontSize: 12,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: meta.color,
                    boxShadow: `0 0 6px ${meta.color}`,
                    justifySelf: "center",
                  }}
                />
                <code
                  style={{
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, monospace",
                    color: "var(--archik-fg)",
                    fontSize: 11,
                  }}
                >
                  {kind}
                </code>
                <span style={{ color: "var(--archik-fg-dim)" }}>
                  {meta.description}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Popover>
  );
}
