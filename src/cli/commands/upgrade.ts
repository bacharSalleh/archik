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

async function refreshArtifacts(
  cwd: string,
  scopeFlags: string[],
): Promise<void> {
  // Prefer the freshly installed local binary so pkgRoot() resolves
  // to the new version's files — not the currently running process.
  const localBin = path.join(cwd, "node_modules", ".bin", "archik");
  const noisy = process.stdout.isTTY;
  const env = { ...process.env, ARCHIK_NO_BANNER: "1" };

  let cmd: string;
  let prefix: string[];
  if (existsSync(localBin)) {
    cmd = localBin;
    prefix = [];
  } else {
    cmd = "npx";
    prefix = ["archik"];
  }

  if (noisy) process.stdout.write(`  Refreshing skill...`);
  const skillCode = await runCmd(
    cmd,
    [...prefix, "skill", "--force", ...scopeFlags],
    { cwd, env },
  );
  if (noisy && skillCode === 0) process.stdout.write(` ${tick()}\n`);
  else if (noisy) process.stdout.write(` ${cross()}\n`);

  if (noisy) process.stdout.write(`  Refreshing commands...`);
  const cmdsCode = await runCmd(
    cmd,
    [...prefix, "commands", "--force", ...scopeFlags],
    { cwd, env },
  );
  if (noisy && cmdsCode === 0) process.stdout.write(` ${tick()}\n`);
  else if (noisy) process.stdout.write(` ${cross()}\n`);
}

export async function upgradeCommand(opts: ParsedOptions): Promise<number> {
  const skipInstall = getString(opts, "skip-install") === "true";
  const userScope = getString(opts, "user") === "true";
  const scopeFlags = userScope ? ["--user"] : [];
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

  // ── Step 3: refresh skill + commands ─────────────────────────────
  console.log("");
  await refreshArtifacts(cwd, scopeFlags);

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
