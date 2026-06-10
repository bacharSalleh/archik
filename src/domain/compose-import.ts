/**
 * docker-compose → archik importer. Most projects already describe a
 * big slice of their architecture in compose: services, databases,
 * caches, queues, and the depends_on wiring. This module turns that
 * into a first-pass archik document so adoption starts from a
 * 70%-correct diagram instead of a blank canvas.
 *
 * Heuristics, deliberately conservative:
 *   - kind is inferred from the image name (postgres → database,
 *     redis → cache, kafka → stream, …); unknown images with a build
 *     context that exists on disk become `service` with a sourcePath,
 *     anything else becomes `external` (code-bearing kinds must have
 *     real code — the validator would reject them anyway).
 *   - depends_on (list or map form) becomes `depends_on` edges.
 *   - descriptions state their provenance; refining them into real
 *     responsibility statements is the natural follow-up for the
 *     user (or their agent).
 *
 * Pure function: takes the parsed compose object + an exists
 * predicate, returns a Document. YAML/file handling lives in the CLI.
 */
import type { Document, Edge, Node } from "./types.ts";
import type { NodeKind } from "./taxonomy.ts";

type ComposeService = {
  image?: string;
  build?: string | { context?: string };
  depends_on?: string[] | Record<string, unknown>;
};

type ComposeFile = {
  services?: Record<string, ComposeService>;
};

const IMAGE_KINDS: Array<{ pattern: RegExp; kind: NodeKind }> = [
  { pattern: /postgres|mysql|mariadb|mongo|mssql|cockroach|sqlite|clickhouse|cassandra|elasticsearch|opensearch|meilisearch|typesense/, kind: "database" },
  { pattern: /redis|memcached|valkey|keydb/, kind: "cache" },
  { pattern: /rabbitmq|activemq|nats|mosquitto|sqs/, kind: "queue" },
  { pattern: /kafka|redpanda|pulsar/, kind: "stream" },
  { pattern: /qdrant|weaviate|milvus|chroma|pgvector/, kind: "vectordb" },
  { pattern: /minio|localstack/, kind: "storage" },
  { pattern: /traefik|nginx|haproxy|caddy|kong|envoy/, kind: "gateway" },
  { pattern: /keycloak|ory|authelia|zitadel/, kind: "auth" },
  { pattern: /prometheus|grafana|jaeger|loki|tempo|otel|zipkin|datadog/, kind: "observability" },
];

export type ImportIssue = { service: string; message: string };

export type ComposeImportResult = {
  doc: Document;
  issues: ImportIssue[];
};

function toId(name: string): string {
  let id = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!/^[a-z]/.test(id)) id = `svc-${id}`;
  return id;
}

function inferKind(image: string | undefined): NodeKind | undefined {
  if (image === undefined) return undefined;
  const lower = image.toLowerCase();
  for (const { pattern, kind } of IMAGE_KINDS) {
    if (pattern.test(lower)) return kind;
  }
  return undefined;
}

function buildContext(service: ComposeService): string | undefined {
  if (typeof service.build === "string") return service.build;
  if (typeof service.build === "object" && service.build !== null) {
    return service.build.context;
  }
  return undefined;
}

/** Normalise a compose build context ("./api", "api/") into the
 *  forward-slash relative form sourcePath requires. Returns undefined
 *  for contexts that can't be expressed (absolute, escaping root). */
function toSourcePath(context: string): string | undefined {
  let p = context.split("\\").join("/");
  while (p.startsWith("./")) p = p.slice(2);
  p = p.replace(/\/+$/, "");
  if (p === "" || p === ".") return undefined;
  if (p.startsWith("/") || p.split("/").includes("..")) return undefined;
  return p;
}

export function importCompose(
  compose: unknown,
  projectName: string,
  existsDir: (relPath: string) => boolean,
): ComposeImportResult {
  const issues: ImportIssue[] = [];
  const services = (compose as ComposeFile | null)?.services ?? {};
  const entries = Object.entries(services);

  const nodes: Node[] = [];
  const idByService = new Map<string, string>();

  for (const [name, service] of entries) {
    const id = toId(name);
    if (idByService.has(name) || nodes.some((n) => n.id === id)) {
      issues.push({
        service: name,
        message: `service name collides with another service after id sanitisation ("${id}") — skipped`,
      });
      continue;
    }
    idByService.set(name, id);

    const image = service.image;
    const inferred = inferKind(image);
    const context = buildContext(service);
    const sourcePath =
      context !== undefined ? toSourcePath(context) : undefined;

    let kind: NodeKind;
    let nodeSourcePath: string | undefined;
    if (inferred !== undefined) {
      kind = inferred;
    } else if (sourcePath !== undefined && existsDir(sourcePath)) {
      kind = "service";
      nodeSourcePath = sourcePath;
    } else {
      // No recognisable image and no code on disk — `service` would
      // fail validation (code-bearing kinds need a real sourcePath),
      // so model it as external until someone classifies it.
      kind = "external";
      if (sourcePath !== undefined) {
        issues.push({
          service: name,
          message: `build context "${sourcePath}" not found on disk — imported as kind: external; fix the path or reclassify`,
        });
      }
    }

    const provenance =
      image !== undefined
        ? `image: ${image}`
        : context !== undefined
          ? `build: ${context}`
          : "no image or build context";
    const node: Node = {
      id,
      kind,
      name,
      description: `Imported from docker-compose service "${name}" (${provenance}). Refine this description with what the component actually does.`,
    };
    if (nodeSourcePath !== undefined) node.sourcePath = nodeSourcePath;
    nodes.push(node);
  }

  const edges: Edge[] = [];
  const seenEdges = new Set<string>();
  for (const [name, service] of entries) {
    const fromId = idByService.get(name);
    if (fromId === undefined) continue;
    const deps = Array.isArray(service.depends_on)
      ? service.depends_on
      : service.depends_on !== undefined
        ? Object.keys(service.depends_on)
        : [];
    for (const dep of deps) {
      const toIdResolved = idByService.get(dep);
      if (toIdResolved === undefined) {
        issues.push({
          service: name,
          message: `depends_on "${dep}" doesn't match any service — edge skipped`,
        });
        continue;
      }
      if (toIdResolved === fromId) continue; // self-loops are rejected by the schema
      const edgeId = `${fromId}-uses-${toIdResolved}`;
      if (seenEdges.has(edgeId)) continue;
      seenEdges.add(edgeId);
      edges.push({
        id: edgeId,
        from: fromId,
        to: toIdResolved,
        relationship: "depends_on",
      });
    }
  }

  return {
    doc: { version: "1.0", name: projectName, nodes, edges },
    issues,
  };
}
