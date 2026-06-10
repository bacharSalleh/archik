import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Document, Node } from "../domain/types.ts";
import { useUIStore } from "./store.ts";

/**
 * Toolbar search — find a node by id, name, description, owner, or
 * kind and select it on the canvas (selection highlights the node
 * and opens its inspector). `/` focuses the box from anywhere
 * outside an input; Esc clears and blurs.
 */
type Props = {
  document: Document;
};

const MAX_RESULTS = 8;

function matchNodes(nodes: Node[], query: string): Node[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [];
  const scored: Array<{ node: Node; score: number }> = [];
  for (const node of nodes) {
    const id = node.id.toLowerCase();
    const name = node.name.toLowerCase();
    let score = -1;
    if (id === q || name === q) score = 0;
    else if (id.startsWith(q) || name.startsWith(q)) score = 1;
    else if (id.includes(q) || name.includes(q)) score = 2;
    else if (node.owner?.toLowerCase().includes(q) ?? false) score = 3;
    else if (node.kind.toLowerCase() === q) score = 4;
    else if (node.description?.toLowerCase().includes(q) ?? false) score = 5;
    if (score >= 0) scored.push({ node, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.node.id.localeCompare(b.node.id))
    .slice(0, MAX_RESULTS)
    .map((s) => s.node);
}

export function SearchBox({ document: doc }: Props): React.ReactElement {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectNode = useUIStore((s) => s.selectNode);

  const results = useMemo(
    () => matchNodes(doc.nodes, query),
    [doc.nodes, query],
  );
  const open = focused && results.length > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) {
        return;
      }
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pick = (node: Node): void => {
    selectNode(node.id);
    setQuery("");
    setActive(0);
    inputRef.current?.blur();
  };

  return (
    <div className="relative" style={{ minWidth: 180 }}>
      <Search
        size={13}
        strokeWidth={1.8}
        aria-hidden
        style={{
          position: "absolute",
          left: 8,
          top: "50%",
          transform: "translateY(-50%)",
          color: "var(--archik-fg-dim)",
          pointerEvents: "none",
        }}
      />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-label="Search nodes"
        placeholder="Search nodes  ( / )"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          // Delay so a click on a result fires before the list unmounts.
          setTimeout(() => setFocused(false), 120);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setQuery("");
            inputRef.current?.blur();
            return;
          }
          if (results.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % results.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a - 1 + results.length) % results.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            const node = results[active];
            if (node !== undefined) pick(node);
          }
        }}
        className="archik-input w-full"
        style={{ paddingLeft: 26, fontSize: 12 }}
      />
      {open && (
        <ul
          role="listbox"
          aria-label="Node search results"
          className="absolute z-50 mt-1 w-72 overflow-hidden rounded-md"
          style={{
            background: "var(--archik-panel)",
            border: "1px solid var(--archik-border)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            listStyle: "none",
            margin: "4px 0 0",
            padding: 4,
          }}
        >
          {results.map((node, i) => (
            <li key={node.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault(); // keep focus until pick runs
                  pick(node);
                }}
                onMouseEnter={() => setActive(i)}
                className="flex w-full items-baseline gap-2 rounded px-2 py-1.5 text-left"
                style={{
                  background:
                    i === active ? "var(--archik-accent-soft, rgba(99,102,241,0.18))" : "transparent",
                  color: "var(--archik-fg)",
                  fontSize: 12,
                }}
              >
                <span className="archik-mono" style={{ fontSize: 11 }}>
                  {node.id}
                </span>
                <span style={{ color: "var(--archik-fg-dim)", fontSize: 11 }}>
                  {node.kind}
                </span>
                <span
                  className="truncate"
                  style={{ color: "var(--archik-fg-dim)", fontSize: 11, marginLeft: "auto" }}
                >
                  {node.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
