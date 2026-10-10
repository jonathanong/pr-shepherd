#!/usr/bin/env node
// Analyzes `claude plugin eval` result directories (aggregate-result.json).
//
//   node evals/analyze.mjs <dir-a> <dir-b>      compare two tiers
//   node evals/analyze.mjs --summary <dir>      paste-ready summary of one run
//   node evals/analyze.mjs --calibrate <dir> [--write]
//                                               measured tokens vs. the bench's chars/token
//
// Reports per-case Δ side by side with a bootstrap 95% interval, the skill
// trigger rate per tier, and a ceiling-adjusted mean Δ. Only a Δ whose interval
// excludes 0 is flagged: at runs:3 the per-case noise floor is about ±0.44, so a
// bare per-case Δ is mostly unreadable.
//
// Why ceiling-adjusted: a case where both arms already score 1.00 contributes
// Δ=0 and drags the mean toward zero. The tiers hit their ceilings on different
// numbers of cases, so a bare mean-Δ comparison is computed over different
// effective denominators and will mislead. Per-case Δ is the primary result;
// the adjusted mean is reported with its denominator stated.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bootstrapDeltas, excludesZero, interval, mean, ols, seedOf } from "./stats.mjs";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const USAGE =
  "usage: node evals/analyze.mjs <dir-a> <dir-b>\n" +
  "       node evals/analyze.mjs --summary <dir>\n" +
  "       node evals/analyze.mjs --calibrate <dir> [--write]";

const argv = process.argv.slice(2);
// --write is a calibrate-only flag; strip it before counting directory arguments.
const write = argv[0] === "--calibrate" && argv.includes("--write");
const args = write ? argv.filter((a) => a !== "--write") : argv;
const mode =
  args[0] === "--summary" ? "summary" : args[0] === "--calibrate" ? "calibrate" : "compare";
const dirs = mode === "compare" ? args : args.slice(1);
if (dirs.length !== (mode === "compare" ? 2 : 1) || dirs.some((d) => d.startsWith("--"))) {
  console.error(USAGE);
  process.exit(2);
}

const load = (d) => JSON.parse(readFileSync(join(d, "aggregate-result.json"), "utf8"));
// basename, not a trailing-segment regex: a directory argument ending in "/" is
// valid for load() but would leave the regex form returning an empty label, so the
// header and summary would silently lose the tier name.
const label = (d) => basename(d.replace(/[/\\]+$/, "")) || d;
const [LA, LB] = dirs.map(label);
const [A, B] = dirs.map(load);

// --- shared helpers ---------------------------------------------------------

// `skill-fired` is a display-only trigger indicator: the runner excludes it from
// the score in both arms. A grader with weight 0 is display-only for the same reason.
const isDisplayOnly = (g) => g.name === "skill-fired" || g.weight === 0;

const caseWeights = (c) => Object.fromEntries((c.graders ?? []).map((g) => [g.name, g.weight]));

/** A run's score: the recorded score, else the weighted mean of its scored graders. */
function runScore(run, weights) {
  if (typeof run.score === "number") return run.score;
  let num = 0;
  let den = 0;
  for (const g of run.graders ?? []) {
    if (isDisplayOnly(g)) continue;
    const w = g.weight ?? weights[g.name] ?? 1;
    num += w * (typeof g.score === "number" ? g.score : g.passed ? 1 : 0);
    den += w;
  }
  return den ? num / den : 0;
}

const armScores = (c, arm) => (c.arms?.[arm] ?? []).map((r) => runScore(r, caseWeights(c)));

/**
 * Per-case Δ interval from a bootstrap over runs. `null` when either arm has
 * fewer than two runs: with one run there is no spread to estimate, so the Δ is
 * reported without a verdict instead of with a made-up one.
 */
function caseInterval(c) {
  const draws = bootstrapDeltas(armScores(c, "with"), armScores(c, "without"), seedOf(c.name));
  return draws && { draws, ci: interval(draws) };
}

