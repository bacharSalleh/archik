import { useEffect, useRef, useState } from "react";

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

  return (
    <div
      ref={wrapperRef}
      style={{ position: "relative", display: "inline-block" }}
    >
      <div onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {open && (
        <div
          className="archik-popover"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            ...(align === "end" ? { right: 0 } : { left: 0 }),
            zIndex: 20,
            minWidth: 200,
          }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
