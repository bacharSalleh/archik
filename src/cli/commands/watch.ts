import path from "node:path";
import chokidar from "chokidar";
import { renderCommand } from "./render.ts";
import type { ParsedOptions } from "../options.ts";

export async function watchCommand(opts: ParsedOptions): Promise<number> {
  const file = opts._[0] ?? "architecture.archik.yaml";
  const abs = path.resolve(file);

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

  // Keep the process alive forever.
  return new Promise<number>(() => {
    /* never resolves */
  });
}
