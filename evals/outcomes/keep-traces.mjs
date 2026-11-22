#!/usr/bin/env node
// Copies each run's kept trace directory next to the aggregate result, so
// analyze.mjs can be rerun after the runner's temp directories are cleaned up.
//
//   node evals/outcomes/keep-traces.mjs <aggregate-result.json>
//
// A run's `tracePath` is <tmp>/e-XXXX/out/trace.jsonl. Its directory (`out`,
// holding trace.jsonl, mock-calls.jsonl and mocks/) is copied to
// traces/<e-XXXX>/out beside the aggregate file, and `tracePath` is rewritten
// to the copy (an absolute path). The run's sibling directories (the runner's
// config and sealed dirs) are not copied. A run whose copy already exists is
// skipped, so the script can be rerun.

import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Copies the trace dirs of one aggregate file; returns { copied, present, missing }. */
export function keepTraces(aggregatePath) {
  const file = resolve(aggregatePath);
  const result = JSON.parse(readFileSync(file, "utf8"));
  const root = join(dirname(file), "traces");
  const stats = { copied: 0, present: 0, missing: [] };
  for (const c of result.cases ?? []) {
    for (const runs of Object.values(c.arms ?? {})) {
      for (const run of runs) {
        if (!run.tracePath) continue;
        const src = dirname(resolve(run.tracePath));
        const dest = join(root, basename(dirname(src)), basename(src));
        if (src !== dest) {
          if (existsSync(dest)) stats.present++;
          else if (existsSync(src)) {
            cpSync(src, dest, { recursive: true });
            stats.copied++;
          } else {
            stats.missing.push(`${c.name}: ${src}`);
            continue;
          }
        }
        run.tracePath = join(dest, basename(run.tracePath));
      }
    }
  }
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
  return stats;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file] = process.argv.slice(2);
  if (!file) {
    console.error("usage: keep-traces.mjs <aggregate-result.json>");
    process.exit(2);
  }
  const { copied, present, missing } = keepTraces(file);
  console.log(`copied ${copied} trace directories (${present} already present)`);
  if (missing.length) {
    console.error(`missing source directories, left as they were:\n${missing.join("\n")}`);
    process.exit(1);
  }
}
