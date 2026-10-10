#!/usr/bin/env node
// Token-cost benchmark: pr-shepherd vs. an agent on the gh CLI or the GitHub
// MCP server. Offline and deterministic. It writes evals/tokens/REPORT.md, and
// CI fails when the committed report is stale.
//
//   node evals/tokens/bench.mjs           # rewrite REPORT.md
//   node evals/tokens/bench.mjs --json    # print the raw numbers instead
//
// Method and limits: README.md. Scenarios: scenarios.mjs. Cost model: lib.mjs.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { MODEL, TOKENS_DIR, cost, readJson, tokens } from "./lib.mjs";
import { SCENARIOS } from "./scenarios.mjs";

const ARMS = ["shepherd", "gh", "mcp"];
const METRICS = ["calls", "turns", "toolTokens", "ite"];
const SESSIONS = {
  pr: "Typical PR session",
  stack: "Typical stack session",
};

const schemas = readJson("mcp-tool-schemas.json");
const eagerTokens = tokens("x".repeat(schemas.eagerChars));

// Setup output stays in context for the rest of the session: the skill and
// playbooks for shepherd, the loaded tool schemas for MCP. Each setup scenario
// reports, per later scenario, how much each arm has loaded by then.
const carry = Object.assign({}, ...SCENARIOS.filter((s) => s.setup).map((s) => s.arms().carry));

/** Sum cost results, each scaled by a weight. */
function addCosts(parts) {
  const keys = ["calls", "turns", "toolTokens", "ite", "truncated"];
  return Object.fromEntries(
    keys.map((k) => {
      const sum = parts.reduce((t, [c, w]) => t + w * c[k], 0);
      return [k, k === "ite" || k === "toolTokens" ? Math.round(sum) : Math.round(sum * 10) / 10];
    }),
  );
}

const rows = SCENARIOS.map((s) => {
  const arms = s.arms();
  const carried = (arm) => (s.setup ? 0 : (carry[s.id]?.[arm] ?? 0));
  // A setup row adds its lazy loads, each at the share of sessions that trigger it.
  const armCost = (a) =>
    s.setup
      ? addCosts([
          [cost(arms[a]), 1],
          ...(arms.loads ?? []).filter((l) => l.arm === a).map((l) => [cost(l.calls), l.share]),
        ])
      : cost(arms[a], { extraContext: carried(a) });
  const result = Object.fromEntries(ARMS.map((a) => [a, armCost(a)]));
  // Sensitivity: the whole GitHub toolset in context on every request instead
  // of the few schemas the setup scenario loads on demand.
  result.mcpEager = s.setup ? cost([]) : cost(arms.mcp, { extraContext: eagerTokens });
  // The same step with nothing carried in context: its variable cost. The rest
  // of the row (all of a setup row) is fixed cost: setup, and keeping it in
  // context on every request.
  const bare = Object.fromEntries(ARMS.map((a) => [a, s.setup ? cost([]) : cost(arms[a])]));
  bare.mcpEager = s.setup ? cost([]) : cost(arms.mcp);
  return {
    id: s.id,
    session: s.session,
    setup: s.setup === true,
    title: s.title,
    note: arms.note ?? s.note,
    gaps: s.gaps ?? {},
    weight: s.weight,
    ...result,
    variable: bare,
  };
});

function round(n) {
  return Math.round(n * 10) / 10;
}

/** Weighted sums over one session's scenarios. */
function totals(sessionRows) {
  return Object.fromEntries(
    [...ARMS, "mcpEager"].map((a) => [
      a,
      Object.fromEntries(
        [...METRICS, "truncated"].map((m) => {
          const sum = sessionRows.reduce((t, r) => t + r.weight * r[a][m], 0);
          // Weights can be fractional; whole tokens read better than half ones.
          return [m, m === "ite" || m === "toolTokens" ? Math.round(sum) : round(sum)];
        }),
      ),
    ]),
  );
}

