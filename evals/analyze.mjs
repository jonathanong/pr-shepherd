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
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

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

// Matching case NAMES are not enough. The normal form of an eval edit changes a
// fixture, prompt, rubric, weight or run count without renaming the case, which
// leaves the keys identical while the two runs are no longer the same experiment.
// Fingerprint what each case actually ran — prompt text plus the full grader
// spec — and require it to match. Both fields are already recorded per case in
// aggregate-result.json, so this needs no cooperation from the runner.
{
  const fingerprint = (c) =>
    JSON.stringify({
      prompt: c.promptMarkdown ?? "",
      runs: c.runsPerCase ?? null,
      maxTurns: c.maxTurns ?? null,
      timeout: c.timeoutSeconds ?? null,
      graders: (c.graders ?? [])
        .map((g) => ({ name: g.name, type: g.type, weight: g.weight, config: g.config }))
        .sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0)),
    });

  const drifted = Object.keys(a).filter((n) => fingerprint(a[n]) !== fingerprint(b[n]));
  if (drifted.length) {
    console.error(
      `✗ ${drifted.length} case(s) differ in prompt, graders or run config between\n` +
        `  the two result sets; refusing to compare.`,
    );
    for (const n of drifted.slice(0, 12)) console.error(`  ${n}`);
    if (drifted.length > 12) console.error(`  … and ${drifted.length - 12} more`);
    console.error(
      `\nThese aggregates came from different revisions of the suite, so their\n` +
        `deltas are not comparable. Re-run both tiers against the current cases.`,
    );
    process.exit(1);
  }
}

// The judge is part of the experiment. If one tier is run without the documented
// `--judge-model opus`, its rubric verdicts come from a different — and possibly
// self-preferring — grader, so the two tiers' deltas are not comparable.
{
  const ja = A.suite?.judgeModel ?? "(unrecorded)";
  const jb = B.suite?.judgeModel ?? "(unrecorded)";
  if (ja !== jb) {
    console.error(`✗ the two result sets were graded by different judges; refusing.`);
    console.error(`  ${LA}: ${ja}`);
    console.error(`  ${LB}: ${jb}`);
    console.error(`\nRe-run one tier with the same --judge-model as the other.`);
    process.exit(1);
  }
}

// An interrupted run can record fewer executions than `runsPerCase` without
// attaching a per-run error. The suite fingerprint proves both tiers were
// *configured* for the same run count, not that those runs completed, so the
// precomputed means would silently rest on unequal sample sizes.
{
  const short = [];
  for (const [L, R] of [
    [LA, A],
    [LB, B],
  ]) {
    if (R.partial) short.push(`  ${L}: aggregate is flagged partial`);
    for (const c of R.cases) {
      const want = c.runsPerCase;
      if (!want) continue;
      for (const [arm, runs] of Object.entries(c.arms ?? {})) {
        if (runs.length !== want) {
          short.push(`  ${L} · ${c.name} [${arm}]: ${runs.length} of ${want} runs`);
        }
      }
    }
  }
  if (short.length) {
    console.error(`✗ incomplete result set(s); refusing to compare.`);
    console.error(short.slice(0, 12).join("\n"));
    if (short.length > 12) console.error(`  … and ${short.length - 12} more`);
    process.exit(1);
  }
}

// The case fingerprint above covers the suite but says nothing about the plugin,
// which is the treatment. Compare what each run recorded about the plugin under
// test so a version change between tiers cannot be presented as a model-tier
// difference.
//
// Residual gap, deliberately not papered over: `suite.plugins` carries name,
// version and path, not a source hash, so an edit to SKILL.md that does not bump
// the version is invisible here. Run the tiers back to back, and re-run both
// after touching the skill.
{
  const plugins = (R) =>
    JSON.stringify(
      (R.suite?.plugins ?? []).map((p) => `${p.name}@${p.version}`).sort(),
    );
  const pa = plugins(A);
  const pb = plugins(B);
  if (pa !== pb) {
    console.error(`✗ the two result sets evaluated different plugin versions; refusing.`);
    console.error(`  ${LA}: ${pa}`);
    console.error(`  ${LB}: ${pb}`);
    process.exit(1);
  }
}

// Refuse aggregates whose graders failed to execute. A judge call that throws —
// a session limit is the observed case — is scored 0, which is indistinguishable
// from a model that answered badly and can manufacture a large fake Δ. Without
// this check the operator has to know to grep the JSON by hand before trusting
// any number.
{
  const broken = [];
  for (const [L, R] of [
    [LA, A],
    [LB, B],
  ]) {
    for (const c of R.cases) {
      for (const [arm, runs] of Object.entries(c.arms ?? {})) {
        for (const run of runs) {
          const threw = (run.graders ?? []).filter((g) =>
            /grader threw|judge call failed/i.test(g.explanation ?? ""),
          );
          if (run.error || threw.length) {
            broken.push(
              `  ${L} · ${c.name} [${arm}]: ${run.error ?? `${threw.length} grader(s) threw`}`,
            );
          }
        }
      }
    }
  }
  if (broken.length) {
    console.error(`✗ ${broken.length} run(s) did not execute cleanly; refusing to compare.`);
    console.error(broken.slice(0, 12).join("\n"));
    if (broken.length > 12) console.error(`  … and ${broken.length - 12} more`);
    console.error(
      `\nA grader that threw is scored 0, which is indistinguishable from a bad\n` +
        `answer and can manufacture a large fake Δ. Re-run the affected tier.`,
    );
    process.exit(1);
  }
}

// Classify should-NOT-fire cases from the `neg` tag in their prompt frontmatter,
// not from the slug. A negative case added or renamed without the literal "-neg-"
// substring would otherwise be counted as a fire case: its skill activations
// would inflate the ordinary trigger rate while the over-trigger metric stayed
// empty, defeating the suite's only out-of-domain activation signal.
//
// `aggregate-result.json` does not persist tags, so read them from the case
// directory it records. Results whose directory has since been renamed or removed
// fall back to the slug pattern.
const negByTag = (c) => {
  try {
    const fm = readFileSync(join(REPO_ROOT, c.dir, "prompt.md"), "utf8").split("---")[1] ?? "";
    const tags = /^tags:\s*\[(.*)\]\s*$/m.exec(fm);
    if (tags) return tags[1].split(",").some((t) => t.trim() === "neg");
  } catch {
    // fall through to the slug heuristic
  }
  return /(^|-)neg-/.test(c.name);
};

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
  const isNeg = (c) => negByTag(c);
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
