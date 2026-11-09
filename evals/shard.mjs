#!/usr/bin/env node
// Splits the suite into shards that run as separate `claude plugin eval`
// processes (one terminal tab each), then merges their results back into one
// aggregate-result.json that `analyze.mjs --summary` reads like a single run.
//
//   node evals/shard.mjs split <n> <out-root> [case-prefix ...]
//   node evals/shard.mjs merge <out-dir> <result-dir> ...
//
// `split` copies case directories into <out-root>/shard-1 … shard-<n>, balanced
// by run count. <out-root> must sit below the plugin directory, because
// `--eval-dir` must. See RUNNING.md for the launch command.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const EVALS_DIR = fileURLToPath(new URL(".", import.meta.url));
const USAGE =
  "usage: node evals/shard.mjs split <n> <out-root> [case-prefix ...]\n" +
  "       node evals/shard.mjs merge <out-dir> <result-dir> ...";

/** Case directories in the suite, with their committed run counts. */
export function listCases(dir = EVALS_DIR) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{2}-/.test(e.name))
    .map((e) => {
      const prompt = readFileSync(join(dir, e.name, "prompt.md"), "utf8");
      const runs = Number(/^runs: (\d+)$/m.exec(prompt)?.[1] ?? 1);
      return { name: e.name, runs };
    })
    .sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** Greedy longest-first assignment: each case goes to the lightest shard. */
export function assign(cases, n) {
  const shards = Array.from({ length: n }, () => ({ runs: 0, cases: [] }));
  for (const c of [...cases].sort((a, b) => b.runs - a.runs || (a.name < b.name ? -1 : 1))) {
    const lightest = shards.reduce((m, s) => (s.runs < m.runs ? s : m));
    lightest.cases.push(c.name);
    lightest.runs += c.runs;
  }
  return shards.filter((s) => s.cases.length);
}

export function split(n, outRoot, prefixes = [], dir = EVALS_DIR) {
  const cases = listCases(dir).filter(
    (c) => !prefixes.length || prefixes.some((p) => c.name.startsWith(p)),
  );
  rmSync(outRoot, { recursive: true, force: true });
  const shards = assign(cases, n);
  shards.forEach((s, i) => {
    const target = join(outRoot, `shard-${i + 1}`);
    mkdirSync(target, { recursive: true });
    for (const name of s.cases) cpSync(join(dir, name), join(target, name), { recursive: true });
  });
  return shards;
}

/** Combines per-shard aggregate results; durations overlap, so take the longest. */
export function merge(results) {
  // Each case records its shard directory, which analyze.mjs reads tags from
  // relative to the repo root; point it at the committed case instead.
  const cases = results
    .flatMap((r) => r.cases.map((c) => ({ ...c, dir: `evals/${c.name}` })))
    .sort((a, b) => (a.name < b.name ? -1 : 1));
  const total = (key) => results.reduce((s, r) => s + (r.aggregates?.[key] ?? 0), 0);
  const weighted = (key) => {
    const n = total("casesTotal");
    return n
      ? results.reduce((s, r) => s + (r.aggregates?.[key] ?? 0) * r.aggregates.casesTotal, 0) / n
      : 0;
  };
  return {
    ...results[0],
    startedAt: results.map((r) => r.startedAt).sort()[0],
    durationSeconds: Math.max(...results.map((r) => r.durationSeconds ?? 0)),
    costUsd: results.reduce((s, r) => s + (r.costUsd ?? 0), 0),
    partial: results.some((r) => r.partial),
    cases,
    aggregates: {
      ...results[0].aggregates,
      casesTotal: total("casesTotal"),
      casesPassed: total("casesPassed"),
      overallScore: weighted("overallScore"),
      overallPassRate: weighted("overallPassRate"),
      meanDelta: weighted("meanDelta"),
    },
  };
}

function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === "split" && rest.length >= 2 && Number(rest[0]) > 0) {
    const shards = split(Number(rest[0]), rest[1], rest.slice(2));
    shards.forEach((s, i) =>
      console.log(`shard-${i + 1}: ${s.cases.length} cases, ${s.runs} runs`),
    );
    return 0;
  }
  if (cmd === "merge" && rest.length >= 2) {
    const [out, ...dirs] = rest;
    const missing = dirs.filter((d) => !existsSync(join(d, "aggregate-result.json")));
    if (missing.length) {
      console.error(`✗ no aggregate-result.json in: ${missing.join(", ")}`);
      return 1;
    }
    const merged = merge(
      dirs.map((d) => JSON.parse(readFileSync(join(d, "aggregate-result.json"), "utf8"))),
    );
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "aggregate-result.json"), `${JSON.stringify(merged, null, 2)}\n`);
    console.log(`merged ${dirs.length} shards, ${merged.cases.length} cases → ${out}`);
    return 0;
  }
  console.error(USAGE);
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  process.exitCode = main(process.argv.slice(2));
