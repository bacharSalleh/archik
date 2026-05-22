import readline from "node:readline";
import { bold, cyan, dim } from "./colors.ts";

export interface SelectOption<T> {
  value: T;
  label: string;
  hint?: string;
}

/**
 * Whether we can run an interactive prompt at all. False under `npx … | cat`,
 * CI, or any non-TTY stdin — callers fall back to flags/defaults there.
 */
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/**
 * Present a single-select list. Uses an arrow-key menu when the terminal
 * supports raw mode, and degrades to a numbered prompt otherwise. Rejects
 * on Ctrl-C so the caller can abort cleanly.
 *
 * This is the one piece of the init flow that touches the live terminal, so
 * it's deliberately thin and kept out of the unit-tested code paths.
 */
export async function selectFromList<T>(
  question: string,
  options: SelectOption<T>[],
): Promise<T> {
  const stdin = process.stdin;
  const canRaw = Boolean(stdin.isTTY && typeof stdin.setRawMode === "function");
  return canRaw
    ? arrowSelect(question, options)
    : numberedSelect(question, options);
}

function arrowSelect<T>(
  question: string,
  options: SelectOption<T>[],
): Promise<T> {
  return new Promise<T>((resolve) => {
    const stdin = process.stdin;
    const out = process.stdout;
    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();

    let index = 0;
    let rendered = false;
    const render = (): void => {
      if (rendered) out.write(`\x1b[${options.length}A`);
      else {
        out.write(`${bold("?")} ${question}\n`);
        rendered = true;
      }
      for (let i = 0; i < options.length; i++) {
        const o = options[i]!;
        const on = i === index;
        const pointer = on ? cyan("❯ ") : "  ";
        const label = on ? cyan(o.label) : o.label;
        const hint = o.hint ? dim(` — ${o.hint}`) : "";
        out.write(`\x1b[2K${pointer}${label}${hint}\n`);
      }
    };

    const cleanup = (): void => {
      stdin.off("keypress", onKey);
      stdin.setRawMode(false);
      stdin.pause();
    };

    const onKey = (
      _str: string,
      key: { name?: string; ctrl?: boolean } | undefined,
    ): void => {
      if (!key) return;
      if (key.ctrl && key.name === "c") {
        // Raw mode swallows the default SIGINT, so handle Ctrl-C ourselves:
        // restore the terminal and exit with the conventional 130, rather
        // than bubbling a stack trace up through the command.
        cleanup();
        process.stdout.write("\n");
        process.exit(130);
      } else if (key.name === "up" || key.name === "k") {
        index = (index - 1 + options.length) % options.length;
        render();
      } else if (key.name === "down" || key.name === "j") {
        index = (index + 1) % options.length;
        render();
      } else if (key.name === "return" || key.name === "enter") {
        cleanup();
        resolve(options[index]!.value);
      }
    };

    render();
    stdin.on("keypress", onKey);
  });
}

function numberedSelect<T>(
  question: string,
  options: SelectOption<T>[],
): Promise<T> {
  // Line-event based (not readline/promises in a loop): a question() loop
  // drops buffered lines on piped input. Listening for "line" handles each
  // buffered line correctly and re-prompts on invalid entries.
  return new Promise<T>((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const prompt = `  Enter 1-${options.length}: `;

    process.stdout.write(`${bold("?")} ${question}\n`);
    options.forEach((o, i) => {
      const hint = o.hint ? dim(` — ${o.hint}`) : "";
      process.stdout.write(`  ${i + 1}) ${o.label}${hint}\n`);
    });
    process.stdout.write(prompt);

    let done = false;
    rl.on("line", (line) => {
      const n = Number(line.trim());
      if (Number.isInteger(n) && n >= 1 && n <= options.length) {
        done = true;
        rl.close();
        resolve(options[n - 1]!.value);
      } else {
        process.stdout.write(prompt);
      }
    });
    // Ctrl-D / closed stdin with no valid choice: cancel cleanly. The flag
    // stops our own rl.close() above from being treated as a cancel.
    rl.on("close", () => {
      if (done) return;
      process.stdout.write("\n");
      process.exit(130);
    });
  });
}
