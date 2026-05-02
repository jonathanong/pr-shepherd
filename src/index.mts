#!/usr/bin/env node
/**
 * pr-shepherd — unified GitHub PR status + auto-resolve CLI
 *
 * Usage:
 *   pr-shepherd [PR]
 *   pr-shepherd check [PR]
 *   pr-shepherd resolve [PR]
 *   pr-shepherd iterate [PR]
 *   pr-shepherd status PR1 [PR2 …]
 */

import { main } from "./cli-parser.mts";

function formatCause(cause: unknown, seen = new Set<unknown>(), depth = 0): string {
  if (depth > 5 || seen.has(cause)) return "[circular or deep cause chain]";
  seen.add(cause);
  if (cause instanceof Error) {
    const stack = cause.stack ?? `${cause.message}`;
    const nested =
      cause.cause != null ? `\n  caused by: ${formatCause(cause.cause, seen, depth + 1)}` : "";
    return `${stack}${nested}`;
  }
  return String(cause);
}

main(process.argv).catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  const causeStr = err instanceof Error && err.cause != null ? formatCause(err.cause) : null;
  process.stderr.write(
    `pr-shepherd error: ${msg}${causeStr !== null ? ` (cause: ${causeStr})` : ""}\n`,
  );
  process.exit(1);
});
