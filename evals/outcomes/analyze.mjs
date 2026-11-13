#!/usr/bin/env node
// Summarizes outcome-suite results: plugin (with) vs gh CLI + GitHub MCP
// (without), per scenario and per category, with bootstrap 95% intervals.
//
//   node evals/outcomes/analyze.mjs <aggregate-result.json> [more.json ...]
//
// Later files replace earlier ones case by case, so a targeted rerun can be
// layered over a full run. A run that errored or that the harness voided is
// left out and counted in the `excluded` column. A `with` run whose Skill call
// was denied makes the whole analysis refuse: that arm did not test the plugin.

import { existsSync, readFileSync } from "node:fs";
import { bootstrapDeltas, interval, mean, seedOf } from "../stats.mjs";
import { SCENARIOS } from "./scenarios.mjs";

const SKILL_DENIED = /Permission to use Skill has been denied/;
const VOIDED = /^mocks: |grader threw|judge call failed/i;

const files = process.argv.slice(2);
if (!files.length) {
  console.error("usage: analyze.mjs <aggregate-result.json> [more.json ...]");
  process.exit(2);
}

// An interrupted run can be short of executions without any run error; refuse
// it rather than score the missing runs.
const cases = new Map();
const short = [];
for (const file of files) {
  const result = JSON.parse(readFileSync(file, "utf8"));
  if (result.partial) short.push(`${file}: aggregate is flagged partial`);
  for (const c of result.cases) {
    for (const [arm, runs] of Object.entries(c.arms ?? {})) {
      if (c.runsPerCase && runs.length !== c.runsPerCase) {
        short.push(`${file} · ${c.name} [${arm}]: ${runs.length} of ${c.runsPerCase} runs`);
      }
    }
    cases.set(c.name, c);
  }
}
if (short.length) {
  console.error(`Incomplete results; refusing to report:\n${short.join("\n")}`);
  process.exit(1);
}

const denied = [];
const rows = [];
const unmeasured = [];
for (const spec of SCENARIOS) {
  const c = cases.get(spec.slug);
  if (!c) continue;
  const arm = (name) => {
    const kept = [];
    let excluded = 0;
    for (const r of c.arms[name] ?? []) {
      if (name === "with" && skillDenied(r)) denied.push(`${spec.slug} ${r.tracePath}`);
      if (r.error || (r.graders ?? []).some((g) => VOIDED.test(g.explanation ?? ""))) excluded++;
      else kept.push(r.score);
    }
    return { kept, excluded };
  };
  const w = arm("with");
  const wo = arm("without");
  // An arm with no valid run is unmeasured, not 0: keep it out of every table.
  if (!w.kept.length || !wo.kept.length) unmeasured.push(spec.slug);
  else rows.push({ spec, with: w.kept, without: wo.kept, excluded: w.excluded + wo.excluded });
}
if (denied.length) {
  console.error(
    `Skill was denied, or the trace is gone, in these with-arm runs; rerun them with --keep-temp:\n${denied.join("\n")}`,
  );
  process.exit(1);
}

const fmt = (x) => (x >= 0 ? `+${x.toFixed(2)}` : x.toFixed(2));
const ci = (draws) => (draws ? `[${interval(draws).map(fmt).join(", ")}]` : "n/a");
const row = (cells) => console.log(`| ${cells.join(" | ")} |`);

// A group's draws average its scenarios' draws, so each scenario weighs the same.
function groupDraws(group) {
  const per = group.map((r) => bootstrapDeltas(r.with, r.without, seedOf(r.spec.slug)));
  if (per.some((d) => !d)) return null;
  return per[0].map((_, i) => mean(per.map((d) => d[i])));
}

function summary(name, group) {
  const w = mean(group.map((r) => mean(r.with)));
  const wo = mean(group.map((r) => mean(r.without)));
  row([name, String(group.length), w.toFixed(2), wo.toFixed(2), fmt(w - wo), ci(groupDraws(group))]);
}

console.log("| Category | Scenarios | Plugin | gh/MCP | Δ | 95% CI |");
console.log("| --- | --- | --- | --- | --- | --- |");
const categories = [...new Set(rows.map((r) => r.spec.category))];
for (const cat of categories) summary(cat, rows.filter((r) => r.spec.category === cat));
if (rows.length) summary("**All**", rows);

console.log("\n| Scenario | Category | Plugin | gh/MCP | Δ | 95% CI | Excluded |");
console.log("| --- | --- | --- | --- | --- | --- | --- |");
for (const r of rows) {
  const draws = bootstrapDeltas(r.with, r.without, seedOf(r.spec.slug));
  row([
    `\`${r.spec.slug}\``,
    r.spec.category,
    mean(r.with).toFixed(2),
    mean(r.without).toFixed(2),
    fmt(mean(r.with) - mean(r.without)),
    ci(draws),
    String(r.excluded || ""),
  ]);
}
const missing = SCENARIOS.filter((s) => !cases.has(s.slug)).map((s) => s.slug);
if (missing.length) console.log(`\nNot in these results: ${missing.join(", ")}`);
if (unmeasured.length) {
  console.log(`\nNo valid run in one arm, left out of every table: ${unmeasured.join(", ")}`);
}

// A missing trace cannot show the Skill call went through, so it counts as
// denied: the run needs `--keep-temp`, and the analysis needs its traces.
function skillDenied(run) {
  if (!run.tracePath || !existsSync(run.tracePath)) return true;
  return SKILL_DENIED.test(readFileSync(run.tracePath, "utf8"));
}
