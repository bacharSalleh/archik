import type { Command } from "../domain/commands.ts";
import { NODE_KINDS } from "../domain/taxonomy.ts";
import type { Node, NodeKind } from "../domain/types.ts";

type Props = {
  node: Node | undefined;
  dispatch: (cmd: Command) => void;
  onStartConnect?: ((fromId: string) => void) | undefined;
};

export function NodeInspector({
  node,
  dispatch,
  onStartConnect,
}: Props): React.ReactElement {
  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center text-sm text-slate-500">
        Select a node to edit its properties.
      </div>
    );
  }

  const update = (patch: Partial<Node>) =>
    dispatch({ type: "update_node", id: node.id, patch });

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 text-sm">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500">
          Id
        </div>
        <div className="font-mono text-xs text-slate-900">{node.id}</div>
      </div>

      <Field label="Name" htmlFor="ni-name">
        <input
          id="ni-name"
          type="text"
          value={node.name}
          onChange={(e) => update({ name: e.target.value })}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 outline-none focus:border-blue-500"
        />
      </Field>

      <Field label="Kind" htmlFor="ni-kind">
        <select
          id="ni-kind"
          value={node.kind}
          onChange={(e) => update({ kind: e.target.value as NodeKind })}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 outline-none focus:border-blue-500"
        >
          {NODE_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Stack" htmlFor="ni-stack">
        <input
          id="ni-stack"
          type="text"
          value={node.stack ?? ""}
          onChange={(e) => update({ stack: e.target.value })}
          placeholder="e.g. Go, Postgres 16"
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 outline-none focus:border-blue-500"
        />
      </Field>

      <Field label="Description" htmlFor="ni-desc">
        <textarea
          id="ni-desc"
          value={node.description ?? ""}
          onChange={(e) => update({ description: e.target.value })}
          rows={3}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 outline-none focus:border-blue-500"
        />
      </Field>

      <div className="mt-auto flex flex-col gap-2 pt-4">
        {onStartConnect !== undefined && (
          <button
            type="button"
            onClick={() => onStartConnect(node.id)}
            className="w-full rounded border border-blue-200 bg-blue-50 px-3 py-2 text-blue-700 hover:bg-blue-100"
          >
            Connect to…
          </button>
        )}
        <button
          type="button"
          onClick={() => dispatch({ type: "remove_node", id: node.id })}
          className="w-full rounded border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700 hover:bg-rose-100"
        >
          Delete node
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
