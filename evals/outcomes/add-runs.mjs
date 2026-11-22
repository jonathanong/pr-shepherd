#!/usr/bin/env node
// Add a follow-up run's results to a full run, so analyze.mjs reads one file.
// analyze.mjs replaces a scenario when a later file has it; this keeps both runs.
//   node evals/outcomes/add-runs.mjs <full.json> <topup.json> <out.json> [--replace <slug> ...]
// A --replace scenario is taken from the top-up file alone (use it when the grader changed).
// Every other scenario in the top-up file gets its runs appended and runsPerCase raised.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function addRuns(full, top, replace = []) {
  const cases = full.cases.map((c) => ({ ...c, arms: { ...c.arms } }));
  const log = [];
  for (const t of top.cases) {
    const i = cases.findIndex((c) => c.name === t.name);
    if (i < 0) throw new Error(`not in full run: ${t.name}`);
    if (
      replace.some((slug) => t.name === slug || t.name.startsWith(`${slug}-`))
    ) {
      cases[i] = t;
      log.push(`replaced ${t.name}`);
      continue;
    }
    const c = cases[i];
    for (const arm of Object.keys(t.arms))
      c.arms[arm] = [...(c.arms[arm] ?? []), ...t.arms[arm]];
    if (c.runsPerCase) c.runsPerCase += t.runsPerCase ?? 0;
    log.push(
      `added runs to ${t.name}: ${Object.entries(c.arms)
        .map(([a, r]) => `${a}=${r.length}`)
        .join(" ")}`,
    );
  }
  return { result: { ...full, cases }, log };
}

export function parseArgs(argv) {
  const files = [];
  const replace = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--replace") replace.push(argv[++i]);
    else files.push(argv[i]);
  }
  if (files.length !== 3 || replace.some((r) => !r)) {
    throw new Error(
      "usage: add-runs.mjs <full.json> <topup.json> <out.json> [--replace <slug> ...]",
    );
  }
  return { files, replace };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { files, replace } = parseArgs(process.argv.slice(2));
  const [fullFile, topFile, outFile] = files;
  const full = JSON.parse(readFileSync(fullFile, "utf8"));
  const top = JSON.parse(readFileSync(topFile, "utf8"));
  const { result, log } = addRuns(full, top, replace);
  writeFileSync(outFile, JSON.stringify(result, null, 2));
  for (const line of log) console.log(line);
}
