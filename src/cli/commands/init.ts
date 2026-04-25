import { access, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ParsedOptions } from "../options.ts";

const STARTER = `version: "1.0"
name: My Architecture
description: Initial scaffold — edit this file to grow your diagram.
nodes:
  - id: web
    kind: frontend
    name: Web
    stack: Next.js
  - id: api
    kind: service
    name: API
    stack: Go
  - id: db
    kind: database
    name: Primary DB
    stack: Postgres
edges:
  - id: web-api
    from: web
    to: api
    relationship: http_call
    label: requests
  - id: api-db
    from: api
    to: db
    relationship: writes
`;

export async function initCommand(opts: ParsedOptions): Promise<number> {
  const file = opts._[0] ?? "architecture.archik.yaml";
  const abs = path.resolve(file);
  try {
    await access(abs);
    console.error(`✗ ${file} already exists. Refusing to overwrite.`);
    return 1;
  } catch {
    // file doesn't exist; proceed
  }
  await writeFile(abs, STARTER, "utf-8");
  console.log(`✓ Created ${file}`);
  return 0;
}