/** Mean Δ over a set of cases with a bootstrap interval (cases resampled jointly per draw). */
function meanDeltaInterval(cases) {
  const per = cases.map(caseInterval);
  if (!cases.length || per.some((p) => !p)) return null;
  return interval(per[0].draws.map((_, i) => mean(per.map((p) => p.draws[i]))));
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
const frontmatterTags = (c) => {
  try {
    const fm = readFileSync(join(REPO_ROOT, c.dir, "prompt.md"), "utf8").split("---")[1] ?? "";
    const tags = /^tags:\s*\[(.*)\]\s*$/m.exec(fm);
    if (tags) return tags[1].split(",").map((t) => t.trim());
  } catch {
    // fall through to the slug heuristic
  }
  return null;
};
const negByTag = (c) => frontmatterTags(c)?.includes("neg") ?? /(^|-)neg-/.test(c.name);
const tierOf = (c) =>
  frontmatterTags(c)
    ?.find((t) => t.startsWith("tier:"))
    ?.slice(5) ?? null;
const isStack = (c) => /(^|-)stack-/.test(c.name);

const delta = (c) => c.aggregates.delta ?? c.aggregates.score - c.aggregates.scoreWithout;
const withS = (c) => c.aggregates.score;
const withoutS = (c) => c.aggregates.scoreWithout;
const isCeiling = (c) => withS(c) === 1 && withoutS(c) === 1;

const fmt = (n) => (n >= 0 ? "+" : "") + n.toFixed(2);
const fmtCi = ([lo, hi]) => `[${fmt(lo)}, ${fmt(hi)}]`;
const pctOf = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : "n/a");
const runCount = (R) =>
  R.cases.reduce((s, c) => s + Object.values(c.arms ?? {}).reduce((t, r) => t + r.length, 0), 0);

