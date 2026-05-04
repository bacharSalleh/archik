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
        <div
          style={{
            minWidth: 320,
            maxHeight: "min(70vh, 520px)",
            overflowY: "auto",
            padding: 6,
          }}
        >
          <div
            style={{
              position: "sticky",
              top: 0,
              background: "var(--archik-panel)",
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--archik-fg-muted)",
              padding: "4px 6px 8px",
              zIndex: 1,
            }}
          >
            Node kinds
          </div>
          {NODE_KINDS.map((kind) => {
            const meta = KIND_META[kind];
            const Icon = meta.icon;
            return (
              <div
                key={kind}
                style={{
                  display: "grid",
                  gridTemplateColumns: "20px 80px 1fr",
                  alignItems: "center",
                  gap: 8,
                  padding: "5px 6px",
                  fontSize: 12,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: meta.color,
                  }}
                >
                  <Icon size={14} strokeWidth={1.8} />
                </span>
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
          <StereotypeLegendSection />
        </div>
      )}
    </Popover>
  );
}

const STEREOTYPE_ENTRIES: Array<{
  id: "boundary" | "control" | "entity";
  varName: string;
  description: string;
}> = [
  {
    id: "boundary",
    varName: "--archik-stereotype-boundary",
    description: "talks to actors / external systems (UIs, adapters)",
  },
  {
    id: "control",
    varName: "--archik-stereotype-control",
    description: "orchestration logic between boundaries and entities",
  },
  {
    id: "entity",
    varName: "--archik-stereotype-entity",
    description: "long-lived domain state (modules, databases)",
  },
];

function StereotypeLegendSection(): React.ReactElement {
  return (
    <>
      <div
        style={{
          position: "sticky",
          top: 0,
          background: "var(--archik-panel)",
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--archik-fg-muted)",
          padding: "12px 6px 8px",
          marginTop: 6,
          borderTop: "1px solid var(--archik-border)",
        }}
      >
        Stereotype (ECB)
      </div>
      {STEREOTYPE_ENTRIES.map((entry) => (
        <div
          key={entry.id}
          style={{
            display: "grid",
            gridTemplateColumns: "20px 80px 1fr",
            alignItems: "center",
            gap: 8,
            padding: "5px 6px",
            fontSize: 12,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: 12,
              height: 12,
              borderRadius: 3,
              background: `var(${entry.varName})`,
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
            {entry.id}
          </code>
          <span style={{ color: "var(--archik-fg-dim)" }}>
            {entry.description}
          </span>
        </div>
      ))}
    </>
  );
}
