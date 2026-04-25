import type { Command } from "../domain/commands.ts";
import type { Node, NodeKind } from "../domain/types.ts";
import { KindPicker } from "./KindPicker.tsx";

type Props = {
  node: Node | undefined;
  dispatch: (cmd: Command) => void;
  onStartConnect?: ((fromId: string) => void) | undefined;
  allNodes?: ReadonlyArray<Node>;
};

export function NodeInspector({
  node,
  dispatch,
  onStartConnect,
  allNodes = [],
}: Props): React.ReactElement {
  if (!node) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center p-6 text-center text-sm"
        style={{ color: "var(--archik-fg-muted)" }}
      >
        Select a node to edit its properties.
      </div>
    );
  }

  const update = (patch: Partial<Node>) =>
    dispatch({ type: "update_node", id: node.id, patch });

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 text-sm">
      <div>
        <div className="archik-label">Id</div>
        <div className="archik-mono">{node.id}</div>
      </div>

      <Field label="Name" htmlFor="ni-name">
        <input
          id="ni-name"
          type="text"
          value={node.name}
          onChange={(e) => update({ name: e.target.value })}
          className="archik-input w-full"
        />
      </Field>

      <Field label="Kind" htmlFor="ni-kind">
        <KindPicker
          id="ni-kind"
          value={node.kind}
          onChange={(kind: NodeKind) => update({ kind })}
        />
      </Field>

      <Field label="Stack" htmlFor="ni-stack">
        <input
          id="ni-stack"
          type="text"
          value={node.stack ?? ""}
          onChange={(e) => update({ stack: e.target.value })}
          placeholder="e.g. Go, Postgres 16"
          className="archik-input w-full"
        />
      </Field>

      <Field label="Description" htmlFor="ni-desc">
        <textarea
          id="ni-desc"
          value={node.description ?? ""}
          onChange={(e) => update({ description: e.target.value })}
          rows={3}
          className="archik-input w-full"
        />
      </Field>

      <Field label="Parent (group)" htmlFor="ni-parent">
        <select
          id="ni-parent"
          value={node.parentId ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            update(v === "" ? { parentId: undefined } : { parentId: v });
          }}
          className="archik-input w-full"
        >
          <option value="">(none)</option>
          {allNodes
            .filter((n) => n.id !== node.id)
            .map((n) => (
              <option key={n.id} value={n.id}>
                {n.name} ({n.id})
              </option>
            ))}
        </select>
      </Field>

      <NotesField
        notes={node.notes ?? []}
        onChange={(next) => update({ notes: next.length > 0 ? next : undefined })}
      />

      <div className="mt-auto flex flex-col gap-2 pt-4 archik-divider">
        {onStartConnect !== undefined && (
          <button
            type="button"
            onClick={() => onStartConnect(node.id)}
            className="archik-btn archik-btn-primary"
            style={{ justifyContent: "center", padding: "8px 12px" }}
          >
            Connect to…
          </button>
        )}
        <button
          type="button"
          onClick={() => dispatch({ type: "remove_node", id: node.id })}
          className="archik-btn archik-btn-danger"
          style={{ justifyContent: "center", padding: "8px 12px" }}
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
      <label htmlFor={htmlFor} className="archik-label">
        {label}
      </label>
      {children}
    </div>
  );
}

function NotesField({
  notes,
  onChange,
}: {
  notes: ReadonlyArray<string>;
  onChange: (next: string[]) => void;
}): React.ReactElement {
  const updateAt = (i: number, value: string): void => {
    const next = notes.slice();
    next[i] = value;
    onChange(next);
  };
  const removeAt = (i: number): void => {
    onChange(notes.filter((_, idx) => idx !== i));
  };
  const add = (): void => {
    onChange([...notes, ""]);
  };
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <span className="archik-label" style={{ margin: 0 }}>
          Notes
        </span>
        <span
          className="archik-mono"
          style={{
            fontSize: 10,
            color: "var(--archik-fg-muted)",
          }}
        >
          {notes.length}
        </span>
      </div>
      {notes.length === 0 && (
        <div
          style={{
            fontSize: 11,
            color: "var(--archik-fg-muted)",
            fontStyle: "italic",
            marginBottom: 6,
          }}
        >
          No notes yet.
        </div>
      )}
      {notes.map((note, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 6,
            alignItems: "flex-start",
          }}
        >
          <textarea
            value={note}
            onChange={(e) => updateAt(i, e.target.value)}
            placeholder={`Note ${i + 1}`}
            rows={2}
            className="archik-input"
            style={{ flex: 1, resize: "vertical", fontSize: 12 }}
          />
          <button
            type="button"
            onClick={() => removeAt(i)}
            title="Remove note"
            aria-label="Remove note"
            className="archik-btn"
            style={{ padding: "4px 8px", color: "var(--archik-danger)" }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="archik-btn"
        style={{ width: "100%", justifyContent: "center" }}
      >
        + Add note
      </button>
    </div>
  );
}
