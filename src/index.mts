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

import { main } from "./cli.mts";

main(process.argv).catch((err) => {
  process.stderr.write(`pr-shepherd error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