/** Split a session's cost into fixed (setup and its carriage) and variable. */
function split(sessionRows) {
  return Object.fromEntries(
    [...ARMS, "mcpEager"].map((a) => {
      const sum = (pick) => Math.round(sessionRows.reduce((t, r) => t + r.weight * pick(r), 0));
      const totalIte = sum((r) => r[a].ite);
      const variableIte = sum((r) => r.variable[a].ite);
      const totalTokens = sum((r) => r[a].toolTokens);
      const variableTokens = sum((r) => r.variable[a].toolTokens);
      return [
        a,
        {
          fixedTokens: totalTokens - variableTokens,
          fixedIte: totalIte - variableIte,
          variableTokens,
          variableIte,
          totalIte,
        },
      ];
    }),
  );
}

/** Fraction of the baseline that pr-shepherd saves; negative means it costs more. */
const saving = (base, ours) => (base === 0 ? (ours === 0 ? 0 : -Infinity) : 1 - ours / base);

const BASELINE_KEYS = ["gh", "mcp", "mcpEager"];

const sessions = Object.fromEntries(
  Object.keys(SESSIONS).map((key) => {
    const sessionRows = rows.filter((r) => r.session === key);
    const total = totals(sessionRows);
    const summary = Object.fromEntries(
      BASELINE_KEYS.map((b) => [
        b,
        {
          session: Object.fromEntries(
            METRICS.map((m) => [m, saving(total[b][m], total.shepherd[m])]),
          ),
        },
      ]),
    );
    return [key, { total, summary, split: split(sessionRows) }];
  }),
);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ model: MODEL, eagerTokens, rows, sessions }, null, 2));
  process.exit(0);
}

// --- report -----------------------------------------------------------------

const pct = (f) => {
  if (!Number.isFinite(f)) return "n/a";
  const n = Math.round(f * 100);
  return n === 0 ? "0%" : `${n > 0 ? "−" : "+"}${Math.abs(n)}%`;
};
const signed = (n) => (n === 0 ? "0" : `${n > 0 ? "+" : "−"}${num(Math.abs(n))}`);
const num = (n) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });
const BASELINES = { gh: "gh CLI", mcp: "GitHub MCP", mcpEager: "GitHub MCP, eager tools" };

const lines = [];
const out = (s = "") => lines.push(s);

const savingTable = (summary) => {
  out("| vs. baseline | tool calls | turns | tool tokens | cost (ITE) |");
  out("| --- | --- | --- | --- | --- |");
  for (const [b, label] of Object.entries(BASELINES)) {
    const s = summary[b];
    out(`| ${label} | ${pct(s.calls)} | ${pct(s.turns)} | ${pct(s.toolTokens)} | ${pct(s.ite)} |`);
  }
  out();
};

out("# Token-cost report");
out();
out("<!-- Generated by `node evals/tokens/bench.mjs`. Do not edit by hand. -->");
out();
out(
  "Change in cost when an agent uses pr-shepherd instead of a baseline. A negative number means pr-shepherd costs less.",
);
out();

