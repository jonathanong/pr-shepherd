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
//
// Each kept run's out/ dir is also checked (isolation.mjs): a baseline run that
// saw a Shepherd server, tool, slash command or mock, or a plugin run without
// the `cli` server, refuses the whole analysis. A plugin run that never called
// `cli` (outside `create` scenarios, which start with no PR), or whose `cli`
// answers are not the case's recorded text, is voided.
// A scenario with fewer than two kept runs in an arm prints `insufficient` and
// stays out of every mean.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fixtureText, mustChange } from "../lib.mjs";
import { bootstrapDeltas, groupBootstrapDeltas, interval, mean, seedOf } from "../stats.mjs";
import { cliBody } from "./cli-mock.mjs";
import { inspectRun } from "./isolation.mjs";
import { computedScore } from "./score.mjs";
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

// The cli mock the case served: the generated file when it is still on disk,
// else the one the current scenario would generate.
function servedCliMock(spec, c) {
  const file = resolve(c.dir ?? "", "mocks", "cli", "pr-shepherd.md");
  if (existsSync(file)) return readFileSync(file, "utf8");
  const tick = fixtureText(spec.fixture);
  return cliBody(spec, spec.transform ? mustChange(spec.slug, tick, spec.transform) : tick);
}

const denied = [];
const violations = [];
const voids = [];
const toolErrors = { with: 0, without: 0 };
const runCount = { with: 0, without: 0 };
const rows = [];
const insufficient = [];
const scoreMismatch = new Map();
for (const spec of SCENARIOS) {
  const c = cases.get(spec.slug);
  if (!c) continue;
  const arm = (name) => {
    const kept = [];
    let excluded = 0;
    (c.arms[name] ?? []).forEach((r, i) => {
      const label = `${spec.slug} [${name}] run ${i + 1}`;
      if (name === "with" && skillDenied(r)) denied.push(`${spec.slug} ${r.tracePath}`);
      let reason = null;
      if (r.error) reason = "error";
      else if ((r.graders ?? []).some((g) => VOIDED.test(g.explanation ?? "")))
        reason = "harness-voided";
      else if (r.tracePath && existsSync(r.tracePath)) {
        const check = inspectRun(
          name,
          dirname(r.tracePath),
          name === "with" ? servedCliMock(spec, c) : "",
        );
        runCount[name]++;
        toolErrors[name] += check.toolErrors;
        for (const v of check.violations) violations.push(`${label}: ${v}`);
        // A create scenario starts with no PR, so a plan that stops before the
        // PRs exist has nothing to run Shepherd on yet.
        reason =
          check.void === "cli-never-called" && spec.tags?.includes("create") ? null : check.void;
      } else if (name === "without")
        violations.push(`${label}: trace is gone; rerun with --keep-temp`);
      if (reason) {
        excluded++;
        voids.push(`${label}: ${reason}`);
      } else {
        const score = computedScore(r);
        if (typeof r.score === "number" && Math.abs(r.score - score) > 1e-9)
          scoreMismatch.set(spec.slug, (scoreMismatch.get(spec.slug) ?? 0) + 1);
        kept.push(score);
      }
    });
    return { kept, excluded };
  };
  const w = arm("with");
  const wo = arm("without");
  const entry = { spec, with: w.kept, without: wo.kept, excluded: w.excluded + wo.excluded };
  if (w.kept.length < 2 || wo.kept.length < 2) insufficient.push(entry);
  else rows.push(entry);
}
if (denied.length) {
  console.error(
    `Skill was denied, or the trace is gone, in these with-arm runs; rerun them with --keep-temp:\n${denied.join("\n")}`,
  );
  process.exit(1);
}
if (violations.length) {
  console.error(`Arm isolation violated; refusing to report:\n${violations.join("\n")}`);
  process.exit(1);
}
console.log(`isolation: ok (${runCount.without} without runs, ${runCount.with} with runs)`);
console.log(`mock tool_errors: without ${toolErrors.without}, with ${toolErrors.with}\n`);

for (const [slug, n] of scoreMismatch)
  console.log(
    `note: ${slug}: ${n} run(s) where the runner's score differs from the computed one; using computed`,
  );
if (scoreMismatch.size) console.log("");

const fmt = (x) => (x >= 0 ? `+${x.toFixed(2)}` : x.toFixed(2));
const ci = (draws) => (draws ? `[${interval(draws).map(fmt).join(", ")}]` : "n/a");
const row = (cells) => console.log(`| ${cells.join(" | ")} |`);

// A group's draws resample its scenarios, then each scenario's runs (see stats.mjs).
function groupDraws(group, name) {
  return groupBootstrapDeltas(group, seedOf(name));
}

function summary(name, group) {
  const w = mean(group.map((r) => mean(r.with)));
  const wo = mean(group.map((r) => mean(r.without)));
  row([
    name,
    String(group.length),
    w.toFixed(2),
    wo.toFixed(2),
    fmt(w - wo),
    ci(groupDraws(group, name)),
  ]);
}

console.log("| Category | Scenarios | Plugin | gh/MCP | Δ | 95% CI |");
console.log("| --- | --- | --- | --- | --- | --- |");
const categories = [...new Set(rows.map((r) => r.spec.category))];
for (const cat of categories)
  summary(
    cat,
    rows.filter((r) => r.spec.category === cat),
  );
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
for (const r of insufficient) {
  row([
    `\`${r.spec.slug}\``,
    r.spec.category,
    "insufficient",
    "insufficient",
    "",
    "",
    String(r.excluded || ""),
  ]);
}
if (insufficient.length) {
  console.log("\n`insufficient`: fewer than two kept runs in an arm; left out of every mean.");
}
if (voids.length) console.log(`\nVoided runs:\n${voids.map((v) => `- ${v}`).join("\n")}`);
const missing = SCENARIOS.filter((s) => !cases.has(s.slug)).map((s) => s.slug);
if (missing.length) console.log(`\nNot in these results: ${missing.join(", ")}`);

// A missing trace cannot show the Skill call went through, so it counts as
// denied: the run needs `--keep-temp`, and the analysis needs its traces.
function skillDenied(run) {
  if (!run.tracePath || !existsSync(run.tracePath)) return true;
  return SKILL_DENIED.test(readFileSync(run.tracePath, "utf8"));
}
