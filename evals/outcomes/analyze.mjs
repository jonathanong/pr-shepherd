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

const cases = new Map();
for (const file of files) {
  for (const c of JSON.parse(readFileSync(file, "utf8")).cases) cases.set(c.name, c);
}

const denied = [];
const rows = [];
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
  rows.push({ spec, with: w.kept, without: wo.kept, excluded: w.excluded + wo.excluded });
}
if (denied.length) {
  console.error(`Skill was denied in these with-arm runs; rerun them:\n${denied.join("\n")}`);
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
summary("**All**", rows);

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

function skillDenied(run) {
  if (!run.tracePath || !existsSync(run.tracePath)) return false;
  return SKILL_DENIED.test(readFileSync(run.tracePath, "utf8"));
}
