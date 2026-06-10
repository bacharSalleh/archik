/**
 * `archik hooks` — install/uninstall a git pre-commit hook that runs
 * `archik validate` (and optionally `archik drift`) before every
 * commit, so a broken model never reaches CI in the first place.
 *
 * The hook file is marked with a header line; install refuses to
 * clobber a hook it didn't write (unless --force), and uninstall
 * only removes ours. Resolved via `git rev-parse --git-dir` so
 * worktrees and submodules get the right hooks directory.
 */
import { chmod, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { cross, dim, tick } from "../colors.ts";
import { runGit } from "../git.ts";
import { getString, type ParsedOptions } from "../options.ts";

const MARKER = "# archik pre-commit hook (installed by `archik hooks install`)";

function hookScript(withDrift: boolean): string {
  const lines = [
    "#!/bin/sh",
    MARKER,
    "# Remove with `npx archik hooks uninstall`.",
    "",
    'echo "archik: validating model…"',
    "npx --no-install archik validate || exit 1",
  ];
  if (withDrift) {
    lines.push("npx --no-install archik drift || exit 1");
  }
  lines.push("");
  return lines.join("\n");
}

async function hooksDir(cwd: string): Promise<{ ok: true; dir: string } | { ok: false; error: string }> {
  const gitDir = runGit(["rev-parse", "--git-dir"], cwd);
  if (!gitDir.ok) return { ok: false, error: gitDir.error };
  // core.hooksPath overrides the default location (husky et al).
  const hooksPath = runGit(["config", "core.hooksPath"], cwd);
  const dir = hooksPath.ok && hooksPath.out.trim() !== ""
    ? path.resolve(cwd, hooksPath.out.trim())
    : path.resolve(cwd, gitDir.out.trim(), "hooks");
  return { ok: true, dir };
}

export async function hooksCommand(opts: ParsedOptions): Promise<number> {
  const sub = opts._[0];
  if (sub !== "install" && sub !== "uninstall") {
    console.error(
      `${cross()} Usage: archik hooks install [--with-drift] [--force] | archik hooks uninstall`,
    );
    return 2;
  }

  const cwd = process.cwd();
  const resolved = await hooksDir(cwd);
  if (!resolved.ok) {
    console.error(`${cross()} not inside a git repository: ${resolved.error}`);
    return 1;
  }
  const hookPath = path.join(resolved.dir, "pre-commit");

  // Read-first instead of exists-then-read: avoids the
  // check-to-use race and gives one code path for "absent".
  const readCurrent = async (): Promise<string | null> => {
    try {
      return await readFile(hookPath, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  };

  if (sub === "uninstall") {
    const current = await readCurrent();
    if (current === null) {
      console.log(`${tick()} no pre-commit hook installed`);
      return 0;
    }
    if (!current.includes(MARKER)) {
      console.error(
        `${cross()} ${path.relative(cwd, hookPath)} was not installed by archik — leaving it alone`,
      );
      return 1;
    }
    await unlink(hookPath);
    console.log(`${tick()} pre-commit hook removed`);
    return 0;
  }

  const withDrift = getString(opts, "with-drift") !== undefined;
  const force = getString(opts, "force") !== undefined;
  const current = await readCurrent();
  if (current !== null && !current.includes(MARKER) && !force) {
    console.error(
      `${cross()} a pre-commit hook already exists at ${path.relative(cwd, hookPath)} and it isn't archik's.`,
    );
    console.error(
      `  Add \`npx --no-install archik validate || exit 1\` to it yourself, or rerun with --force to overwrite.`,
    );
    return 1;
  }

  await writeFile(hookPath, hookScript(withDrift), "utf-8");
  await chmod(hookPath, 0o755);
  console.log(
    `${tick()} pre-commit hook installed → ${path.relative(cwd, hookPath)}`,
  );
  console.log(
    dim(
      `  runs: archik validate${withDrift ? " + archik drift" : ""} before every commit` +
        ` — uninstall with \`npx archik hooks uninstall\``,
    ),
  );
  return 0;
}
