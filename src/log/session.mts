import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function readVersion(): string {
  const pkgUrl = new URL("../../package.json", import.meta.url);
  const pkg = JSON.parse(readFileSync(fileURLToPath(pkgUrl), "utf8")) as { version: string };
  return pkg.version;
}

/** Builds the session header markdown block. */
export function buildSessionHeader(argv: string[]): { markdown: string } {
  const ts = new Date().toISOString();
  const cmd = argv.slice(2).join(" ") || "(no args)";
  const markdown =
    `## ${ts} — pr-shepherd ${cmd}\n\n` + `pid: ${process.pid} · version: ${readVersion()}\n\n`;
  return { markdown };
}

export interface HttpRequestEntry {
  n: number;
  kind: "GraphQL" | "REST" | "restText";
  method: string;
  url: string;
  body?: unknown;
}

export interface HttpResponseEntry {
  n: number;
  kind: "GraphQL" | "REST" | "restText";
  method: string;
  url: string;
  status: number;
  durationMs: number;
  /** Parsed response body. Omit for restText. */
  body?: unknown;
  /** Raw text response body. Omit for restText. */
  textBody?: string;
  contentType?: string;
  contentLength?: number;
  /** Set on 401-retry invocations. */
  attempt?: number;
}

const _maxBodyRaw = Number(process.env["PR_SHEPHERD_LOG_MAX_BODY"]);
const MAX_BODY = Number.isFinite(_maxBodyRaw) && _maxBodyRaw > 0 ? _maxBodyRaw : 256 * 1024;

function truncate(s: string): string {
  if (s.length <= MAX_BODY) return s;
  return `${s.slice(0, MAX_BODY)}\n...[truncated ${s.length - MAX_BODY} characters]`;
}

function fenceBody(body: unknown, lang: string): string {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return `\`\`\`${lang}\n${truncate(raw)}\n\`\`\`\n`;
}

function extractOperationName(query: string): string {
  const match = /^\s*(?:query|mutation|subscription)\s+(\w+)/m.exec(query);
  return match?.[1] ?? "(anonymous)";
}

export function formatRequestEntry(entry: HttpRequestEntry): string {
  const ts = new Date().toISOString();
  const label =
    entry.kind === "GraphQL"
      ? `GraphQL request — POST ${entry.url}`
      : entry.kind === "restText"
        ? `restText request — GET ${entry.url}`
        : `REST request — ${entry.method} ${entry.url}`;

  let out = `### #${entry.n} ${label} · ${ts}\n\n`;

  if (entry.kind === "restText") {
    out += `(body omitted: log artifact)\n\n`;
    return out;
  }

  if (entry.body !== undefined && entry.kind === "GraphQL") {
    const { query, variables } = entry.body as { query: string; variables?: unknown };
    out += `operation: \`${extractOperationName(query)}\`\n`;
    if (variables && Object.keys(variables as object).length > 0) {
      out += `variables:\n${fenceBody(variables, "json")}`;
    } else {
      // For dynamic documents (e.g. BulkApply) the IDs are inlined as aliases.
      // Count the aliases so the log shows how many operations were batched.
      const aliasCount = (query.match(/^\s+[a-z]\d+:/gm) ?? []).length;
      if (aliasCount > 0) out += `aliases: ${aliasCount}\n`;
    }
  } else if (entry.body !== undefined) {
    out += fenceBody(entry.body, "json");
  } else {
    out += `(no body)\n`;
  }

  return out + "\n";
}

export function formatResponseEntry(entry: HttpResponseEntry): string {
  const ts = new Date().toISOString();
  const attempt = entry.attempt !== undefined ? ` (attempt ${entry.attempt}/2 after 401)` : "";
  const label =
    entry.kind === "GraphQL"
      ? `GraphQL response — ${entry.status}${attempt} · ${entry.durationMs}ms`
      : entry.kind === "restText"
        ? `restText response — ${entry.status}${attempt} · ${entry.durationMs}ms`
        : `REST response — ${entry.status}${attempt} · ${entry.durationMs}ms`;

  let out = `### #${entry.n} ${label} · ${ts}\n\n`;

  if (entry.kind === "restText") {
    if (entry.contentLength !== undefined) {
      out += `content-length: ${entry.contentLength} bytes (body not logged)\n\n`;
    } else {
      out += `(body not logged)\n\n`;
    }
    return out;
  }

  if (entry.contentType !== undefined) {
    out += `content-type: ${entry.contentType}`;
    if (entry.contentLength !== undefined) out += ` · ${entry.contentLength} bytes`;
    out += "\n";
  }

  if (entry.body !== undefined) {
    out += fenceBody(entry.body, "json");
  } else if (entry.textBody !== undefined) {
    out += fenceBody(entry.textBody, "");
  }

  return out + "\n";
}

export function formatOutputEntry(text: string, format: "text" | "json"): string {
  const ts = new Date().toISOString();
  const lang = format === "json" ? "json" : "";
  return `### Output (${format}) · ${ts}\n\n${fenceBody(text.trimEnd(), lang)}\n`;
}
