/**
 * `archik gap [path] [--json] [--fail-on-gap]` — what the code must
 * change to match the model. The architect steers the model; the
 * agent works this list until it is empty (`/archik:realize`).
 */
import { describeTask, isSteeringTask } from "../../domain/gap.ts";
import { computeGap } from "../../io/gap.ts";
import { bold, cross, dim, tick, yellow } from "../colors.ts";
import { getString, type ParsedOptions } from "../options.ts";
import { projectRoot, resolveDocPath } from "../resolveDocPath.ts";

const isJson = (opts: ParsedOptions): boolean => {
  const v = getString(opts, "json");
  return v !== undefined && v !== "false" && v !== "0";
};

const LABEL: Record<string, string> = {
  "move-code": "MOVE",
  "create-code": "CREATE",
  "style-break": "STYLE",
  "remove-import": "REMOVE IMPORT",
  "add-dependency": "ADD DEPENDENCY",
  finish: "FINISH",
  "undeclared-import": "UNDECLARED",
};

export async function gapCommand(opts: ParsedOptions): Promise<number> {
  const json = isJson(opts);
  let abs: string;
  try {
    abs = await resolveDocPath(opts._[0] ?? getString(opts, "doc"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (json) console.log(JSON.stringify({ ok: false, error: message }, null, 2));
    else console.error(`${cross()} ${message}`);
    return 2;
  }
  const result = await computeGap(abs, projectRoot(abs));
  if (!result.ok) {
    if (json) console.log(JSON.stringify({ ok: false, error: result.error }, null, 2));
    else console.error(`${cross()} ${result.error}`);
    return 2;
  }
  const all = getString(opts, "all") === "true";
  const steering = result.tasks.filter(isSteeringTask);
  const debt = result.tasks.length - steering.length;
  const tasks = all ? result.tasks : steering;
  if (json) {
    console.log(
      JSON.stringify(
        { ok: true, tasks: tasks.map((t) => ({ ...t, text: describeTask(t) })), undeclaredImports: debt },
        null,
        2,
      ),
    );
  } else if (tasks.length === 0) {
    console.log(`${tick()} the code matches the model`);
  } else {
    console.log(`${bold("GAP")} ${dim(`(${tasks.length})`)} — what the code must change to match the model`);
    tasks.forEach((t, i) => {
      console.log(`  ${String(i + 1).padStart(2)}. ${yellow(LABEL[t.type] ?? t.type)}  ${describeTask(t)}`);
    });
    console.log(dim("\n  Hand it to your agent: /archik:realize"));
  }
  if (!json && !all && debt > 0) {
    console.log(
      dim(`  ${debt} undeclared import${debt === 1 ? "" : "s"} (code dependencies the model never drew) — \`archik gap --all\` lists them`),
    );
  }
  const failOnGap = getString(opts, "fail-on-gap") === "true";
  return failOnGap && steering.length > 0 ? 1 : 0;
}
