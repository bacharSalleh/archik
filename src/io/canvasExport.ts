/**
 * Browser-side helpers that turn the live canvas <svg> into a
 * downloadable file. Two outputs:
 *
 *   - SVG: serialise + inline theme tokens so it renders standalone
 *     without our CSS. Same logic the CLI uses for `archik render`.
 *   - PNG: rasterise the inlined SVG via an Image + <canvas>, at
 *     2× the natural size so it stays crisp on retina displays.
 *
 * Theme tokens are read from `getComputedStyle(document.documentElement)`
 * so whatever the user sees right now (dark or light) is what they
 * download — no separate "theme" picker needed.
 */
import { inlineThemeVars, type ThemeName } from "../cli/themeTokens.ts";

const PNG_SCALE = 2;

/** All `--archik-*` token names we know about, in inlining order. */
const TOKEN_NAMES: ReadonlyArray<string> = [
  "canvas",
  "panel",
  "surface",
  "surface-hover",
  "fg",
  "fg-dim",
  "fg-muted",
  "border",
  "border-strong",
  "accent",
  "accent-bright",
  "magenta",
  "success",
  "warning",
  "danger",
  "node-fill",
  "node-fill-tinted",
  "node-fill-frame",
  "node-stroke",
  "node-stroke-soft",
  "node-text",
  "node-text-dim",
  "node-caption",
  "node-chrome-dot",
  "edge-filled",
  "edge-open",
  "edge-dim",
  "edge-async",
  "grid-minor",
  "grid-major",
  "selected",
  "selected-glow",
  "container-border",
];

/**
 * Resolve the live `var(--archik-*)` values from the document, then
 * substitute them into the markup. Falls back to the static dark/light
 * tables if computed style resolution yields nothing (e.g. headless
 * test env with no CSS attached).
 */
function inlineFromComputedStyle(svgMarkup: string): string {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return inlineThemeVars(svgMarkup, "dark");
  }
  const root = document.documentElement;
  const styles = getComputedStyle(root);
  const overrides: Record<string, string> = {};
  let foundAny = false;
  for (const name of TOKEN_NAMES) {
    const value = styles.getPropertyValue(`--archik-${name}`).trim();
    if (value !== "") {
      overrides[`--archik-${name}`] = value;
      foundAny = true;
    }
  }
  if (!foundAny) {
    // Probably running headless / unstyled — fall back to dark tokens
    // so the export at least doesn't have raw `var(--…)` strings.
    return inlineThemeVars(svgMarkup, "dark");
  }
  return svgMarkup.replace(
    /var\(--archik-([a-z0-9-]+)\)/g,
    (match, name: string) => overrides[`--archik-${name}`] ?? match,
  );
}

/**
 * Snapshot the live canvas <svg> as a standalone, theme-inlined
 * string ready to download or rasterise. Strips `data-archik-*`
 * runtime attributes that only matter to the editor.
 */
function snapshotSvg(svgEl: SVGSVGElement): string {
  // Clone so we can safely mutate (drop selection state, etc.)
  // without disturbing the live canvas.
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  // Drop selection markers — they're a runtime UI thing, not part
  // of the diagram.
  for (const el of Array.from(
    clone.querySelectorAll("[data-archik-selected]"),
  )) {
    el.removeAttribute("data-archik-selected");
  }
  // Ensure required xmlns attributes for standalone rendering.
  if (!clone.getAttribute("xmlns")) {
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }
  if (!clone.getAttribute("xmlns:xlink")) {
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  }
  const raw = new XMLSerializer().serializeToString(clone);
  const inlined = inlineFromComputedStyle(raw);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${inlined}\n`;
}

export type ExportOptions = {
  /** Override the auto-detected theme. Mostly useful for tests. */
  theme?: ThemeName;
};

/** Synchronous SVG snapshot → Blob. */
export function snapshotSvgBlob(svgEl: SVGSVGElement): Blob {
  return new Blob([snapshotSvg(svgEl)], {
    type: "image/svg+xml;charset=utf-8",
  });
}

/**
 * Rasterise the snapshot to a PNG blob. Uses an in-memory Image
 * + <canvas>; resolves once the image has loaded and been drawn.
 * Rejects if the SVG can't load (typically a malformed clone) or
 * the canvas can't produce a blob (browser quirk on huge sizes).
 */
export function snapshotPngBlob(svgEl: SVGSVGElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const svgString = snapshotSvg(svgEl);
    const svgBlob = new Blob([svgString], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(svgBlob);

    // Source size: prefer the SVG's intrinsic width/height (set by
    // the renderer to viewBox dimensions), fall back to bounding
    // box if those aren't numeric.
    let width = parseFloat(svgEl.getAttribute("width") ?? "0");
    let height = parseFloat(svgEl.getAttribute("height") ?? "0");
    if (!Number.isFinite(width) || width <= 0) {
      const box = svgEl.viewBox?.baseVal;
      width = box ? box.width : svgEl.clientWidth;
    }
    if (!Number.isFinite(height) || height <= 0) {
      const box = svgEl.viewBox?.baseVal;
      height = box ? box.height : svgEl.clientHeight;
    }

    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * PNG_SCALE));
        canvas.height = Math.max(1, Math.round(height * PNG_SCALE));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("2D canvas context unavailable");
        }
        // Paint the canvas background so PNGs aren't transparent
        // when the editor's theme uses a dark background.
        const bg = getComputedStyle(document.documentElement)
          .getPropertyValue("--archik-canvas")
          .trim();
        if (bg !== "") {
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (!blob) {
            reject(new Error("canvas.toBlob returned null"));
            return;
          }
          resolve(blob);
        }, "image/png");
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to rasterise SVG — image failed to load"));
    };
    img.src = url;
  });
}

/** Browser file-save: create an anchor, click it, clean up. */
export function downloadBlob(filename: string, blob: Blob): void {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Slight delay so Safari has a chance to start the download
  // before the URL is revoked.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Derive a sensible export filename from the YAML's source filename.
 * `.archik/main.archik.yaml` + "svg" → "main.archik.svg"
 * `architecture.archik.yaml` + "png" → "architecture.archik.png"
 */
export function exportFilename(source: string, ext: "svg" | "png"): string {
  const base = source.split("/").pop() ?? source;
  const stem = base.replace(/\.ya?ml$/i, "").replace(/^\./, "");
  return `${stem}.${ext}`;
}
