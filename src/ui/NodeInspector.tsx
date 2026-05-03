import { ArrowRight } from "lucide-react";
import type { Command } from "../domain/commands.ts";
import type { Interface, Node, NodeKind } from "../domain/types.ts";
import { KindPicker } from "./KindPicker.tsx";

type Props = {
  node: Node | undefined;
  dispatch: (cmd: Command) => void;
  onStartConnect?: ((fromId: string) => void) | undefined;
  allNodes?: ReadonlyArray<Node>;
  /** When true, every field is locked and the destructive actions are
   *  hidden — used while reviewing a suggestion sidecar so the user
   *  doesn't accidentally write edits to the wrong document. */
  readOnly?: boolean;
  /** Current document URL — threaded into seq diagram links so the
   *  back button on the sequence page returns to this file. */
  viewKey?: string | undefined;
};

export function NodeInspector({
  node,
  dispatch,
  onStartConnect,
  allNodes = [],
  readOnly = false,
  viewKey,
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
          disabled={readOnly}
          className="archik-input w-full"
        />
      </Field>

      <Field label="Kind" htmlFor="ni-kind">
        <KindPicker
          id="ni-kind"
          value={node.kind}
          onChange={(kind: NodeKind) => update({ kind })}
          disabled={readOnly}
        />
      </Field>

      <Field label="Stack" htmlFor="ni-stack">
        <input
          id="ni-stack"
          type="text"
          value={node.stack ?? ""}
          onChange={(e) => update({ stack: e.target.value })}
          disabled={readOnly}
          placeholder="e.g. Go, Postgres 16"
          className="archik-input w-full"
        />
      </Field>

      <Field label="Description" htmlFor="ni-desc">
        <textarea
          id="ni-desc"
          value={node.description ?? ""}
          onChange={(e) => update({ description: e.target.value })}
          disabled={readOnly}
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
          disabled={readOnly}
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

      <Field label="Source path" htmlFor="ni-sourcepath">
        <input
          id="ni-sourcepath"
          type="text"
          value={node.sourcePath ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            update(v === "" ? { sourcePath: undefined } : { sourcePath: v });
          }}
          disabled={readOnly}
          placeholder="e.g. src/orders or src/payments/api.ts"
          className="archik-input archik-mono w-full"
        />
        <div
          className="mt-1 text-xs"
          style={{ color: "var(--archik-fg-muted)" }}
        >
          Relative to project root. Required for code-bearing kinds in
          normal/suggested files; optional when status is proposed or
          deprecated.
        </div>
      </Field>

      <Field label="Lifecycle status" htmlFor="ni-status">
        <select
          id="ni-status"
          value={node.status ?? "active"}
          onChange={(e) => {
            const v = e.target.value;
            // Schema convention: absent === "active". Round-trip the
            // default to undefined so unchanged nodes don't grow a
            // redundant `status: active` line on every edit.
            update(
              v === "active"
                ? { status: undefined }
                : { status: v as "proposed" | "deprecated" },
            );
          }}
          disabled={readOnly}
          className="archik-input w-full"
        >
          <option value="active">active (default — built and live)</option>
          <option value="proposed">proposed (planned, not built yet)</option>
          <option value="deprecated">deprecated (being phased out)</option>
        </select>
      </Field>

      <InterfacesField
        interfaces={node.interfaces ?? []}
        onChange={(next) =>
          update({ interfaces: next.length > 0 ? next : undefined })
        }
        readOnly={readOnly}
      />

      <ResponsibilitiesField
        responsibilities={node.responsibilities ?? []}
        onChange={(next) =>
          update({ responsibilities: next.length > 0 ? next : undefined })
        }
        readOnly={readOnly}
      />

      <NotesField
        notes={node.notes ?? []}
        onChange={(next) => update({ notes: next.length > 0 ? next : undefined })}
        readOnly={readOnly}
      />

      {node.seqFiles && node.seqFiles.length > 0 && (
        <div>
          <div className="archik-label">Sequence Diagrams</div>
          <div className="flex flex-col gap-1 mt-1">
            {node.seqFiles.map((seqFile) => {
              const label = seqFile.replace(/^.*\//, "").replace(/\.archik\.seq\.yaml$/, "");
              const href = `/__archik/seq?path=${encodeURIComponent(seqFile)}${viewKey ? `&from=${encodeURIComponent(viewKey)}` : ""}`;
              return (
                <a
                  key={seqFile}
                  href={href}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                    padding: "5px 10px",
                    borderRadius: 6,
                    background: "var(--archik-status-proposed)",
                    border: "none",
                    color: "white",
                    fontWeight: 500,
                    textDecoration: "none",
                    cursor: "pointer",
                  }}
                >
                  <ArrowRight size={12} strokeWidth={2} />
                  {label}
                </a>
              );
            })}
          </div>
        </div>
      )}

      {!readOnly && (
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
      )}
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

