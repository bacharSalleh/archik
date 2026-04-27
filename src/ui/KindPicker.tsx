import { NODE_KINDS } from "../domain/taxonomy.ts";
import type { NodeKind } from "../domain/types.ts";
import { KIND_META } from "../render/kindPalette.ts";
import { Popover } from "./Popover.tsx";

type Props = {
  value: NodeKind;
  onChange: (kind: NodeKind) => void;
  id?: string;
  ariaLabel?: string;
  disabled?: boolean;
};

export function KindPicker({
  value,
  onChange,
  id,
  ariaLabel,
  disabled,
}: Props): React.ReactElement {
  const current = KIND_META[value];
  const CurrentIcon = current.icon;
  return (
    <Popover
      align="start"
      trigger={(open) => (
        <button
          id={id}
          type="button"
          aria-label={ariaLabel}
          aria-expanded={open}
          disabled={disabled}
          className="archik-input"
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: disabled ? "not-allowed" : "pointer",
            textAlign: "left",
          }}
        >
          <CurrentIcon
            size={14}
            color={current.color}
            strokeWidth={1.8}
          />
          <span style={{ flex: 1 }}>{value}</span>
          <span style={{ opacity: 0.5, fontSize: 10 }}>{open ? "▴" : "▾"}</span>
        </button>
      )}
    >
      {(close) => (
        <div
          style={{
            minWidth: 240,
            maxHeight: "min(60vh, 360px)",
            overflowY: "auto",
            padding: 4,
          }}
        >
          {NODE_KINDS.map((kind) => {
            const meta = KIND_META[kind];
            const Icon = meta.icon;
            const selected = kind === value;
            return (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  onChange(kind);
                  close();
                }}
                className="archik-menu-item"
                style={{
                  background: selected
                    ? "var(--archik-surface-hover)"
                    : undefined,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 16,
                    color: meta.color,
                    flexShrink: 0,
                  }}
                >
                  <Icon size={14} strokeWidth={1.8} />
                </span>
                <span
                  style={{
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: 11,
                    minWidth: 90,
                  }}
                >
                  {kind}
                </span>
                <span
                  style={{
                    color: "var(--archik-fg-dim)",
                    fontSize: 11,
                    flex: 1,
                  }}
                >
                  {meta.description}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Popover>
  );
}
