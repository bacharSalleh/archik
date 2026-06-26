/**
 * Theme tokens used to inline `var(--archik-*)` references when
 * rendering an SVG to a file. Kept in sync with src/index.css —
 * if you add a new token there, mirror it here so the rendered
 * SVG renders correctly outside the dev server.
 */

export const DARK_THEME_TOKENS: Record<string, string> = {
  "--archik-canvas": "#000000",
  "--archik-panel": "#0a0a0a",
  "--archik-surface": "#161616",
  "--archik-surface-hover": "#222222",

  "--archik-fg": "#ffffff",
  "--archik-fg-dim": "#c8c8c8",
  "--archik-fg-muted": "#9a9a9a",

  "--archik-border": "#262626",
  "--archik-border-strong": "#3d3d3d",

  "--archik-accent": "#22d3ee",
  "--archik-accent-bright": "#67e8f9",
  "--archik-magenta": "#f472b6",
  "--archik-success": "#34d399",
  "--archik-warning": "#fbbf24",
  "--archik-danger": "#fb7185",

  "--archik-node-fill": "#0c0c0c",
  "--archik-node-fill-tinted": "#181818",
  "--archik-node-fill-frame": "#101010",
  "--archik-node-stroke": "#3d3d3d",
  "--archik-node-stroke-soft": "#2a2a2a",
  "--archik-node-text": "#ffffff",
  "--archik-node-text-dim": "#d6d6d6",
  "--archik-node-caption": "#67e8f9",
  "--archik-node-chrome-dot": "#3a3a3a",

  "--archik-edge-filled": "#ededed",
  "--archik-edge-open": "#b0b0b0",
  "--archik-edge-dim": "#7a7a7a",
  "--archik-edge-async": "#67e8f9",

  "--archik-grid-minor": "#0f0f0f",
  "--archik-grid-major": "#1c1c1c",

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

/**
 * Inject a full-bleed background <rect> as the first child of the
 * root <svg>. The in-canvas rendering doesn't need this — the page
 * has its own dark background — but a standalone exported SVG
 * opened in a browser, image viewer, or pasted into a Notion doc
 * needs the canvas color baked in or every dark-themed node floats
 * on whatever the host's body color happens to be.
 */
export function injectBackground(
  svgMarkup: string,
  theme: ThemeName = "dark",
): string {
  const tokens = theme === "light" ? LIGHT_THEME_TOKENS : DARK_THEME_TOKENS;
  const bg = tokens["--archik-canvas"] ?? "#000000";
  // Use the viewBox so the rect covers the negative-origin padding
  // region too (DiagramSvg's viewBox starts at -24,-24). 100% would
  // only cover the positive quadrant.
  const viewBox = svgMarkup.match(/<svg\b[^>]*viewBox="([^"]+)"/);
  const [vx, vy, vw, vh] = (viewBox?.[1] ?? "0 0 0 0").split(/\s+/);
  const rect = `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="${bg}"/>`;
  return svgMarkup.replace(/(<svg\b[^>]*>)/, `$1${rect}`);
}
