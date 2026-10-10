// @ts-nocheck
/**
 * Snapshot helpers for the REST variant of a test-cases fixture (see test-cases/README.md).
 *
 * Every REST run carries the same transport evidence block: `**transport** \`rest\`` plus the
 * `## Unavailable transport fields` list in text, and `transport` / `transportUnavailable` in
 * JSON. That block is asserted against its canonical form, then stripped before the REST output
 * is compared with the GraphQL output. Any remaining difference is a real transport difference
 * and is snapshotted as `output.rest.text.md` / `output.rest.json`.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { formatTransportEvidence } from "../../src/cli/transport-formatter.mts";
import { REST_BATCH_UNAVAILABLE } from "../../src/github/rest-batch-unavailable.mts";

/** The text block every REST iterate/summary output renders for the projected batch. */
export const CANONICAL_REST_TEXT_BLOCK = formatTransportEvidence({
  transport: "rest",
  transportUnavailable: [...REST_BATCH_UNAVAILABLE],
}).join("\n");

/** The per-row block poll-summary and stack-overview layers render for a REST row. */
export const CANONICAL_REST_ITEM_BLOCK = [
  "  - transport `rest`",
  ...REST_BATCH_UNAVAILABLE.map(({ field, reason }) => `  - unavailable \`${field}\`: ${reason}`),
].join("\n");

const TRANSPORT_LINES = new Set(["**transport** `rest`", "  - transport `rest`"]);

/** Strip the transport evidence block(s) from REST text output. */
export function stripRestTextEvidence(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (TRANSPORT_LINES.has(lines[i]) || lines[i].startsWith("  - unavailable `")) continue;
    if (lines[i] === "## Unavailable transport fields") {
      // Drop the heading, the blank line after it, its bullets, and the blank line before it.
      if (out.length > 0 && out[out.length - 1] === "") out.pop();
      i++;
      while (i + 1 < lines.length && lines[i + 1].startsWith("- `")) i++;
      continue;
    }
    out.push(lines[i]);
  }
  return out.join("\n");
}

/** Strip `transport` / `transportUnavailable` keys at any depth from parsed REST JSON. */
export function stripRestJsonEvidence(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripRestJsonEvidence);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "transport" && key !== "transportUnavailable")
        .map(([key, child]) => [key, stripRestJsonEvidence(child)]),
    );
  }
  return value;
}

/** Collect every `transportUnavailable` value at any depth, with its sibling `transport`. */
export function collectRestJsonEvidence(
  value: unknown,
  found: Array<{ transport: unknown; transportUnavailable: unknown }> = [],
) {
  if (Array.isArray(value)) {
    for (const child of value) collectRestJsonEvidence(child, found);
  } else if (value && typeof value === "object") {
    if ("transport" in value || "transportUnavailable" in value) {
      found.push({ transport: value.transport, transportUnavailable: value.transportUnavailable });
    }
    for (const child of Object.values(value)) collectRestJsonEvidence(child, found);
  }
  return found;
}

export function restSnapshotPaths(snapshotDir: string) {
  return {
    text: join(snapshotDir, "output.rest.text.md"),
    json: join(snapshotDir, "output.rest.json"),
  };
}

export function hasRestSnapshot(snapshotDir: string): boolean {
  const paths = restSnapshotPaths(snapshotDir);
  return existsSync(paths.text) || existsSync(paths.json);
}
