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
import { join } from "node:path";

const dirs = process.argv.slice(2);
if (dirs.length !== 2) {
  console.error("usage: node evals/analyze.mjs <dir-a> <dir-b>");
  process.exit(2);
}

const load = (d) => JSON.parse(readFileSync(join(d, "aggregate-result.json"), "utf8"));
const [A, B] = dirs.map(load);
const label = (d) => d.replace(/.*\//, "");
const [LA, LB] = dirs.map(label);

const byName = (r) => Object.fromEntries(r.cases.map((c) => [c.name, c]));
const a = byName(A);
const b = byName(B);

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
  const cb = b[name];
  if (!cb) continue;
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

  let fired = 0;
  let total = 0;
  for (const c of cases) {
    if (c.name.startsWith("13-neg")) continue; // should-NOT-fire: a miss is desired
    for (const run of c.arms.with) {
      const g = run.graders.find((g) => g.name === "skill-fired");
      if (!g) continue;
      total++;
      if (g.passed) fired++;
    }
  }

  console.log(
    `${L.padEnd(8)} mean Δ ${fmt(meanAll)} over ${cases.length} cases · ` +
      `mean Δ ${fmt(meanNC)} over ${nonCeiling.length} non-ceiling · ` +
      `skill fired ${fired}/${total} (${Math.round((100 * fired) / total)}%) · ` +
      `$${R.costUsd.toFixed(2)}`,
  );
}

console.log(
  "\nPer-case Δ is the primary result. Mean Δ across tiers is not directly\n" +
    "comparable — the tiers hit their ceilings on different cases.",
);
