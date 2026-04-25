/**
 * Theme tokens used to inline `var(--archik-*)` references when
 * rendering an SVG to a file. Kept in sync with src/index.css —
 * if you add a new token there, mirror it here so the rendered
 * SVG renders correctly outside the dev server.
 */

export const DARK_THEME_TOKENS: Record<string, string> = {
  "--archik-canvas": "#050912",
  "--archik-panel": "#0c1426",
  "--archik-surface": "#14203a",
  "--archik-surface-hover": "#1c2c4d",

  "--archik-fg": "#e6edf7",
  "--archik-fg-dim": "#8b9bb8",
  "--archik-fg-muted": "#5b6a87",

  "--archik-border": "#1d2b48",
  "--archik-border-strong": "#2c3e63",

  "--archik-accent": "#22d3ee",
  "--archik-accent-bright": "#67e8f9",
  "--archik-magenta": "#f472b6",
  "--archik-success": "#34d399",
  "--archik-warning": "#fbbf24",
  "--archik-danger": "#fb7185",

  "--archik-node-fill": "#0c1426",
  "--archik-node-fill-tinted": "#142037",
  "--archik-node-fill-frame": "#14203a",
  "--archik-node-stroke": "#2c3e63",
  "--archik-node-stroke-soft": "#1d2b48",
  "--archik-node-text": "#e6edf7",
  "--archik-node-text-dim": "#b6c2d8",
  "--archik-node-caption": "#67e8f9",
  "--archik-node-chrome-dot": "#475878",

  "--archik-edge-filled": "#cbd5e1",
  "--archik-edge-open": "#94a3b8",
  "--archik-edge-dim": "#64748b",
  "--archik-edge-async": "#67e8f9",

  "--archik-grid-minor": "#0d1830",
  "--archik-grid-major": "#182748",

  "--archik-selected": "#22d3ee",
  "--archik-selected-glow": "rgba(34, 211, 238, 0.28)",
};

export const LIGHT_THEME_TOKENS: Record<string, string> = {
  "--archik-canvas": "#f8fafc",
  "--archik-panel": "#ffffff",
  "--archik-surface": "#f1f5f9",
  "--archik-surface-hover": "#e2e8f0",

  "--archik-fg": "#0f172a",
  "--archik-fg-dim": "#475569",
  "--archik-fg-muted": "#94a3b8",

  "--archik-border": "#e2e8f0",
  "--archik-border-strong": "#cbd5e1",

  "--archik-accent": "#2563eb",
  "--archik-accent-bright": "#3b82f6",
  "--archik-magenta": "#db2777",
  "--archik-success": "#10b981",
  "--archik-warning": "#d97706",
  "--archik-danger": "#e11d48",

  "--archik-node-fill": "#ffffff",
  "--archik-node-fill-tinted": "#f1f5f9",
  "--archik-node-fill-frame": "#ffffff",
  "--archik-node-stroke": "#0f172a",
  "--archik-node-stroke-soft": "#475569",
  "--archik-node-text": "#0f172a",
  "--archik-node-text-dim": "#475569",
  "--archik-node-caption": "#64748b",
  "--archik-node-chrome-dot": "#cbd5f5",

  "--archik-edge-filled": "#0f172a",
  "--archik-edge-open": "#334155",
  "--archik-edge-dim": "#64748b",
  "--archik-edge-async": "#2563eb",

  "--archik-grid-minor": "#e2e8f0",
  "--archik-grid-major": "#cbd5e1",

  "--archik-selected": "#2563eb",
  "--archik-selected-glow": "rgba(37, 99, 235, 0.18)",
};

export type ThemeName = "dark" | "light";

export function inlineThemeVars(
  svgMarkup: string,
  theme: ThemeName = "dark",
): string {
  const tokens = theme === "light" ? LIGHT_THEME_TOKENS : DARK_THEME_TOKENS;
  return svgMarkup.replace(
    /var\(--archik-([a-z0-9-]+)\)/g,
    (match, name: string) => tokens[`--archik-${name}`] ?? match,
  );
}
