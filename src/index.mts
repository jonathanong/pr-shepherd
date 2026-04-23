#!/usr/bin/env node
/**
 * pr-shepherd — unified GitHub PR status + auto-resolve CLI
 *
 * Usage:
 *   pr-shepherd check [PR]
 *   pr-shepherd resolve [PR]
 *   pr-shepherd iterate [PR]
 *   pr-shepherd status PR1 [PR2 …]
 */

import { main } from "./cli-parser.mts";

main(process.argv).catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error && err.cause != null ? err.cause : null;
  const causeStr = cause instanceof Error ? `${cause.name}: ${cause.message}` : cause !== null ? String(cause) : null;
  process.stderr.write(`pr-shepherd error: ${msg}${causeStr !== null ? ` (cause: ${causeStr})` : ""}\n`);
  process.exit(1);
});
