/**
 * Tiny ANSI color helpers. No `chalk` / `picocolors` dependency —
 * those would inflate the published bundle for what amounts to a
 * couple of dozen escape sequences.
 *
 * Auto-disables when stdout isn't a TTY (CI, pipes, file redirects)
 * or when NO_COLOR / FORCE_COLOR=0 is set, matching the de-facto
 * https://no-color.org convention. Honours FORCE_COLOR=1 too.
 */

const enabled = (() => {
  if (process.env["FORCE_COLOR"] === "0") return false;
  if (process.env["FORCE_COLOR"] !== undefined) return true;
  if (process.env["NO_COLOR"] !== undefined) return false;
  return Boolean(process.stdout.isTTY);
})();

const wrap = (open: string, close: string) =>
  (s: string): string =>
    enabled ? `\x1b[${open}m${s}\x1b[${close}m` : s;

export const bold = wrap("1", "22");
export const dim = wrap("2", "22");
export const red = wrap("31", "39");
export const green = wrap("32", "39");
export const yellow = wrap("33", "39");
export const blue = wrap("34", "39");
export const magenta = wrap("35", "39");
export const cyan = wrap("36", "39");
export const gray = wrap("90", "39");

/** ✓ in green, with bold. */
export const tick = (): string => bold(green("✓"));
/** ✗ in red, with bold. */
export const cross = (): string => bold(red("✗"));
/** ▸ accent — for "next step" pointers. */
export const arrow = (): string => cyan("▸");
