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
import { existsSync, readFileSync } from "node:fs";
import { MCP_API, MODEL, TOKENS_DIR, apiTotals, cost, readJson, tokens } from "./lib.mjs";
import { SCENARIOS } from "./scenarios.mjs";

const ARMS = ["shepherd", "gh", "mcp"];
const METRICS = ["calls", "turns", "toolTokens", "ite"];
const SESSIONS = {
  pr: "Typical PR session",
  stack: "Typical stack session",
};

const schemas = readJson("mcp-tool-schemas.json");
const eagerTokens = tokens("x".repeat(schemas.eagerChars));
if (MCP_API.source !== schemas.source)
  throw new Error(
    `data/mcp-api-map.json is pinned to ${MCP_API.source}, the schemas to ${schemas.source}; re-run record.mjs`,
  );

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

// --- baseline strategies -------------------------------------------------------
//
// "parallel" fires every read in the first turn (generous on turns, wasteful on
// tokens when the PR is already terminal). "stateFirst" spends a first turn on
// the PR's state alone and reads the rest in the next, or stops when the PR is
// terminal. Each baseline takes the cheaper strategy for every step, so a
// frugal agent is not undercut by a strawman.

const STRATEGIES = ["parallel", "stateFirst"];

function stateFirstGh(calls, s) {
  const view = calls.find((c) => /^gh pr view /.test(c.cmd));
  if (!view) return calls;
  const { state, isDraft } = JSON.parse(view.out);
  const tiny = {
    phase: 1,
    via: "bash",
    cmd: view.cmd.replace(/--json \S+/, "--json state,isDraft"),
    out: JSON.stringify({ isDraft, state }),
  };
  if (s.terminal) return [tiny];
  return [tiny, ...calls.map((c) => ({ ...c, phase: c.phase + 1 }))];
}

function stateFirstMcp(calls, s) {
  const get = calls.find((c) => c.cmd.startsWith("pull_request_read") && /"get"/.test(c.cmd));
  if (!get) return calls;
  if (s.terminal) return [get];
  return [get, ...calls.filter((c) => c !== get).map((c) => ({ ...c, phase: c.phase + 1 }))];
}

function applyStrategy(arms, s, strategy) {
  if (strategy === "parallel" || s.setup || s.session !== "pr") return arms;
  return { ...arms, gh: stateFirstGh(arms.gh, s), mcp: stateFirstMcp(arms.mcp, s) };
}

function buildRows(strategy) {
  return SCENARIOS.map((s) => buildRow(s, strategy));
}

function buildRow(s, strategy) {
  const arms = applyStrategy(s.arms(), s, strategy);
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
  // Rate-limit cost (deterministic, assumed). Setup loads touch no API.
  const api = {
    shepherd: apiTotals(arms.shepherd),
    shepherdRest: apiTotals(arms.shepherd, { transport: "rest" }),
    gh: apiTotals(arms.gh),
    mcp: apiTotals(arms.mcp),
  };
  return {
    id: s.id,
    session: s.session,
    setup: s.setup === true,
    title: s.title,
    note: arms.note ?? s.note,
    gaps: s.gaps ?? {},
    weight: s.weight,
    strategy,
    ...result,
    variable: bare,
    api,
  };
}

const rowsByStrategy = Object.fromEntries(STRATEGIES.map((st) => [st, buildRows(st)]));

