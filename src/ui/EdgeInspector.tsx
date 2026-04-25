import type { Command } from "../domain/commands.ts";
import { RELATIONSHIPS } from "../domain/relationships.ts";
import type { Edge, Relationship } from "../domain/types.ts";

type Props = {
  edge: Edge | undefined;
  dispatch: (cmd: Command) => void;
};

export function EdgeInspector({ edge, dispatch }: Props): React.ReactElement {
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
          placeholder="optional"
          className="archik-input w-full"
        />
      </Field>

      <Field label="Description" htmlFor="ei-desc">
        <textarea
          id="ei-desc"
          value={edge.description ?? ""}
          onChange={(e) => update({ description: e.target.value })}
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
          placeholder="e.g. http, kafka"
          className="archik-input w-full"
        />
      </Field>

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
    </div>
  );
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
