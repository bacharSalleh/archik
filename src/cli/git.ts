/**
 * Thin git runner shared by the commands that talk to the repository
 * (`diff <ref>`, `affected --since`, `merge-driver --install`). No
 * library dependency — we shell out to the user's git, same as their
 * hooks and CI do, so behaviour matches what they see on the command
 * line.
 */
import { spawnSync } from "node:child_process";

export type GitResult =
  | { ok: true; out: string }
  | { ok: false; error: string };

export function runGit(args: string[], cwd: string): GitResult {
  const result = spawnSync("git", args, { cwd, encoding: "utf-8" });
  if (result.error !== undefined) {
    return { ok: false, error: result.error.message };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      error: (result.stderr || `git ${args.join(" ")} exited ${result.status}`).trim(),
    };
  }
  return { ok: true, out: result.stdout };
}

/** Absolute path of the repository toplevel containing `cwd`. */
export function gitToplevel(cwd: string): GitResult {
  const r = runGit(["rev-parse", "--show-toplevel"], cwd);
  return r.ok ? { ok: true, out: r.out.trim() } : r;
}

/** True when `ref` resolves to a commit in the repo at `cwd`. */
export function isGitRef(ref: string, cwd: string): boolean {
  const r = runGit(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], cwd);
  return r.ok;
}

/** All blob paths (toplevel-relative) in the tree at `ref`. */
export function listFilesAtRef(ref: string, cwd: string): GitResult {
  return runGit(["ls-tree", "-r", "--name-only", ref], cwd);
}

/** Contents of `relPath` (toplevel-relative) at `ref`. */
export function readFileAtRef(
  ref: string,
  relPath: string,
  cwd: string,
): GitResult {
  return runGit(["show", `${ref}:${relPath}`], cwd);
}