/** Hash of the plugin source as it is on disk now. */
function pluginSourceHash() {
  const root = join(REPO_ROOT, "plugins", "pr-shepherd");
  const files = [];
  const walk = (d) => {
    const entries = readdirSync(d, { withFileTypes: true }).sort((x, y) => (x.name < y.name ? -1 : 1));
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(root);
  const h = createHash("sha256");
  for (const f of files) h.update(f.slice(root.length)).update(readFileSync(f));
  return h.digest("hex").slice(0, 12);
}

/** The source hash of the plugin under test, if the runner recorded one. */
const recordedHash = (p) => p.sha256 ?? p.sourceHash ?? p.hash ?? null;

// A grader that threw — a judge call hitting a session limit is the observed
// case — is scored 0, which is indistinguishable from a model that answered
// badly and can manufacture a large fake Δ. Without this check the operator has
// to know to grep the JSON by hand before trusting any number.
function refuseBroken(sets) {
  const broken = [];
  for (const [L, R] of sets) {
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
    console.error(`✗ ${broken.length} run(s) did not execute cleanly; refusing to continue.`);
    console.error(broken.slice(0, 12).join("\n"));
    if (broken.length > 12) console.error(`  … and ${broken.length - 12} more`);
    console.error(
      `\nA grader that threw is scored 0, which is indistinguishable from a bad\n` +
        `answer and can manufacture a large fake Δ. Re-run the affected tier.`,
    );
    process.exit(1);
  }
}

// An interrupted run can record fewer executions than `runsPerCase` without
// attaching a per-run error. The suite fingerprint proves both tiers were
// *configured* for the same run count, not that those runs completed, so the
// precomputed means would silently rest on unequal sample sizes.
function refuseIncomplete(sets) {
  const short = [];
  for (const [L, R] of sets) {
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
    console.error(`✗ incomplete result set(s); refusing to continue.`);
    console.error(short.slice(0, 12).join("\n"));
    if (short.length > 12) console.error(`  … and ${short.length - 12} more`);
    process.exit(1);
  }
}

/** Trigger and over-trigger counts over the with-plugin arm. */
function triggerCounts(R) {
  // Trigger rate is counted over fire cases only. The should-NOT-fire cases are
  // counted separately, NOT discarded: their LLM grader passes whenever the
  // answer is correct, and `skill-fired` is display-only, so a widened skill
  // description could start activating on unrelated questions while every score
  // and the fire-case trigger rate still look healthy. The over-trigger rate is
  // the suite's only signal for that.
  const t = { fired: 0, total: 0, over: 0, overTotal: 0 };
  for (const c of R.cases) {
    for (const run of c.arms.with) {
      const g = run.graders.find((g) => g.name === "skill-fired");
      if (!g) continue;
      if (negByTag(c)) {
        t.overTotal++;
        if (g.passed) t.over++; // fired when it should not have
      } else {
        t.total++;
        if (g.passed) t.fired++;
      }
    }
  }
  return t;
}

// --- --summary: one run, paste-ready ----------------------------------------

if (mode === "summary") {
  refuseIncomplete([[LA, A]]);
  refuseBroken([[LA, A]]);
  const cases = A.cases;
  const withCi = cases.map((c) => ({ c, iv: caseInterval(c) }));
  const sig = withCi.filter((x) => x.iv && excludesZero(x.iv.ci));
  const positive = sig.filter((x) => delta(x.c) > 0);
  const regressions = sig.filter((x) => delta(x.c) < 0);
  const nonStack = cases.filter((c) => !isStack(c));
  const ceiling = cases.filter(isCeiling).length;
  const trig = triggerCounts(A);
  const runs = runCount(A);
  const short = (c) => `\`${c.name.split("-")[0]}\``;
  const ci = (iv) => (iv ? ` ${fmtCi(iv.ci)}` : "");
  const meanLine = (set, what) => {
    const iv = meanDeltaInterval(set);
    const oneRun = set.filter((c) => !caseInterval(c)).length;
    const why = !iv && oneRun ? ` (no interval: ${oneRun} single-run cases)` : "";
    return `**${fmt(mean(set.map(delta)))}**${iv ? ` ${fmtCi(iv)}` : ""} over ${set.length} ${what}${why}`;
  };
  // A one-run case (the guard tier's cheap sweep) has no interval, so it can
  // never be flagged above. Surface its raw negative Δ instead of hiding it.
  const unflagged = withCi.filter((x) => !x.iv && delta(x.c) < 0);

  const model = A.suite?.model ?? cases[0]?.model ?? "model unrecorded";
  const judge = A.suite?.judgeModel ?? "judge unrecorded";
  const when = (A.suite?.startedAt ?? A.startedAt ?? "").slice(0, 10);
  const perCaseRuns = [...new Set(cases.map((c) => c.runsPerCase).filter(Boolean))].join("/");

  console.log(
    `**${model}, ${judge} judge, \`runs: ${perCaseRuns || "?"}\`${when ? ` (${when})` : ""}**`,
  );
  console.log();
  console.log(`- Mean Δ ${meanLine(cases, "cases")}; ${meanLine(nonStack, "non-stack cases")}.`);
  console.log(
    `- Δ interval excludes 0 (95% bootstrap over runs): ` +
      (positive.length
        ? positive.map((x) => `${short(x.c)} ${fmt(delta(x.c))}${ci(x.iv)}`).join(", ")
        : "none") +
      ".",
  );
  console.log(
    `- Plugin regressions (Δ interval below 0): ` +
      (regressions.length
        ? regressions.map((x) => `${short(x.c)} ${fmt(delta(x.c))}${ci(x.iv)}`).join(", ")
        : "none") +
      ".",
  );
  if (unflagged.length) {
    console.log(
      `- Negative Δ with fewer than 2 runs (no interval; re-run to confirm): ` +
        `${unflagged.map((x) => `${short(x.c)} ${fmt(delta(x.c))}`).join(", ")}.`,
    );
  }
  console.log(`- At ceiling in both arms: ${ceiling} of ${cases.length}.`);
  console.log(
    `- Skill fired ${trig.fired}/${trig.total} (${pctOf(trig.fired, trig.total)}); ` +
      `over-trigger ${trig.over}/${trig.overTotal}.`,
  );
  console.log(
    `- Cost $${A.costUsd.toFixed(2)} over ${runs} runs ($${(A.costUsd / Math.max(runs, 1)).toFixed(3)} per run).`,
  );

  // Drift between the declared tiers and what this run measured.
  const demoted = withCi.filter(
    (x) => tierOf(x.c) === "discriminating" && !(x.iv && excludesZero(x.iv.ci)),
  );
  const promoted = withCi.filter(
    (x) => tierOf(x.c) === "guard" && x.iv && excludesZero(x.iv.ci),
  );
  if (demoted.length || promoted.length) {
    console.log();
    if (demoted.length) {
      console.log(
        `Tagged discriminating, interval includes 0 this run: ${demoted.map((x) => short(x.c)).join(", ")}.`,
      );
    }
    if (promoted.length) {
      console.log(
        `Tagged guard, interval excludes 0 this run (consider promoting): ${promoted.map((x) => short(x.c)).join(", ")}.`,
      );
    }
  }

  if (positive.length) {
    console.log();
    console.log("| Case | Δ | 95% interval | with → without |");
    console.log("| --- | --- | --- | --- |");
    for (const x of positive) {
      console.log(
        `| \`${x.c.name}\` | **${fmt(delta(x.c))}** | ${fmtCi(x.iv.ci)} | ${withS(x.c).toFixed(2)} → ${withoutS(x.c).toFixed(2)} |`,
      );
    }
  }
  const noted = A.suite?.plugins?.map(recordedHash).find(Boolean);
  console.log();
  console.log(
    `<!-- plugin source ${noted ?? pluginSourceHash()} (${noted ? "recorded by the run" : "hashed from this checkout, not recorded by the run"}) -->`,
  );
  process.exit(0);
}

// --- --calibrate: measured tokens vs. the bench's 3.5 chars/token -----------

if (mode === "calibrate") {
  refuseBroken([[LA, A]]);
  // Field names differ between runner versions; accept the common spellings.
  const pick = (o, ...keys) => keys.map((k) => o?.[k]).find((v) => typeof v === "number");
  const usageOf = (run) => run.usage ?? run.tokens ?? run.tokenUsage ?? {};
  const inputOf = (run) => {
    const u = usageOf(run);
    const parts = [
      pick(u, "inputTokens", "input_tokens", "input"),
      pick(u, "cacheCreationInputTokens", "cache_creation_input_tokens", "cacheCreation"),
      pick(u, "cacheReadInputTokens", "cache_read_input_tokens", "cacheRead"),
    ];
    return parts.some((p) => p !== undefined) ? parts.reduce((s, p) => s + (p ?? 0), 0) : null;
  };
  const outputOf = (run) => pick(usageOf(run), "outputTokens", "output_tokens", "output") ?? null;
  const turnsOf = (run) => pick(run, "numTurns", "turns") ?? pick(usageOf(run), "turns") ?? 1;

  // The without arm loads no skill, so its context is the system prompt plus the
  // case prompt, which is the text the bench's chars/token estimate covers. Input
  // is averaged per turn, because every turn replays the whole context. Regress
  // it on the prompt's size across cases: the slope is tokens per character, and
  // the intercept absorbs the fixed system prompt and tool list.
  const points = [];
  const outputs = [];
  for (const c of A.cases) {
    const chars = (c.promptMarkdown ?? "").length;
    const runs = (c.arms?.without ?? []).filter((r) => inputOf(r) !== null);
    if (!chars || !runs.length) continue;
    points.push([chars, mean(runs.map((r) => inputOf(r) / Math.max(turnsOf(r), 1)))]);
    outputs.push(...runs.map(outputOf).filter((v) => v !== null));
  }
  const fit = points.length >= 3 ? ols(points) : null;
  console.log(`calibrating ${LA}: ${points.length} cases with a measured without-plugin input`);
  if (!fit || fit.slope <= 0) {
    console.error(
      `✗ cannot calibrate: need at least 3 cases with usage fields (input_tokens and\n` +
        `  prompt text of differing length) and a positive slope. This runner's\n` +
        `  aggregate-result.json may not record per-run usage; check the run objects.`,
    );
    process.exit(1);
  }
  const charsPerToken = 1 / fit.slope;
  const benchRatio = 3.5;
  console.log(`measured chars/token (OLS over prompt size): ${charsPerToken.toFixed(2)}`);
  console.log(`bench assumes ${benchRatio} chars/token → bench ${benchRatio > charsPerToken ? "undercounts" : "overcounts"} tokens by ${Math.abs(100 * (charsPerToken / benchRatio - 1)).toFixed(0)}%`);
  console.log(`fixed context (intercept): ${Math.round(fit.intercept).toLocaleString("en-US")} tokens per turn`);
  if (outputs.length) {
    console.log(`mean output tokens per run: ${Math.round(mean(outputs)).toLocaleString("en-US")}`);
  }
  if (write) {
    // bench.mjs reads this file and prints it in REPORT.md's Model section.
    const target = join(dirname(fileURLToPath(import.meta.url)), "tokens", "data", "calibration.json");
    writeFileSync(
      target,
      `${JSON.stringify(
        {
          source: `${LA}, ${points.length} cases`,
          charsPerToken: Number(charsPerToken.toFixed(2)),
          fixedContextTokens: Math.round(fit.intercept),
        },
        null,
        2,
      )}\n`,
    );
    console.log(`\nwrote ${target}; re-run node evals/tokens/bench.mjs`);
  } else {
    console.log(
      "\nAdd --write to record these figures for evals/tokens/REPORT.md (Model section).",
    );
  }
  process.exit(0);
}

// --- compare two tiers ------------------------------------------------------

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
//
// Split in two. The SCORED part decides the verdict: prompt, run count, turn
// budget and every grader that feeds the score. The DISPLAY-ONLY part is what
// changes no score: the timeout and display-only graders such as `skill-fired`.
// Drift there is reported, not refused, so adding an indicator does not discard
// an otherwise comparable pair of runs.
{
  const graderSpecs = (c, keep) =>
    (c.graders ?? [])
      .filter((g) => keep(isDisplayOnly(g)))
      .map((g) => ({ name: g.name, type: g.type, weight: g.weight, config: g.config }))
      .sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
  const scored = (c) =>
    JSON.stringify({
      prompt: c.promptMarkdown ?? "",
      runs: c.runsPerCase ?? null,
      maxTurns: c.maxTurns ?? null,
      graders: graderSpecs(c, (display) => !display),
    });
  const display = (c) =>
    JSON.stringify({ timeout: c.timeoutSeconds ?? null, graders: graderSpecs(c, (d) => d) });

  const drifted = Object.keys(a).filter((n) => scored(a[n]) !== scored(b[n]));
  if (drifted.length) {
    console.error(
      `✗ ${drifted.length} case(s) differ in prompt, scored graders or run config between\n` +
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
  const displayDrift = Object.keys(a).filter((n) => display(a[n]) !== display(b[n]));
  if (displayDrift.length) {
    console.error(
      `note: ${displayDrift.length} case(s) differ only in display-only config (timeout or\n` +
        `  display-only graders such as skill-fired); scores are still comparable.`,
    );
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

refuseIncomplete([
  [LA, A],
  [LB, B],
]);

// The case fingerprint above covers the suite but says nothing about the plugin,
// which is the treatment. Compare what each run recorded about the plugin under
// test so a version change between tiers cannot be presented as a model-tier
// difference. A recorded source hash is compared when the runner stores one; an
// edit to SKILL.md that does not bump the version is invisible to name@version
// alone (#426 added a whole skill at the same version). When no hash was
// recorded, the hash of this checkout is printed so the operator can note it.
{
  const plugins = (R) =>
    JSON.stringify(
      (R.suite?.plugins ?? []).map((p) => `${p.name}@${p.version}#${recordedHash(p) ?? ""}`).sort(),
    );
  const pa = plugins(A);
  const pb = plugins(B);
  if (pa !== pb) {
    console.error(`✗ the two result sets evaluated different plugin versions or sources; refusing.`);
    console.error(`  ${LA}: ${pa}`);
    console.error(`  ${LB}: ${pb}`);
    process.exit(1);
  }
  const anyHash = [A, B].some((R) => (R.suite?.plugins ?? []).some(recordedHash));
  if (!anyHash) {
    console.error(
      `note: the runs recorded no plugin source hash. This checkout hashes to ${pluginSourceHash()};\n` +
        `  an edit to the skill without a version bump would not be caught. Run the tiers back to back.`,
    );
  }
}

refuseBroken([
  [LA, A],
  [LB, B],
]);

console.log(`${"CASE".padEnd(34)} ${LA.padEnd(34)} ${LB.padEnd(34)}`.replace(/\s+$/, ""));
console.log(
  `${"".padEnd(34)} ${"with  w/out    Δ  [95% interval]".padEnd(34)} ${"with  w/out    Δ  [95% interval]".padEnd(34)}`,
);
console.log("-".repeat(104));

for (const name of Object.keys(a)) {
  const ca = a[name];
  const cb = b[name]; // guaranteed present: mismatched case sets exited above
  const cell = (c) => {
    const iv = caseInterval(c);
    const base = `${withS(c).toFixed(2)}  ${withoutS(c).toFixed(2)}  ${fmt(delta(c))}`;
    const flagged = iv && excludesZero(iv.ci);
    const tail = iv ? ` ${fmtCi(iv.ci)}${flagged ? " *" : ""}` : " (runs<2)";
    return `${base}${tail}`.padEnd(34);
  };
  const flag = isCeiling(ca) && isCeiling(cb) ? " (ceiling both)" : "";
  console.log(`${name.padEnd(34)} ${cell(ca)} ${cell(cb)}${flag}`);
}

console.log("-".repeat(104));
console.log("* interval excludes 0 (95% bootstrap over runs). Unstarred Δ are within noise.");

for (const [L, R] of [
  [LA, A],
  [LB, B],
]) {
  const cases = R.cases;
  const nonCeiling = cases.filter((c) => !isCeiling(c));
  const meanAll = mean(cases.map(delta));
  const meanNC = mean(nonCeiling.map(delta));
  const ivAll = meanDeltaInterval(cases);
  const trig = triggerCounts(R);
  const overPct = trig.overTotal ? Math.round((100 * trig.over) / trig.overTotal) : 0;
  console.log(
    `${L.padEnd(8)} mean Δ ${fmt(meanAll)}${ivAll ? ` ${fmtCi(ivAll)}` : ""} over ${cases.length} cases · ` +
      `mean Δ ${fmt(meanNC)} over ${nonCeiling.length} non-ceiling · ` +
      `skill fired ${trig.fired}/${trig.total} (${pctOf(trig.fired, trig.total)}) · ` +
      `$${R.costUsd.toFixed(2)}`,
  );
  console.log(
    `${"".padEnd(8)} over-trigger ${trig.over}/${trig.overTotal} (${overPct}%) on should-NOT-fire cases` +
      (trig.over ? "  ⚠ the skill is activating on out-of-domain prompts" : ""),
  );
}

console.log(
  "\nPer-case Δ is the primary result. Mean Δ across tiers is not directly\n" +
    "comparable — the tiers hit their ceilings on different cases.",
);
