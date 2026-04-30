/**
 * Minimal glob-to-regex converter for `.driftignore` patterns.
 * Supports: `*` (any segment chars), `**` (any path depth),
 * `?` (single char), literal everything else.
 */

const GLOB_RE = /(\\+)|(\*\*\/?)|(\*)|(\?)/g;

function globToRegex(pattern: string): RegExp {
  let re = "^";
  let last = 0;
  GLOB_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = GLOB_RE.exec(pattern)) !== null) {
    re += escapeRegex(pattern.slice(last, m.index));
    if (m[1]) {
      // escaped literal
      re += escapeRegex(m[1].slice(1));
    } else if (m[2]) {
      // **/ matches any path prefix; ** alone matches anything
      re += m[2].endsWith("/") ? "(?:.*/?)?" : ".*";
    } else if (m[3]) {
      // * — match within a single segment
      re += "[^/]*";
    } else if (m[4]) {
      // ? — single non-separator char
      re += "[^/]";
    }
    last = GLOB_RE.lastIndex;
  }
  re += escapeRegex(pattern.slice(last)) + "$";
  return new RegExp(re);
}

function escapeRegex(s: string): string {
  return s.replace(/[-/\\^$+?.()|[\]{}]/g, "\\$&");
}

export interface IgnoreRule {
  pattern: string;
  regex: RegExp;
}

export function parseDriftignore(text: string): IgnoreRule[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((pattern) => ({ pattern, regex: globToRegex(pattern) }));
}

export function isIgnored(path: string, rules: IgnoreRule[]): IgnoreRule | undefined {
  return rules.find((rule) => rule.regex.test(path));
}
