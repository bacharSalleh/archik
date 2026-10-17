import { useEffect, useRef } from "react";

export type DropMenuOption = { label: string; onSelect: () => void };

/**
 * Small menu shown where a dragged node was released: "connect to X",
 * "move inside X" or "move to the top level". Escape or a click
 * outside closes it.
 */
export function DropMenu({
  x,
  y,
  title,
  options,
  onClose,
}: {
  x: number;
  y: number;
  title: string;
  options: DropMenuOption[];
  onClose: () => void;
}): React.ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: PointerEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={title}
      style={{
        position: "fixed",
        left: Math.min(x, window.innerWidth - 230),
        top: Math.min(y, window.innerHeight - 140),
        zIndex: 50,
        minWidth: 200,
        background: "var(--archik-panel)",
        border: "1px solid var(--archik-border)",
        borderRadius: 8,
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        padding: 6,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        fontSize: 12,
      }}
    >
      <div style={{ color: "var(--archik-fg-muted)", padding: "2px 6px 4px" }}>{title}</div>
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          role="menuitem"
          className="archik-btn"
          style={{ justifyContent: "flex-start", padding: "6px 10px", fontSize: 12 }}
          onClick={() => {
            o.onSelect();
            onClose();
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
