#!/usr/bin/env node
// Compares two tiers' aggregate-result.json.
//
//   node evals/analyze.mjs <dir-a> <dir-b>
//
// Reports per-case Δ side by side, the skill trigger rate per tier, and a
// ceiling-adjusted mean Δ.
//
// Why ceiling-adjusted: a case where both arms already score 1.00 contributes
// Δ=0 and drags the mean toward zero. The tiers hit their ceilings on different
// numbers of cases, so a bare mean-Δ comparison is computed over different
// effective denominators and will mislead. Per-case Δ is the primary result;
// the adjusted mean is reported with its denominator stated.

import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

const dirs = process.argv.slice(2);
if (dirs.length !== 2) {
  console.error("usage: node evals/analyze.mjs <dir-a> <dir-b>");
  process.exit(2);
}

const load = (d) => JSON.parse(readFileSync(join(d, "aggregate-result.json"), "utf8"));
const [A, B] = dirs.map(load);
// basename, not a trailing-segment regex: a directory argument ending in "/" is
// valid for load() but would leave the regex form returning an empty label, so the
// header and summary would silently lose the tier name.
const label = (d) => basename(d.replace(/[/\\]+$/, "")) || d;
const [LA, LB] = dirs.map(label);

const byName = (r) => Object.fromEntries(r.cases.map((c) => [c.name, c]));
const a = byName(A);
const b = byName(B);

// Refuse to compare aggregates from different suite revisions. Silently skipping
// a case that exists in only one side would still leave each tier's mean computed
// over its own full case list, producing two numbers that look comparable but are
// not — and hiding the removed or failed case entirely.
{
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  const onlyA = ka.filter((n) => !(n in b));
  const onlyB = kb.filter((n) => !(n in a));
  if (onlyA.length || onlyB.length) {
    console.error(`✗ the two result sets contain different cases; refusing to compare.`);
    if (onlyA.length) console.error(`  only in ${LA}: ${onlyA.join(", ")}`);
    if (onlyB.length) console.error(`  only in ${LB}: ${onlyB.join(", ")}`);
    console.error(`\nRe-run both tiers against the same generated suite.`);
    process.exit(1);
  }
}

const delta = (c) => (c.aggregates.delta ?? c.aggregates.score - c.aggregates.scoreWithout);
const withS = (c) => c.aggregates.score;
const withoutS = (c) => c.aggregates.scoreWithout;
const isCeiling = (c) => withS(c) === 1 && withoutS(c) === 1;

const fmt = (n) => (n >= 0 ? "+" : "") + n.toFixed(2);

console.log(
  `${"CASE".padEnd(34)} ${LA.padEnd(20)} ${LB.padEnd(20)}`.replace(/\s+$/, ""),
);
console.log(
  `${"".padEnd(34)} ${"with  w/out    Δ".padEnd(20)} ${"with  w/out    Δ".padEnd(20)}`,
);
console.log("-".repeat(76));

for (const name of Object.keys(a)) {
  const ca = a[name];
  const cb = b[name]; // guaranteed present: mismatched case sets exited above
  const cell = (c) =>
    `${withS(c).toFixed(2)}  ${withoutS(c).toFixed(2)}  ${fmt(delta(c))}`.padEnd(20);
  const flag = isCeiling(ca) && isCeiling(cb) ? " (ceiling both)" : "";
  console.log(`${name.padEnd(34)} ${cell(ca)} ${cell(cb)}${flag}`);
}

console.log("-".repeat(76));

for (const [L, R] of [
  [LA, A],
  [LB, B],
]) {
  const cases = R.cases;
  const nonCeiling = cases.filter((c) => !isCeiling(c));
  const meanAll = cases.reduce((s, c) => s + delta(c), 0) / cases.length;
  const meanNC = nonCeiling.length
    ? nonCeiling.reduce((s, c) => s + delta(c), 0) / nonCeiling.length
    : 0;

  // Trigger rate is counted over fire cases only. The should-NOT-fire cases are
  // counted separately below, NOT discarded: their LLM grader passes whenever the
  // answer is correct, and `skill-fired` is display-only, so a widened skill
  // description could start activating on unrelated questions while every score
  // and the fire-case trigger rate still look healthy. The over-trigger rate is
  // the suite's only signal for that.
  const isNeg = (c) => /(^|-)neg-/.test(c.name);
  let fired = 0;
  let total = 0;
  let over = 0;
  let overTotal = 0;
  for (const c of cases) {
    for (const run of c.arms.with) {
      const g = run.graders.find((g) => g.name === "skill-fired");
      if (!g) continue;
      if (isNeg(c)) {
        overTotal++;
        if (g.passed) over++; // fired when it should not have
      } else {
        total++;
        if (g.passed) fired++;
      }
    }
  }

  const overPct = overTotal ? Math.round((100 * over) / overTotal) : 0;
  console.log(
    `${L.padEnd(8)} mean Δ ${fmt(meanAll)} over ${cases.length} cases · ` +
      `mean Δ ${fmt(meanNC)} over ${nonCeiling.length} non-ceiling · ` +
      `skill fired ${fired}/${total} (${total ? Math.round((100 * fired) / total) + "%" : "n/a"}) · ` +
      `$${R.costUsd.toFixed(2)}`,
  );
  console.log(
    `${"".padEnd(8)} over-trigger ${over}/${overTotal} (${overPct}%) on should-NOT-fire cases` +
      (over ? "  ⚠ the skill is activating on out-of-domain prompts" : ""),
  );
}

console.log(
  "\nPer-case Δ is the primary result. Mean Δ across tiers is not directly\n" +
    "comparable — the tiers hit their ceilings on different cases.",
);
