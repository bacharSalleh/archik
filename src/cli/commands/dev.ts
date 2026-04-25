import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import type { ParsedOptions } from "../options.ts";
import { getString } from "../options.ts";

/** Walk up from this file to the Archik package root. */
function archikRoot(): string {
  // src/cli/commands/dev.ts → src/cli/commands → src/cli → src → root
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..", "..");
}

export async function devCommand(opts: ParsedOptions): Promise<number> {
  const file = opts._[0] ?? "architecture.archik.yaml";
  const docPath = path.resolve(file);

  try {
    await access(docPath);
  } catch {
    console.error(`✗ ${file} not found in ${process.cwd()}`);
    console.error(`  Run \`archik init\` to create one, then try again.`);
    return 1;
  }

  // Tell the Vite plugin to serve / watch this YAML instead of the one
  // in Archik's own install directory.
  process.env["ARCHIK_DOC_PATH"] = docPath;

  const root = archikRoot();
  const portArg = getString(opts, "port");
  const port = portArg !== undefined ? Number.parseInt(portArg, 10) : undefined;
  const host = getString(opts, "host");

  const server = await createServer({
    root,
    configFile: path.join(root, "vite.config.ts"),
    server: {
      open: !opts["no-open"],
      ...(port !== undefined && Number.isFinite(port) ? { port } : {}),
      ...(host !== undefined ? { host } : {}),
    },
  });

  await server.listen();
  console.log(`\narchik dev — editing ${docPath}`);
  server.printUrls();
  console.log("\nPress Ctrl+C to stop.\n");

  // Keep the process alive until interrupted.
  return new Promise<number>((resolve) => {
    const shutdown = async (): Promise<void> => {
      try {
        await server.close();
      } finally {
        resolve(0);
      }
    };
    process.on("SIGINT", () => void shutdown());
    process.on("SIGTERM", () => void shutdown());
  });
}
