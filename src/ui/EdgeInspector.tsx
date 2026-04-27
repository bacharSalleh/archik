import type { Command } from "../domain/commands.ts";
import { RELATIONSHIPS } from "../domain/relationships.ts";
import type { Edge, Relationship } from "../domain/types.ts";

type Props = {
  edge: Edge | undefined;
  dispatch: (cmd: Command) => void;
  /** When true, every field is locked and the destructive actions are
   *  hidden — used while reviewing a suggestion sidecar so the user
   *  doesn't accidentally write edits to the wrong document. */
  readOnly?: boolean;
};

export function EdgeInspector({
  edge,
  dispatch,
  readOnly = false,
}: Props): React.ReactElement {
  if (!edge) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center p-6 text-center text-sm"
        style={{ color: "var(--archik-fg-muted)" }}
      >
        Select an edge to edit its properties.
      </div>
    );
  }

  const update = (patch: Partial<Edge>) =>
    dispatch({ type: "update_edge", id: edge.id, patch });

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 text-sm">
      <div>
        <div className="archik-label">Id</div>
        <div className="archik-mono">{edge.id}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="archik-label">From</div>
          <div className="archik-mono">{edge.from}</div>
        </div>
        <div>
          <div className="archik-label">To</div>
          <div className="archik-mono">{edge.to}</div>
        </div>
      </div>

      <Field label="Relationship" htmlFor="ei-rel">
        <select
          id="ei-rel"
          value={edge.relationship}
          onChange={(e) =>
            update({ relationship: e.target.value as Relationship })
          }
          disabled={readOnly}
          className="archik-input w-full"
        >
          {RELATIONSHIPS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Label" htmlFor="ei-label">
        <input
          id="ei-label"
          type="text"
          value={edge.label ?? ""}
          onChange={(e) => update({ label: e.target.value })}
          disabled={readOnly}
          placeholder="optional"
          className="archik-input w-full"
        />
      </Field>

      <Field label="Description" htmlFor="ei-desc">
        <textarea
          id="ei-desc"
          value={edge.description ?? ""}
          onChange={(e) => update({ description: e.target.value })}
          disabled={readOnly}
          rows={2}
          className="archik-input w-full"
        />
      </Field>

      <Field label="Protocol" htmlFor="ei-protocol">
        <input
          id="ei-protocol"
          type="text"
          value={edge.protocol ?? ""}
          onChange={(e) => update({ protocol: e.target.value })}
          disabled={readOnly}
          placeholder="e.g. http, kafka"
          className="archik-input w-full"
        />
      </Field>

      <Field label="Color" htmlFor="ei-color">
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            id="ei-color"
            type="color"
            value={normalizeHex(edge.color) ?? "#cbd5e1"}
            onChange={(e) => update({ color: e.target.value })}
            disabled={readOnly}
            aria-label="Pick edge color"
            style={{
              width: 28,
              height: 28,
              padding: 0,
              border: "1px solid var(--archik-border)",
              borderRadius: 4,
              background: "transparent",
              cursor: readOnly ? "not-allowed" : "pointer",
              flexShrink: 0,
            }}
          />
          <input
            type="text"
            value={edge.color ?? ""}
            onChange={(e) => {
              const v = e.target.value.trim();
              update({ color: v.length > 0 ? v : undefined });
            }}
            disabled={readOnly}
            placeholder="default (whitish)"
            className="archik-input"
            style={{ flex: 1, fontFamily: "ui-monospace, monospace" }}
          />
          <button
            type="button"
            onClick={() => update({ color: undefined })}
            disabled={readOnly || edge.color === undefined}
            className="archik-btn"
            title="Reset to default color"
          >
            Reset
          </button>
        </div>
      </Field>

      {!readOnly && (
        <div className="mt-auto pt-4 archik-divider">
          <button
            type="button"
            onClick={() => dispatch({ type: "disconnect", id: edge.id })}
            className="archik-btn archik-btn-danger"
            style={{ width: "100%", justifyContent: "center", padding: "8px 12px" }}
          >
            Delete connection
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * <input type="color"> requires a 6-digit hex. If the user typed
 * "rgb(...)", a CSS variable, or named color into the text input we
 * still want the picker to render with a sensible value rather than
 * snapping back to default. Returns null when the string isn't already
 * a hex; the caller falls back to its own default.
 */
function normalizeHex(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const r = trimmed[1]!;
    const g = trimmed[2]!;
    const b = trimmed[3]!;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div>
      <label htmlFor={htmlFor} className="archik-label">
        {label}
      </label>
      {children}
    </div>
  );
}
