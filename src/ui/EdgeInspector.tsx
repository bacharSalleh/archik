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
      <div className="flex h-full flex-col items-center justify-center p-6 text-center text-sm text-slate-500">
        Select an edge to edit its properties.
      </div>
    );
  }

  const update = (patch: Partial<Edge>) =>
    dispatch({ type: "update_edge", id: edge.id, patch });

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 text-sm">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500">
          Id
        </div>
        <div className="font-mono text-xs text-slate-900">{edge.id}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">
            From
          </div>
          <div className="font-mono text-xs text-slate-900">{edge.from}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">
            To
          </div>
          <div className="font-mono text-xs text-slate-900">{edge.to}</div>
        </div>
      </div>

      <Field label="Relationship" htmlFor="ei-rel">
        <select
          id="ei-rel"
          value={edge.relationship}
          onChange={(e) =>
            update({ relationship: e.target.value as Relationship })
          }
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 outline-none focus:border-blue-500"
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
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 outline-none focus:border-blue-500"
        />
      </Field>

      <Field label="Description" htmlFor="ei-desc">
        <textarea
          id="ei-desc"
          value={edge.description ?? ""}
          onChange={(e) => update({ description: e.target.value })}
          rows={2}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 outline-none focus:border-blue-500"
        />
      </Field>

      <Field label="Protocol" htmlFor="ei-protocol">
        <input
          id="ei-protocol"
          type="text"
          value={edge.protocol ?? ""}
          onChange={(e) => update({ protocol: e.target.value })}
          placeholder="e.g. http, kafka"
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 outline-none focus:border-blue-500"
        />
      </Field>

      <div className="mt-auto pt-4">
        <button
          type="button"
          onClick={() => dispatch({ type: "disconnect", id: edge.id })}
          className="w-full rounded border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700 hover:bg-rose-100"
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
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
