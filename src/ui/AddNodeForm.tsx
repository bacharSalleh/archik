import { useEffect, useState } from "react";
import type { NodeKind } from "../domain/types.ts";
import { KindPicker } from "./KindPicker.tsx";

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

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="archik-btn"
      >
        + Node
      </button>
      {open && (
        <div className="archik-modal-overlay" onClick={close}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="archik-modal"
            role="dialog"
            aria-label="Add node"
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                marginBottom: 16,
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: 14,
                  fontWeight: 600,
                  letterSpacing: "0.01em",
                  color: "var(--archik-fg)",
                }}
              >
                Add node
              </h2>
              <span
                style={{ fontSize: 11, color: "var(--archik-fg-dim)" }}
              >
                routed through applyCommand
              </span>
            </div>
            <label className="archik-label" htmlFor="add-node-kind">
              Kind
            </label>
            <div style={{ marginBottom: 12 }}>
              <KindPicker
                id="add-node-kind"
                value={kind}
                onChange={(k: NodeKind) => setKind(k)}
              />
            </div>
            <label className="archik-label" htmlFor="add-node-name">
              Name
            </label>
            <input
              id="add-node-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Inventory Service"
              autoFocus
              className="archik-input"
              style={{ width: "100%", marginBottom: 16 }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={close}
                className="archik-btn"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={name.trim().length === 0}
                className="archik-btn archik-btn-primary"
              >
                Add
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