for (const [key, title] of Object.entries(SESSIONS)) {
  const { total, summary, split: parts } = sessions[key];
  out(`## ${title}`);
  out();
  out("Weighted sum of the session's scenarios below, one-time setup included.");
  out();
  savingTable(Object.fromEntries(BASELINE_KEYS.map((b) => [b, summary[b].session])));
  out("| arm | tool calls | turns | tool tokens | cost (ITE) | truncated calls |");
  out("| --- | --- | --- | --- | --- | --- |");
  for (const [a, label] of Object.entries({ shepherd: "pr-shepherd", ...BASELINES })) {
    const s = total[a];
    out(
      `| ${label} | ${num(s.calls)} | ${num(s.turns)} | ${num(s.toolTokens)} | ${num(s.ite)} | ${num(s.truncated)} |`,
    );
  }
  out();
  out("### Fixed vs. variable");
  out();
  out(
    "Fixed is setup (skill and playbooks, or MCP tool schemas) plus carrying it in context on every later request. Variable is the steps themselves, with nothing carried.",
  );
  out();
  out("| arm | fixed tokens | fixed ITE | variable tokens | variable ITE | total ITE |");
  out("| --- | --- | --- | --- | --- | --- |");
  for (const [a, label] of Object.entries({ shepherd: "pr-shepherd", ...BASELINES })) {
    const p = parts[a];
    out(
      `| ${label} | ${num(p.fixedTokens)} | ${num(p.fixedIte)} | ${num(p.variableTokens)} | ${num(p.variableIte)} | ${num(p.totalIte)} |`,
    );
  }
  out();
  out("| vs. baseline | fixed ITE | variable tokens | variable ITE | total ITE |");
  out("| --- | --- | --- | --- | --- |");
  for (const [b, label] of Object.entries(BASELINES)) {
    const ours = parts.shepherd;
    const base = parts[b];
    out(
      `| ${label} | ${signed(ours.fixedIte - base.fixedIte)} | ${pct(saving(base.variableTokens, ours.variableTokens))} | ${pct(saving(base.variableIte, ours.variableIte))} | ${pct(saving(base.totalIte, ours.totalIte))} |`,
    );
  }
  out();
}

out("## Scenarios");
out();
out("Each cell is `turns · tool tokens · cost (ITE)`. Saving columns compare cost.");
out();
const cell = (c, gap) =>
  `${c.turns} · ${num(c.toolTokens)} · ${num(c.ite)}${c.truncated ? " ✂" : ""}${gap ? " †" : ""}`;
for (const [key, title] of Object.entries(SESSIONS)) {
  out(`### ${title}`);
  out();
  out("| scenario | weight | pr-shepherd | gh CLI | GitHub MCP | vs. gh | vs. MCP |");
  out("| --- | --- | --- | --- | --- | --- | --- |");
  for (const r of rows.filter((r) => r.session === key)) {
    out(
      `| \`${r.id}\` | ${r.weight} | ${cell(r.shepherd)} | ${cell(r.gh, r.gaps.gh)} | ${cell(r.mcp, r.gaps.mcp)} | ${pct(saving(r.gh.ite, r.shepherd.ite))} | ${pct(saving(r.mcp.ite, r.shepherd.ite))} |`,
    );
  }
  out();
}
out("- ✂ marks a baseline call whose output the host truncated.");
out(
  "- † marks a baseline that cannot finish the step with its tools. Its cost covers only what it can do.",
);
out("- gh has no setup cost, so its setup saving is n/a.");
out();
for (const r of rows) {
  const gaps = Object.entries(r.gaps).map(([arm, gap]) => ` †${BASELINES[arm]}: ${gap}.`);
  out(`- \`${r.id}\` — ${r.title}. ${r.note}${gaps.join("")}`);
}
out();
out("## Model");
out();
out(`- Tokens: ${MODEL.charsPerToken} characters per token for every arm.`);
out(`- Base context replayed each turn: ${num(MODEL.baseContextTokens)} tokens.`);
out(
  `- Price ratios to one uncached input token: cache read ${MODEL.cacheReadMultiplier}, cache write ${MODEL.cacheWriteMultiplier}, output ${MODEL.outputMultiplier}.`,
);
out(
  `- Host output caps: Bash ${num(MODEL.bashOutputCapChars)} characters, MCP ${num(MODEL.mcpOutputCapTokens)} tokens.`,
);
out(
  `- Eager GitHub MCP toolset: ${schemas.eagerToolCount} tools, ${num(eagerTokens)} tokens per request (${schemas.source}).`,
);
out();

writeFileSync(join(TOKENS_DIR, "REPORT.md"), `${lines.join("\n")}\n`);
console.log(`wrote ${join(TOKENS_DIR, "REPORT.md")}`);
