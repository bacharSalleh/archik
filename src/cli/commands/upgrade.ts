import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import {
  arrow,
  bold,
  cross,
  cyan,
  dim,
  green,
  tick,
  yellow,
} from "../colors.ts";
import { getString, type ParsedOptions } from "../options.ts";
import { pkgRoot } from "../paths.ts";
import {
  ENGINEERING_LOOP_REFERENCE,
  ensureClaudeMdLink,
  installCommands,
  installEngineeringLoop,
  installPrinciples,
  installSkill,
  installSuperpowersOverlay,
  PRINCIPLES_REFERENCE,
  SUPERPOWERS_REFERENCE,
  type SkillScope,
} from "./skill.ts";

function readOwnVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(path.join(pkgRoot(), "package.json"), "utf-8"),
    ) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function fetchLatestVersion(): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["view", "archik", "version"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout?.on("data", (d: Buffer) => {
      out += d.toString();
    });
    child.on("close", (code) => {
      if (code === 0 && out.trim()) resolve(out.trim());
      else reject(new Error(`npm view archik version exited ${code}`));
    });
  });
}

function runCmd(
  cmd: string,
  args: string[],
  opts?: { cwd?: string; env?: NodeJS.ProcessEnv },
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      cwd: opts?.cwd,
      env: opts?.env ?? process.env,
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function detectPackageManager(): Promise<
  "npm" | "pnpm" | "yarn" | "bun"
> {
  const cwd = process.cwd();
  for (const [lockfile, pm] of [
    ["bun.lockb", "bun"],
    ["yarn.lock", "yarn"],
    ["pnpm-lock.yaml", "pnpm"],
  ] as const) {
    if (existsSync(path.join(cwd, lockfile))) return pm;
  }
  return "npm";
}

type DepKind = "dev" | "prod" | false;

async function detectDepKind(): Promise<DepKind> {
  try {
    const raw = await readFile(
      path.join(process.cwd(), "package.json"),
      "utf-8",
    );
    const pkg = JSON.parse(raw) as {
      devDependencies?: Record<string, string>;
      dependencies?: Record<string, string>;
    };
    if (pkg.devDependencies?.["archik"] !== undefined) return "dev";
    if (pkg.dependencies?.["archik"] !== undefined) return "prod";
  } catch {
    /* no package.json in cwd */
  }
  return false;
}

function buildInstallArgs(
  pm: "npm" | "pnpm" | "yarn" | "bun",
  depKind: DepKind,
): string[] {
  const pkg = "archik@latest";
  switch (pm) {
    case "npm":
      return depKind === "dev"
        ? ["install", pkg, "--save-dev"]
        : ["install", pkg];
    case "pnpm":
      return depKind === "dev" ? ["add", "-D", pkg] : ["add", pkg];
    case "yarn":
      return depKind === "dev" ? ["add", "-D", pkg] : ["add", pkg];
    case "bun":
      return depKind === "dev" ? ["add", "-d", pkg] : ["add", pkg];
  }
}

/** Which optional artifacts a project already has, so we refresh only those. */
function projectArtifacts(cwd: string): {
  paradigm: "oop" | "functional" | null;
  hasSuperpowers: boolean;
} {
  return {
    paradigm: readParadigmMarker(path.join(cwd, ".archik", "PRINCIPLES.md")),
    hasSuperpowers: existsSync(path.join(cwd, ".archik", "SUPERPOWERS.md")),
  };
}

async function refreshArtifacts(
  cwd: string,
  userScope: boolean,
  wireClaude: boolean,
): Promise<void> {
  const localBin = path.join(cwd, "node_modules", ".bin", "archik");
  if (existsSync(localBin)) {
    // In-project upgrade: `npm install` just put the new version in
    // node_modules, so spawn THAT binary — it has the latest templates
    // *and* the latest refresh logic (which the running process may lack
    // if the user ran a plain `npx archik upgrade`).
    await refreshViaSpawn(localBin, cwd, userScope);
  } else {
    // No local install (e.g. `npx archik@latest upgrade` against a project
    // that doesn't depend on archik). The running process is already the
    // target version, so refresh in-process from ITS pkgRoot — never via a
    // bare `npx archik`, which could resolve to a stale global install.
    await refreshInProcess(cwd, userScope);
  }

  // Refreshing the .archik/* files alone isn't enough — CLAUDE.md must
  // actually @-reference them or the model never sees the update. The
  // @-wiring used to happen only in `init`, leaving upgraded projects with
  // an orphaned loop file. Re-assert the managed block here (idempotent,
  // append-only — the user's own prose is preserved).
  if (wireClaude) await wireClaudeMd(cwd);
}

/**
 * Ensure CLAUDE.md's archik-managed block references every artifact the
 * project currently has (loop always; principles/superpowers when present).
 * Pure file manipulation — no templates — so it runs in-process regardless
 * of how the artifact files themselves were refreshed.
 */
async function wireClaudeMd(cwd: string): Promise<void> {
  const noisy = process.stdout.isTTY;
  const { paradigm, hasSuperpowers } = projectArtifacts(cwd);
  const refs = [ENGINEERING_LOOP_REFERENCE];
  if (paradigm) refs.push(PRINCIPLES_REFERENCE);
  if (hasSuperpowers) refs.push(SUPERPOWERS_REFERENCE);

  if (noisy) process.stdout.write(`  Wiring CLAUDE.md...`);
  try {
    const result = await ensureClaudeMdLink({ mode: "append", refs });
    if (noisy) {
      const note =
        result.action === "created"
          ? " (created)"
          : result.action === "appended"
            ? " (added archik block)"
            : "";
      process.stdout.write(` ${tick()}${dim(note)}\n`);
    }
  } catch {
    if (noisy) process.stdout.write(` ${cross()}\n`);
  }
}

async function refreshViaSpawn(
  bin: string,
  cwd: string,
  userScope: boolean,
): Promise<void> {
  const noisy = process.stdout.isTTY;
  const env = { ...process.env, ARCHIK_NO_BANNER: "1" };
  const scopeFlags = userScope ? ["--user"] : [];
  const { paradigm, hasSuperpowers } = projectArtifacts(cwd);

  const step = async (label: string, args: string[]): Promise<void> => {
    if (noisy) process.stdout.write(`  ${label}...`);
    const code = await runCmd(bin, args, { cwd, env });
    if (noisy) process.stdout.write(code === 0 ? ` ${tick()}\n` : ` ${cross()}\n`);
  };

  await step("Refreshing skill", ["skill", "--force", ...scopeFlags]);
  await step("Refreshing commands", ["commands", "--force", ...scopeFlags]);
  // Loop/principles/superpowers always live under `.archik/`, so they're
  // project-scoped — never pass --user.
  await step("Refreshing engineering loop", ["loop", "--force"]);
  if (paradigm) {
    await step(`Refreshing ${paradigm} principles`, ["principles", paradigm, "--force"]);
  }
  if (hasSuperpowers) {
    await step("Refreshing superpowers overlay", ["superpowers", "--force"]);
  }
}

async function refreshInProcess(
  cwd: string,
  userScope: boolean,
): Promise<void> {
  const noisy = process.stdout.isTTY;
  const scope: SkillScope = userScope ? "user" : "project";
  const { paradigm, hasSuperpowers } = projectArtifacts(cwd);

  const step = async (
    label: string,
    fn: () => Promise<{ ok: boolean }>,
  ): Promise<void> => {
    if (noisy) process.stdout.write(`  ${label}...`);
    let ok = false;
    try {
      ok = (await fn()).ok;
    } catch {
      ok = false;
    }
    if (noisy) process.stdout.write(ok ? ` ${tick()}\n` : ` ${cross()}\n`);
  };

  await step("Refreshing skill", () => installSkill({ scope, force: true }));
  await step("Refreshing commands", () => installCommands({ scope, force: true }));
  await step("Refreshing engineering loop", () => installEngineeringLoop({ force: true }));
  if (paradigm) {
    await step(`Refreshing ${paradigm} principles`, () =>
      installPrinciples({ paradigm, force: true }),
    );
  }
  if (hasSuperpowers) {
    await step("Refreshing superpowers overlay", () =>
      installSuperpowersOverlay({ force: true }),
    );
  }
}

/**
 * Recover the paradigm an installed PRINCIPLES.md was generated from, by
 * reading its `archik:principles:<paradigm>` marker. Returns null when the
 * file is absent or unmarked. Read synchronously in the (old) upgrade
 * process — it's a project file, not a packaged template.
 */
function readParadigmMarker(file: string): "oop" | "functional" | null {
  try {
    const content = readFileSync(file, "utf-8");
    const m = content.match(/archik:principles:(oop|functional)/);
    return (m?.[1] as "oop" | "functional" | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function upgradeCommand(opts: ParsedOptions): Promise<number> {
  const skipInstall = getString(opts, "skip-install") === "true";
  const userScope = getString(opts, "user") === "true";
  const wireClaude = getString(opts, "no-claude-md") !== "true";
  const cwd = process.cwd();

  const oldVersion = readOwnVersion();
  console.log(`\n  ${bold("archik upgrade")}\n`);
  console.log(`  Installed : ${dim(oldVersion)}`);

  let latestVersion = oldVersion;

  if (!skipInstall) {
    // ── Step 1: check latest ──────────────────────────────────────
    try {
      process.stdout.write(`  Latest    : `);
      latestVersion = await fetchLatestVersion();
      console.log(dim(latestVersion));
    } catch {
      console.log(yellow("(could not reach npm)"));
      console.error(
        `\n  ${cross()} Could not check the npm registry. Check your connection.\n` +
          `  To refresh the skill only: ${bold("npx archik upgrade --skip-install")}`,
      );
      return 1;
    }

    const upToDate = oldVersion === latestVersion;

    if (upToDate) {
      console.log(`\n  ${tick()} Already up to date`);
    } else {
      console.log(
        `\n  Upgrading  : ${dim(oldVersion)} ${dim("→")} ${bold(green(latestVersion))}\n`,
      );
    }

    // ── Step 2: upgrade the package ──────────────────────────────
    const depKind = await detectDepKind();
    if (depKind !== false) {
      const pm = await detectPackageManager();
      const installArgs = buildInstallArgs(pm, depKind);
      console.log(`  ${dim(`$ ${pm} ${installArgs.join(" ")}`)}\n`);
      const code = await runCmd(pm, installArgs, { cwd });
      if (code !== 0) {
        console.error(`\n  ${cross()} Package manager exited with code ${code}`);
        return 1;
      }
    } else {
      console.log(
        `\n  ${yellow("!")} archik is not in this project's package.json.`,
      );
      if (!upToDate) {
        console.log(
          `    To upgrade globally:   ${bold("npm install -g archik@latest")}`,
        );
        console.log(
          `    To add to project:     ${bold("npm install --save-dev archik@latest")}`,
        );
      }
      console.log(
        `\n  Refreshing skill and commands from the current install...\n`,
      );
    }
  }

  // ── Step 3: refresh skill + commands + loop artifacts + CLAUDE.md ─
  console.log("");
  await refreshArtifacts(cwd, userScope, wireClaude);

  // ── Step 4: next-step message ─────────────────────────────────────
  const upgraded = latestVersion !== oldVersion;
  console.log("");
  console.log(
    `  ${tick()} ${bold("Done")}${upgraded ? `  (v${oldVersion} → v${latestVersion})` : ""}`,
  );
  console.log("");
  console.log(
    `  ${arrow()} ${cyan("Start a new Claude Code conversation")} to pick up the updated skill.`,
  );
  console.log(
    `    ${dim("The current session still holds the old SKILL.md in context.")}`,
  );
  console.log("");
  return 0;
}
