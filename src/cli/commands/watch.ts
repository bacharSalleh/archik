import path from "node:path";
import chokidar from "chokidar";
import { renderCommand } from "./render.ts";
import type { ParsedOptions } from "../options.ts";
import { resolveDocPath } from "../resolveDocPath.ts";

export async function watchCommand(opts: ParsedOptions): Promise<number> {
  let abs: string;
  try {
    abs = await resolveDocPath(opts._[0]);
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  const file = path.relative(process.cwd(), abs) || abs;

  const initial = await renderCommand(opts);
  if (initial !== 0) {
    console.error("Initial render failed; staying watchful for fixes.");
  }

  console.log(`Watching ${file} (press Ctrl+C to stop)…`);
  const watcher = chokidar.watch(abs, { ignoreInitial: true });

  watcher.on("change", () => {
    void (async () => {
      const code = await renderCommand(opts);
      const stamp = new Date().toLocaleTimeString();
      if (code === 0) console.log(`[${stamp}] ✓ re-rendered`);
      else console.log(`[${stamp}] ✗ render failed`);
    })();
  });

  return new Promise<number>((resolve) => {
    const shutdown = (): void => {
      void watcher.close().finally(() => resolve(0));
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}