/** Per step, each baseline arm takes whichever strategy costs it less. */
const rows = rowsByStrategy.parallel.map((base, i) => {
  const alt = rowsByStrategy.stateFirst[i];
  const pick = (arm) => (alt[arm].ite < base[arm].ite ? alt : base);
  const gh = pick("gh");
  const mcp = pick("mcp");
  const eager = alt.mcpEager.ite < base.mcpEager.ite ? alt : base;
  return {
    ...base,
    gh: gh.gh,
    mcp: mcp.mcp,
    mcpEager: eager.mcpEager,
    variable: {
      ...base.variable,
      gh: gh.variable.gh,
      mcp: mcp.variable.mcp,
      mcpEager: eager.variable.mcpEager,
    },
    api: { ...base.api, gh: gh.api.gh, mcp: mcp.api.mcp },
    stateFirst: { gh: gh.strategy === "stateFirst", mcp: mcp.strategy === "stateFirst" },
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

// --- rate-limit totals -----------------------------------------------------------

const API_ARMS = ["shepherd", "shepherdRest", "gh", "mcp"];

/** Weighted GraphQL points and REST core requests per session, per arm. */
const apiSessions = Object.fromEntries(
  Object.keys(SESSIONS).map((key) => [
    key,
    Object.fromEntries(
      API_ARMS.map((a) => {
        const rs = rows.filter((r) => r.session === key);
        const sum = (f) => round(rs.reduce((t, r) => t + r.weight * r.api[a][f], 0));
        return [a, { graphqlPoints: sum("graphqlPoints"), restCore: sum("restCore") }];
      }),
    ),
  ]),
);

// Waiting on CI: pr-shepherd polls every 60s (poll.intervalSeconds). A
// fingerprint hit is 1 GraphQL point; REST has no shortcut (~12 requests).
const POLL_SECONDS = 60;
const waitPerHour = {
  shepherdGraphql: 3600 / POLL_SECONDS,
  shepherdRest: (3600 / POLL_SECONDS) * 12,
  ghWatchGraphql: 3600 / POLL_SECONDS,
  mcpRest: (3600 / POLL_SECONDS) * 2,
};

/** Sensitivity: each baseline's session cost under each pure strategy. */
const strategyTotals = Object.fromEntries(
  Object.keys(SESSIONS).map((key) => [
    key,
    Object.fromEntries(
      STRATEGIES.map((st) => {
        const rs = rowsByStrategy[st].filter((r) => r.session === key);
        return [
          st,
          Object.fromEntries(
            ["shepherd", "gh", "mcp"].map((a) => [
              a,
              Math.round(rs.reduce((t, r) => t + r.weight * r[a].ite, 0)),
            ]),
          ),
        ];
      }),
    ),
  ]),
);

const calibrationPath = join(TOKENS_DIR, "data", "calibration.json");
const calibration = existsSync(calibrationPath)
  ? JSON.parse(readFileSync(calibrationPath, "utf8"))
  : null;

if (process.argv.includes("--json")) {
  console.log(
    JSON.stringify(
      { model: MODEL, eagerTokens, rows, sessions, apiSessions, waitPerHour, strategyTotals },
      null,
      2,
    ),
  );
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

// --- summary ------------------------------------------------------------------

const sess = (key, b, m = "ite") => pct(sessions[key].summary[b].session[m]);
const share = (key) => {
  const p = sessions[key].split.shepherd;
  return `${Math.round((100 * p.fixedIte) / p.totalIte)}%`;
};
const scenarioSaving = rows
  .filter((r) => !r.setup && r.gh.ite > 0)
  .map((r) => ({ id: r.id, s: saving(r.gh.ite, r.shepherd.ite) }))
  .filter((r) => Number.isFinite(r.s))
  .sort((a, b) => b.s - a.s);
const win = scenarioSaving[0];
const loss = scenarioSaving[scenarioSaving.length - 1];
const apiPct = (key, b, f) => {
  const a = apiSessions[key];
  return pct(saving(a[b][f], a.shepherd[f]));
};

const headline = [
  "| session | cost vs. gh | cost vs. MCP | turns vs. gh / MCP | tool tokens vs. gh / MCP |",
  "| --- | --- | --- | --- | --- |",
  ...Object.entries({ pr: "single PR", stack: "PR stack" }).map(
    ([k, label]) =>
      `| ${label} | **${sess(k, "gh")}** | **${sess(k, "mcp")}** | ${sess(k, "gh", "turns")} / ${sess(k, "mcp", "turns")} | ${sess(k, "gh", "toolTokens")} / ${sess(k, "mcp", "toolTokens")} |`,
  ),
  "",
  "GitHub rate limit per session (deterministic, assumed; see the Method section):",
  "",
  "| session | GraphQL points: pr-shepherd / gh / MCP | REST core: pr-shepherd / gh / MCP | pr-shepherd on the REST transport |",
  "| --- | --- | --- | --- |",
  ...Object.entries({ pr: "single PR", stack: "PR stack" }).map(([k, label]) => {
    const a = apiSessions[k];
    return `| ${label} | ${num(a.shepherd.graphqlPoints)} / ${num(a.gh.graphqlPoints)} / ${num(a.mcp.graphqlPoints)} | ${num(a.shepherd.restCore)} / ${num(a.gh.restCore)} / ${num(a.mcp.restCore)} | ${num(a.shepherdRest.restCore)} core + ${num(a.shepherdRest.graphqlPoints)} points |`;
  }),
];

out("## Summary");
out();
out(
  `- **Cost (ITE).** PR session ${sess("pr", "gh")} vs. gh and ${sess("pr", "mcp")} vs. GitHub MCP; stack session ${sess("stack", "gh")} and ${sess("stack", "mcp")}.`,
);
out(
  `- **Fixed vs. variable.** The skill and playbooks are ${share("pr")} of pr-shepherd's PR-session cost and ${share("stack")} of its stack-session cost; on variable cost alone it is ${pct(saving(sessions.pr.split.gh.variableIte, sessions.pr.split.shepherd.variableIte))} vs. gh in a PR session and ${pct(saving(sessions.stack.split.gh.variableIte, sessions.stack.split.shepherd.variableIte))} in a stack session.`,
);
out(
  `- **Biggest win and loss vs. gh.** \`${win.id}\` ${pct(win.s)}; \`${loss.id}\` ${pct(loss.s)}.`,
);
out(
  `- **GitHub rate limit (assumed).** In a PR session pr-shepherd spends ${num(apiSessions.pr.shepherd.graphqlPoints)} GraphQL points and ${num(apiSessions.pr.shepherd.restCore)} REST requests; gh ${num(apiSessions.pr.gh.graphqlPoints)} and ${num(apiSessions.pr.gh.restCore)}; MCP ${num(apiSessions.pr.mcp.graphqlPoints)} and ${num(apiSessions.pr.mcp.restCore)}. GraphQL points ${apiPct("pr", "gh", "graphqlPoints")} vs. gh and ${apiPct("pr", "mcp", "graphqlPoints")} vs. MCP; REST requests ${apiPct("pr", "gh", "restCore")} and ${apiPct("pr", "mcp", "restCore")}.`,
);
out(
  `- **Waiting on CI, per hour.** pr-shepherd spends ${waitPerHour.shepherdGraphql} GraphQL points on the GraphQL transport (one fingerprint hit per ${POLL_SECONDS}s poll) and about ${waitPerHour.shepherdRest} REST requests on the REST transport, which has no fingerprint shortcut. A \`gh pr checks --watch\` refresh costs ${waitPerHour.ghWatchGraphql} points; an MCP re-check about ${waitPerHour.mcpRest} requests.`,
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
out("- ✂ marks a baseline call whose output the host truncated (Bash) or rejected (MCP).");
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
out("## GitHub API usage");
out();
out(
  "Rate-limit cost per session, weighted like the token numbers. **Deterministic and assumed**: no GitHub call is made. GraphQL is counted in points, REST in core requests, and the two buckets are separate. pr-shepherd costs come from docs/graphql-usage.md and the REST HTTP-boundary tests; gh and MCP costs are the per-call assumptions in README.md. The MCP mapping is unverified.",
);
out();
out("| session | arm | GraphQL points | REST core requests |");
out("| --- | --- | --- | --- |");
const API_LABELS = {
  shepherd: "pr-shepherd",
  shepherdRest: "pr-shepherd, REST transport",
  gh: "gh CLI",
  mcp: "GitHub MCP",
};
for (const [key, title] of Object.entries(SESSIONS)) {
  for (const a of API_ARMS) {
    const v = apiSessions[key][a];
    out(`| ${title} | ${API_LABELS[a]} | ${num(v.graphqlPoints)} | ${num(v.restCore)} |`);
  }
}
out();
out("Per scenario, `GraphQL points / REST core requests` for one occurrence.");
out();
out("| scenario | pr-shepherd | pr-shepherd, REST | gh CLI | GitHub MCP |");
out("| --- | --- | --- | --- | --- |");
for (const r of rows.filter((r) => !r.setup)) {
  const c = (a) => `${num(r.api[a].graphqlPoints)} / ${num(r.api[a].restCore)}`;
  out(
    `| \`${r.id}\` | ${c("shepherd")} | ${c("shepherdRest")} | ${c("gh")}${r.gaps.gh ? " †" : ""} | ${c("mcp")}${r.gaps.mcp ? " †" : ""} |`,
  );
}
out();
out(
  `- Waiting on CI costs ${waitPerHour.shepherdGraphql} GraphQL points an hour for pr-shepherd (one fingerprint hit per ${POLL_SECONDS}s poll), about ${waitPerHour.shepherdRest} REST requests an hour on the REST transport, ${waitPerHour.ghWatchGraphql} points for \`gh pr checks --watch --interval ${POLL_SECONDS}\`, and about ${waitPerHour.mcpRest} REST requests for a one-minute MCP re-check.`,
);
out(
  `- MCP tool costs are read from data/mcp-api-map.json (${MCP_API.source}, verified: ${MCP_API.verified}).`,
);
out(
  "- The REST-transport column resolves nothing by REST: a thread resolve has no REST route, so `apply review` there spends only its replies.",
);
out();
out("## Baseline strategy sensitivity");
out();
out(
  "A baseline either fires every read in its first turn (parallel) or reads the PR's state first and the rest in the next turn, stopping when the PR is terminal (state first). Each baseline takes the cheaper strategy for every step; the table shows each pure strategy's session cost (ITE) and what the report used. Stack steps always read in parallel.",
);
out();
out("| session | strategy | pr-shepherd | gh CLI | GitHub MCP |");
out("| --- | --- | --- | --- | --- |");
for (const [key, title] of Object.entries(SESSIONS)) {
  for (const st of STRATEGIES) {
    const t = strategyTotals[key][st];
    out(`| ${title} | ${st} | ${num(t.shepherd)} | ${num(t.gh)} | ${num(t.mcp)} |`);
  }
  const t = sessions[key].total;
  out(`| ${title} | used | ${num(t.shepherd.ite)} | ${num(t.gh.ite)} | ${num(t.mcp.ite)} |`);
}
out();
const pickedSF = rows.filter((r) => r.stateFirst.gh || r.stateFirst.mcp);
out(
  `- State first was cheaper for ${pickedSF.map((r) => `\`${r.id}\` (${[r.stateFirst.gh && "gh", r.stateFirst.mcp && "MCP"].filter(Boolean).join(", ")})`).join(", ") || "no step"}.`,
);
out();
out("## Model");
out();
out(`- Tokens: ${MODEL.charsPerToken} characters per token for every arm.`);
out(
  calibration
    ? `- Calibration (\`analyze.mjs --calibrate\`, ${calibration.source}): measured ${calibration.charsPerToken} characters per token against the assumed ${MODEL.charsPerToken}.`
    : "- Calibration: none recorded. Run `node evals/analyze.mjs --calibrate <results dir> --write` after a live eval run to compare measured tokens with the assumed ratio.",
);
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

// The README headline is rewritten from the same numbers, so it cannot drift.
const README = join(TOKENS_DIR, "README.md");
const START = "<!-- bench:headline:start -->";
const END = "<!-- bench:headline:end -->";
const readme = readFileSync(README, "utf8");
const [from, to] = [readme.indexOf(START), readme.indexOf(END)];
if (from < 0 || to < from) throw new Error(`README.md needs ${START} and ${END} markers`);
writeFileSync(
  README,
  `${readme.slice(0, from + START.length)}\n\n${headline.join("\n")}\n\n${readme.slice(to)}`,
);
