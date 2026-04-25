import { useState } from "react";
import type { NodeKind } from "../domain/types.ts";
import { NODE_KINDS } from "../domain/taxonomy.ts";

export type AddNodeFormProps = {
  onAdd: (kind: NodeKind, name: string) => void;
};

export function AddNodeForm({ onAdd }: AddNodeFormProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<NodeKind>("service");
  const [name, setName] = useState("");

  const close = (): void => {
    setOpen(false);
    setName("");
    setKind("service");
  };

  const submit = (): void => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    onAdd(kind, trimmed);
    close();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
      >
        + Node
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-1.5 py-1"
    >
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as NodeKind)}
        className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs"
      >
        {NODE_KINDS.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
        className="w-40 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs outline-none focus:border-blue-500"
      />
      <button
        type="submit"
        disabled={name.trim().length === 0}
        className="rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        Add
      </button>
      <button
        type="button"
        onClick={close}
        className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100"
      >
        Cancel
      </button>
    </form>
  );
}
