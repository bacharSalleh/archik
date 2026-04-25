/**
 * Tiny option parser. Accepts:
 *   --flag value   (next token is the value)
 *   --flag=value   (= form)
 *   --flag         (boolean — value === "true")
 * Positional args end up in `_`.
 */
export type ParsedOptions = {
  _: string[];
  [name: string]: string | string[];
};

export function parseOptions(args: string[]): ParsedOptions {
  const out: ParsedOptions = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq !== -1) {
        out[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else {
        const next = args[i + 1];
        if (next === undefined || next.startsWith("--")) {
          out[arg.slice(2)] = "true";
        } else {
          out[arg.slice(2)] = next;
          i++;
        }
      }
    } else {
      out._.push(arg);
    }
  }
  return out;
}

export function getString(
  opts: ParsedOptions,
  name: string,
): string | undefined {
  const v = opts[name];
  return Array.isArray(v) ? v[0] : v;
}