function InterfacesField({
  interfaces,
  onChange,
  readOnly = false,
}: {
  interfaces: ReadonlyArray<Interface>;
  onChange: (next: Interface[]) => void;
  readOnly?: boolean;
}): React.ReactElement {
  const updateAt = (i: number, patch: Partial<Interface>): void => {
    const next = interfaces.map((iface, idx) =>
      idx === i ? { ...iface, ...patch } : iface,
    );
    onChange(next);
  };
  const removeAt = (i: number): void => {
    onChange(interfaces.filter((_, idx) => idx !== i));
  };
  const add = (): void => {
    onChange([...interfaces, { name: "", protocol: "" }]);
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
          Interfaces
        </span>
        <span
          className="archik-mono"
          style={{ fontSize: 10, color: "var(--archik-fg-muted)" }}
        >
          {interfaces.length}
        </span>
      </div>
      {interfaces.length === 0 && (
        <div
          style={{
            fontSize: 11,
            color: "var(--archik-fg-muted)",
            fontStyle: "italic",
            marginBottom: 6,
          }}
        >
          No interfaces yet.
        </div>
      )}
      {interfaces.map((iface, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            marginBottom: 10,
            padding: "8px",
            borderRadius: 4,
            background: "var(--archik-bg-subtle, rgba(0,0,0,0.04))",
          }}
        >
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <input
              type="text"
              value={iface.name}
              onChange={(e) => updateAt(i, { name: e.target.value })}
              disabled={readOnly}
              placeholder="Interface name"
              className="archik-input"
              style={{ flex: 1, fontSize: 12 }}
            />
            <input
              type="text"
              value={iface.protocol}
              onChange={(e) => updateAt(i, { protocol: e.target.value })}
              disabled={readOnly}
              placeholder="Protocol"
              className="archik-input"
              style={{ width: 80, fontSize: 12 }}
            />
            {!readOnly && (
              <button
                type="button"
                onClick={() => removeAt(i)}
                title="Remove interface"
                aria-label="Remove interface"
                className="archik-btn"
                style={{ padding: "4px 8px", color: "var(--archik-danger)" }}
              >
                ×
              </button>
            )}
          </div>
          <input
            type="text"
            value={iface.description ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              updateAt(i, { description: v === "" ? undefined : v });
            }}
            disabled={readOnly}
            placeholder="Description (optional)"
            className="archik-input"
            style={{ fontSize: 11, color: "var(--archik-fg-muted)" }}
          />
        </div>
      ))}
      {!readOnly && (
        <button
          type="button"
          onClick={add}
          className="archik-btn"
          style={{ width: "100%", justifyContent: "center" }}
        >
          + Add interface
        </button>
      )}
    </div>
  );
}

function ResponsibilitiesField({
  responsibilities,
  onChange,
  readOnly = false,
}: {
  responsibilities: ReadonlyArray<string>;
  onChange: (next: string[]) => void;
  readOnly?: boolean;
}): React.ReactElement {
  const updateAt = (i: number, value: string): void => {
    const next = responsibilities.slice();
    next[i] = value;
    onChange(next);
  };
  const removeAt = (i: number): void => {
    onChange(responsibilities.filter((_, idx) => idx !== i));
  };
  const add = (): void => {
    onChange([...responsibilities, ""]);
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
          Responsibilities
        </span>
        <span
          className="archik-mono"
          style={{ fontSize: 10, color: "var(--archik-fg-muted)" }}
        >
          {responsibilities.length}
        </span>
      </div>
      {responsibilities.length === 0 && (
        <div
          style={{
            fontSize: 11,
            color: "var(--archik-fg-muted)",
            fontStyle: "italic",
            marginBottom: 6,
          }}
        >
          No responsibilities yet.
        </div>
      )}
      {responsibilities.map((resp, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 6,
            alignItems: "center",
          }}
        >
          <input
            type="text"
            value={resp}
            onChange={(e) => updateAt(i, e.target.value)}
            disabled={readOnly}
            placeholder={`Responsibility ${i + 1}`}
            className="archik-input"
            style={{ flex: 1, fontSize: 12 }}
          />
          {!readOnly && (
            <button
              type="button"
              onClick={() => removeAt(i)}
              title="Remove responsibility"
              aria-label="Remove responsibility"
              className="archik-btn"
              style={{ padding: "4px 8px", color: "var(--archik-danger)" }}
            >
              ×
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button
          type="button"
          onClick={add}
          className="archik-btn"
          style={{ width: "100%", justifyContent: "center" }}
        >
          + Add responsibility
        </button>
      )}
    </div>
  );
}

function NotesField({
  notes,
  onChange,
  readOnly = false,
}: {
  notes: ReadonlyArray<string>;
  onChange: (next: string[]) => void;
  readOnly?: boolean;
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
            disabled={readOnly}
            placeholder={`Note ${i + 1}`}
            rows={2}
            className="archik-input"
            style={{ flex: 1, resize: "vertical", fontSize: 12 }}
          />
          {!readOnly && (
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
          )}
        </div>
      ))}
      {!readOnly && (
        <button
          type="button"
          onClick={add}
          className="archik-btn"
          style={{ width: "100%", justifyContent: "center" }}
        >
          + Add note
        </button>
      )}
    </div>
  );
}
