import { useEffect, useRef, useState } from "react";

/**
 * Horizontal translation (px) needed to keep a popover inside the
 * viewport with an 8px margin. Negative = shift left, positive = shift
 * right. Oversized content (wider than the viewport) is pinned to the
 * left margin. Pure so it can be unit-tested without a DOM.
 */
export function popoverShift(
  rect: { left: number; right: number },
  viewportWidth: number,
  margin = 8,
): number {
  let shift = 0;
  if (rect.right > viewportWidth - margin) {
    shift = viewportWidth - margin - rect.right;
  }
  if (rect.left + shift < margin) {
    shift = margin - rect.left;
  }
  return shift;
}

type Props = {
  trigger: (open: boolean) => React.ReactNode;
  align?: "start" | "end";
  children: (close: () => void) => React.ReactNode;
};

export function Popover({
  trigger,
  align = "end",
  children,
}: Props): React.ReactElement {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent): void => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  // Clamp the content into the viewport after it mounts — right-aligned
  // popovers near the screen edge (or any popover on a phone) would
  // otherwise clip off-screen.
  useEffect(() => {
    if (!open) return;
    setShift(0);
    const el = contentRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const s = popoverShift(rect, window.innerWidth);
    if (s !== 0) setShift(s);
  }, [open]);

  return (
    <div
      ref={wrapperRef}
      style={{ position: "relative", display: "inline-block" }}
    >
      <div onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {open && (
        <div
          ref={contentRef}
          className="archik-popover"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            ...(align === "end" ? { right: 0 } : { left: 0 }),
            zIndex: 20,
            minWidth: 200,
            maxWidth: "calc(100vw - 16px)",
            ...(shift !== 0
              ? { transform: `translateX(${shift}px)` }
              : {}),
          }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
