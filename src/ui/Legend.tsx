import { NODE_KINDS } from "../domain/taxonomy.ts";
import {
  RELATIONSHIPS,
  RELATIONSHIP_DESCRIPTION,
  relationshipCategory,
  type Relationship,
} from "../domain/relationships.ts";
import { KIND_META } from "../render/kindPalette.ts";
import { STYLES as EDGE_STYLES } from "../render/EdgeRenderer.tsx";
import {
  diamondArrowPath,
  filledArrowPath,
  openArrowPath,
  triangleArrowPath,
} from "../render/arrowhead.ts";
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
            minWidth: "min(320px, calc(100vw - 16px))",
            maxHeight: "min(70vh, 520px)",
            overflowY: "auto",
            padding: 6,
          }}
        >
          <SectionHeading first>Node kinds</SectionHeading>
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
          <RelationshipLegendSection />
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
      <SectionHeading first={false}>Stereotype (ECB)</SectionHeading>
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

function SectionHeading({
  first,
  children,
}: {
  first?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        background: "var(--archik-panel)",
        fontSize: 10,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--archik-fg-muted)",
        zIndex: 1,
        ...(first === true
          ? { padding: "4px 6px 8px" }
          : {
              padding: "12px 6px 8px",
              marginTop: 6,
              borderTop: "1px solid var(--archik-border)",
            }),
      }}
    >
      {children}
    </div>
  );
}

/**
 * Miniature edge sample for the legend — a horizontal line plus the same
 * explicit arrowhead paths the canvas draws (no SVG markers: they need
 * context-stroke, which WebKit doesn't implement).
 */
function RelationshipGlyph({
  relationship,
}: {
  relationship: Relationship;
}): React.ReactElement {
  const style = EDGE_STYLES[relationship];
  const tip = { x: 48, y: 7 };
  const beforeTip = { x: 14, y: 7 };
  return (
    <svg width={64} height={14} aria-hidden="true">
      <line
        x1={14}
        y1={7}
        x2={48}
        y2={7}
        stroke={style.stroke}
        strokeWidth={style.strokeWidth}
        {...(style.strokeDasharray !== undefined
          ? { strokeDasharray: style.strokeDasharray }
          : {})}
      />
      {style.head === "filled" && (
        <path d={filledArrowPath(tip, beforeTip)} fill={style.stroke} />
      )}
      {style.head === "open" && (
        <path
          d={openArrowPath(tip, beforeTip)}
          fill="none"
          stroke={style.stroke}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {style.head === "triangle" && (
        <path
          d={triangleArrowPath(tip, beforeTip)}
          fill="var(--archik-panel)"
          stroke={style.stroke}
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
      )}
      {style.startHead === "filled" && (
        <path d={filledArrowPath(beforeTip, tip)} fill={style.stroke} />
      )}
      {style.startHead === "diamond" && (
        <path d={diamondArrowPath(beforeTip, tip)} fill={style.stroke} />
      )}
    </svg>
  );
}

function RelationshipLegendSection(): React.ReactElement {
  const runtime = RELATIONSHIPS.filter(
    (rel) => relationshipCategory(rel) === "runtime",
  );
  const structural = RELATIONSHIPS.filter(
    (rel) => relationshipCategory(rel) === "structural",
  );
  return (
    <>
      <SectionHeading first={false}>Relationships</SectionHeading>
      {(
        [
          ["Runtime", runtime],
          ["Structural (UML)", structural],
        ] as const
      ).map(([groupLabel, rels]) => (
        <div key={groupLabel}>
          <div
            style={{
              fontSize: 10,
              color: "var(--archik-fg-muted)",
              padding: "4px 6px 2px",
            }}
          >
            {groupLabel}
          </div>
          {rels.map((rel) => (
            <div
              key={rel}
              style={{
                display: "grid",
                gridTemplateColumns: "64px 90px 1fr",
                alignItems: "center",
                gap: 8,
                padding: "5px 6px",
                fontSize: 12,
              }}
            >
              <RelationshipGlyph relationship={rel} />
              <code
                style={{
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, monospace",
                  color: "var(--archik-fg)",
                  fontSize: 11,
                }}
              >
                {rel}
              </code>
              <span style={{ color: "var(--archik-fg-dim)" }}>
                {RELATIONSHIP_DESCRIPTION[rel]}
              </span>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
