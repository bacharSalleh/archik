import { useCallback, useEffect, useState } from "react";
import { Popover } from "./Popover.tsx";

type GapTaskView = { type: string; text: string };
type GapState =
  | { status: "loading" }
  | { status: "ready"; tasks: GapTaskView[]; undeclaredImports: number }
  | { status: "error"; message: string };

const LABEL: Record<string, string> = {
  "move-code": "Move",
  "create-code": "Create",
  "style-break": "Style",
  "remove-import": "Remove import",
  "add-dependency": "Add dependency",
  finish: "Finish",
};

/** The text an agent needs to close the gap — pasted into Claude Code. */
export function agentTask(tasks: GapTaskView[]): string {
  return [
    "/archik:realize",
    "",
    "The architecture changed. Make the code match it:",
    ...tasks.map((t, i) => `${i + 1}. ${t.text}`),
    "",
    "Run `npx archik gap` until it reports that the code matches the model.",
  ].join("\n");
}

/**
 * "Code gap" — what the code still has to change to match the model the
 * architect steers. Refreshes when the model is saved (`refreshKey`).
 */
export function GapPanel({ refreshKey }: { refreshKey: number }): React.ReactElement {
  const [state, setState] = useState<GapState>({ status: "loading" });
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/__archik/gap");
      const body = (await res.json()) as {
        ok: boolean;
        tasks?: GapTaskView[];
        undeclaredImports?: number;
        error?: string;
      };
      if (!body.ok) setState({ status: "error", message: body.error ?? `HTTP ${res.status}` });
      else setState({ status: "ready", tasks: body.tasks ?? [], undeclaredImports: body.undeclaredImports ?? 0 });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const count = state.status === "ready" ? state.tasks.length : 0;
  return (
    <Popover
      align="end"
      trigger={(open) => (
        <button
          type="button"
          className="archik-btn"
          aria-expanded={open}
          title="What the code must change to match the model"
          style={{
            whiteSpace: "nowrap",
            ...(count > 0 ? { borderColor: "var(--archik-warning)", color: "var(--archik-warning)" } : {}),
          }}
        >
          Code gap{state.status === "ready" ? ` ${count}` : ""}
          <span style={{ opacity: 0.6 }}>{open ? "▴" : "▾"}</span>
        </button>
      )}
    >
      {() => (
        <div style={{ width: "min(420px, calc(100vw - 16px))", padding: 10, fontSize: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {state.status === "loading" ? <span>Checking the code…</span> : null}
          {state.status === "error" ? <span style={{ color: "var(--archik-danger)" }}>{state.message}</span> : null}
          {state.status === "ready" && state.tasks.length === 0 ? (
            <span style={{ color: "var(--archik-success)" }}>✓ The code matches the model.</span>
          ) : null}
          {state.status === "ready" && state.tasks.length > 0 ? (
            <>
              <span style={{ color: "var(--archik-fg-muted)" }}>
                The model changed; the code has not caught up yet. Hand this to your coding agent.
              </span>
              <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
                {state.tasks.map((t, i) => (
                  <li key={i}>
                    <strong>{LABEL[t.type] ?? t.type}:</strong> {t.text}
                  </li>
                ))}
              </ol>
              <button
                type="button"
                className="archik-btn"
                onClick={() => {
                  void navigator.clipboard.writeText(agentTask(state.tasks)).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
              >
                {copied ? "Copied" : "Copy task for your agent"}
              </button>
            </>
          ) : null}
          {state.status === "ready" && state.undeclaredImports > 0 ? (
            <span style={{ color: "var(--archik-fg-muted)" }}>
              {state.undeclaredImports} code dependencies were never drawn in the model (`archik gap --all`).
            </span>
          ) : null}
          <button type="button" className="archik-btn" onClick={() => void load()}>
            Recheck
          </button>
        </div>
      )}
    </Popover>
  );
}
