#!/usr/bin/env node
// Token-cost benchmark: pr-shepherd vs. an agent on the gh CLI or the GitHub
// MCP server. Offline and deterministic. It writes evals/tokens/REPORT.md, and
// CI fails when the committed report is stale.
//
//   node evals/tokens/bench.mjs           # rewrite REPORT.md
//   node evals/tokens/bench.mjs --json    # print the raw numbers instead
//   node evals/tokens/bench.mjs --check   # fail on a loss not in pending-losses.json
//
// Method and limits: README.md. Scenarios: scenarios.mjs. Cost model: lib.mjs.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import {
  BACKGROUND_ACK,
  BASE_BEHIND_GRAPHQL,
  DETECTOR_POLL_SECONDS,
  EVENT_DETECTORS,
  MCP_API,
  RECONCILE_MINUTES,
  snapshot,
  MODEL,
  SHEPHERD_TICK_API,
  SHEPHERD_TICK_API_REST,
  SHEPHERD_TICK_API_CLOUD,
  TOKENS_DIR,
  annotationBatchApi,
  apiTotals,
  cost,
  mcpVerificationNote,
  readJson,
  inputTokens,
  tokens,
} from "./lib.mjs";
import { SCENARIOS, eventArm } from "./scenarios.mjs";
import { checkPending, findLosses, lossKey, pendingEntry, readPending } from "./gate.mjs";
import { atCharsPerToken, measuredCharsPerToken, realSessionsSection } from "./sessions.mjs";

const ARMS = ["shepherd", "gh", "mcp"];
const METRICS = ["calls", "turns", "toolTokens", "ite"];
const SESSIONS = {
  pr: "Typical PR session",
  stack: "Typical stack session",
};

const schemas = readJson("mcp-tool-schemas.json");
const API_CHECK = readJson("api-usage-check.json");
const eagerTokens = inputTokens("x".repeat(schemas.eagerChars));
if (MCP_API.source !== schemas.source)
  throw new Error(
    `data/mcp-api-map.json is pinned to ${MCP_API.source}, the schemas to ${schemas.source}; re-run record.mjs`,
  );

// Setup output stays in context for the rest of the session: the skill and
// playbooks for shepherd, the loaded tool schemas for MCP. Each setup scenario
// reports, per later scenario, how much each arm has loaded by then.
const setupCarry = () =>
  Object.assign({}, ...SCENARIOS.filter((s) => s.setup).map((s) => s.arms().carry));
const BASE_CTX = { carry: setupCarry(), eagerTokens };

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

function buildRows(strategy, ctx = BASE_CTX) {
  return SCENARIOS.map((s) => buildRow(s, strategy, ctx));
}

function buildRow(s, strategy, { carry, eagerTokens } = BASE_CTX) {
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
  // Event arm (informational, not gated): the same skill and setup, with the
  // waiting done by a background `wait` (scenarios.mjs `eventArm`).
  const event = s.setup ? [] : eventArm(arms);
  result.event = s.setup ? result.shepherd : cost(event, { extraContext: carried("shepherd") });
  bare.event = s.setup ? cost([]) : cost(event);
  // Rate-limit cost (deterministic, assumed). Setup loads touch no API.
  const api = {
    shepherd: apiTotals(arms.shepherd),
    shepherdRest: apiTotals(arms.shepherd, { transport: "rest" }),
    shepherdCloud: apiTotals(arms.shepherd, { transport: "cloud" }),
    gh: apiTotals(arms.gh),
    mcp: apiTotals(arms.mcp),
    event: apiTotals(event),
    eventProxy: apiTotals(event, { transport: "proxy" }),
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
    eventWake: s.setup ? null : arms.event.wake,
    ...result,
    variable: bare,
    api,
  };
}

const rowsByStrategy = Object.fromEntries(STRATEGIES.map((st) => [st, buildRows(st)]));

/** Per step, each baseline arm takes whichever strategy costs it less. */
const pickRows = (byStrategy) =>
  byStrategy.parallel.map((base, i) => {
    const alt = byStrategy.stateFirst[i];
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
const rows = pickRows(rowsByStrategy);

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

const sessionsOf = (rows) =>
  Object.fromEntries(
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
const sessions = sessionsOf(rows);

// --- rate-limit totals -----------------------------------------------------------

const API_ARMS = ["shepherd", "shepherdRest", "shepherdCloud", "gh", "mcp"];

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
// fingerprint hit is 1 GraphQL point; REST has no shortcut (a full read).
const POLL_SECONDS = 60;
const waitPerHour = {
  shepherdGraphql: (3600 / POLL_SECONDS) * SHEPHERD_TICK_API.graphqlPoints,
  shepherdRest: (3600 / POLL_SECONDS) * SHEPHERD_TICK_API_REST.restCore,
  shepherdCloud: (3600 / POLL_SECONDS) * SHEPHERD_TICK_API_CLOUD.restCore,
  ghWatchGraphql: 3600 / POLL_SECONDS,
  mcpRest: (3600 / POLL_SECONDS) * 2,
};

// --- event arm (informational, not gated) -------------------------------------
//
// Kept out of `sessions`, `apiSessions` and `findLosses`, so the gate and the
// pending list see exactly the arms they saw before.

const EVENT_ARMS = ["event", "shepherd", "gh", "mcp"];
const EVENT_API_ARMS = ["event", "eventProxy", "shepherd", "gh", "mcp"];
const eventSessions = Object.fromEntries(
  Object.keys(SESSIONS).map((key) => {
    const rs = rows.filter((r) => r.session === key);
    const sum = (pick) => rs.reduce((t, r) => t + r.weight * pick(r), 0);
    const tokens = Object.fromEntries(
      EVENT_ARMS.map((a) => [
        a,
        Object.fromEntries(
          METRICS.map((m) => {
            const v = sum((r) => r[a][m]);
            return [m, m === "ite" || m === "toolTokens" ? Math.round(v) : round(v)];
          }),
        ),
      ]),
    );
    const api = Object.fromEntries(
      EVENT_API_ARMS.map((a) => [
        a,
        {
          graphqlPoints: round(sum((r) => r.api[a].graphqlPoints)),
          restCore: round(sum((r) => r.api[a].restCore)),
        },
      ]),
    );
    const wakes = round(sum((r) => (r.eventWake && r.eventWake !== "none" ? 1 : 0)));
    return [key, { tokens, api, wakes }];
  }),
);

// An idle hour: nothing changes. The poll arm's blocking call costs no turn;
// a `--timeout 4.5m` poll (the legacy bounded CLI mode; the skill uses `--until-terminal`) returns a
// WAIT tick and is called again. It declines a sleep that does not fit in its
// timeout (poll.mts), so each call runs ticks at 0, 60, ... 240s and returns
// after the last. The event arm's detectors all answer 304, and the reconcile
// timer wakes the agent with a WAIT tick.
const BOUNDED_TIMEOUT_SECONDS = 270;
const BOUNDED_INTERVAL_SECONDS = 60;
const boundedTicks = Math.floor(BOUNDED_TIMEOUT_SECONDS / BOUNDED_INTERVAL_SECONDS) + 1;
const BOUNDED_POLL_SECONDS = (boundedTicks - 1) * BOUNDED_INTERVAL_SECONDS;
const PR_URL = "https://github.com/owner/repo/pull/42";
const PR_CMD = `pr-shepherd ${PR_URL}`;
const idleCarry = carry["ci-wait"]?.shepherd ?? 0;
const waitText = snapshot("09-wait-in-progress-ci");
// poll-progress.mts, default (non-quiet) status: one line per sleeping tick.
const waitReason = waitText.match(/^WAIT: (.+)$/m)[1];
const boundedProgress = Array.from(
  { length: boundedTicks - 1 },
  (_, i) =>
    `[poll tick ${i + 1} / +${i * BOUNDED_INTERVAL_SECONDS}s] WAIT — ${waitReason}; next tick in ${BOUNDED_INTERVAL_SECONDS}s\n`,
).join("");
const boundedWake = cost(
  [{ phase: 1, via: "bash", cmd: `${PR_CMD} --timeout 4.5m`, out: boundedProgress + waitText }],
  { extraContext: idleCarry },
);
const reconcileWake = cost(
  [
    { phase: 1, via: "bash", cmd: `pr-shepherd wait ${PR_URL}`, out: BACKGROUND_ACK },
    { phase: 2, via: "bash", notification: true, cmd: "", out: waitText },
  ],
  { extraContext: idleCarry },
);
const perHour = (n, wake) => ({ wakes: round(n), turns: round(n * wake.turns), ite: Math.round(n * wake.ite) });
const reconcilesPerHour = 60 / RECONCILE_MINUTES;
const idleHour = {
  shepherd: { graphqlPoints: waitPerHour.shepherdGraphql, restCore: 0, conditional: 0, ...perHour(0, boundedWake) },
  shepherdBounded: {
    graphqlPoints: round(
      (3600 / BOUNDED_POLL_SECONDS) * boundedTicks * SHEPHERD_TICK_API.graphqlPoints,
    ),
    restCore: 0,
    conditional: 0,
    ...perHour(3600 / BOUNDED_POLL_SECONDS, boundedWake),
  },
  event: {
    graphqlPoints: reconcilesPerHour * SHEPHERD_TICK_API.graphqlPoints,
    restCore: 0,
    conditional: (3600 / DETECTOR_POLL_SECONDS) * EVENT_DETECTORS.length,
    ...perHour(reconcilesPerHour, reconcileWake),
  },
  eventProxy: { graphqlPoints: 0, restCore: 0, conditional: 0, ...perHour(reconcilesPerHour, reconcileWake) },
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

// --- sensitivity: measured characters per token ----------------------------------
//
// The model reads every arm at MODEL.charsPerToken. The real sessions measured
// pr-shepherd's output denser than tool output overall (sessions.mjs), so this
// re-scores every step with pr-shepherd at its measured ratio and both baselines
// at the overall one. No session used GitHub MCP, so MCP's ratio is assumed.

const MEASURED_CPT = measuredCharsPerToken();
const cptMeasured = MEASURED_CPT.shepherd != null && MEASURED_CPT.baseline != null;

/** Every row, re-costed with tokens counted at `cpt` characters each. */
const rowsAtCpt = (cpt) =>
  atCharsPerToken(cpt, () => {
    const ctx = { carry: setupCarry(), eagerTokens: inputTokens("x".repeat(schemas.eagerChars)) };
    return pickRows(Object.fromEntries(STRATEGIES.map((st) => [st, buildRows(st, ctx)])));
  });
// With either ratio unmeasured, both arms keep the model's: no partial re-score.
const cptShepherdRows = rowsAtCpt(cptMeasured ? MEASURED_CPT.shepherd : null);
const cptRows = rowsAtCpt(cptMeasured ? MEASURED_CPT.baseline : null).map((r, i) => ({
  ...r,
  shepherd: cptShepherdRows[i].shepherd,
  variable: { ...r.variable, shepherd: cptShepherdRows[i].variable.shepherd },
}));
/**
 * Per baseline, the steps where pr-shepherd or that baseline gains a truncated
 * or rejected call at the measured ratios. That arm no longer finishes the
 * step, so its lower cost is not a saving: the comparison with that baseline
 * leaves these steps out on both sides. Other baselines keep them.
 */
const cptIncomplete = Object.fromEntries(
  BASELINE_KEYS.map((b) => [
    b,
    new Set(
      cptRows.flatMap((r, i) =>
        ["shepherd", b].some((a) => r[a].truncated > rows[i][a].truncated) ? [i] : [],
      ),
    ),
  ]),
);
/** The step sets each baseline is compared on, at the model's ratio and the measured ones. */
const cptCompare = Object.fromEntries(
  BASELINE_KEYS.map((b) => {
    const completeOnly = (rs) => rs.filter((_, i) => !cptIncomplete[b].has(i));
    const baseRows = completeOnly(rows);
    const measuredRows = completeOnly(cptRows);
    return [
      b,
      {
        baseRows,
        baseSessions: sessionsOf(baseRows),
        measuredRows,
        measuredSessions: sessionsOf(measuredRows),
      },
    ];
  }),
);

/** Whether a per-result token charge could only add to the baselines' side. */
const baselinesNeverFewerCalls = rows.every((r) =>
  BASELINE_KEYS.every((b) => r[b].calls >= r.shepherd.calls),
);

const baseLosses = findLosses({ rows, sessions, apiSessions });
const baseLossKeys = new Set(baseLosses.map(lossKey));
/** Token losses that appear only at the measured ratios: gated like any other. */
const cptFlips = BASELINE_KEYS.flatMap((b) => {
  const c = cptCompare[b];
  const ofBaseline = (ls) =>
    ls.filter((l) => l.baseline === b && (l.metric === "ite" || l.metric === "toolTokens"));
  const before = new Set(
    ofBaseline(findLosses({ rows: c.baseRows, sessions: c.baseSessions, apiSessions })).map(
      lossKey,
    ),
  );
  return ofBaseline(
    findLosses({ rows: c.measuredRows, sessions: c.measuredSessions, apiSessions }),
  ).filter((l) => !baseLossKeys.has(lossKey(l)) && !before.has(lossKey(l)));
}).map((l) => ({ ...l, where: `chars-per-token:${l.where}` }));
const losses = [...baseLosses, ...cptFlips];
const pending = readPending();

if (process.argv.includes("--check")) {
  const { unlisted, stale, wrongIssue, duplicate } = checkPending(losses, pending);
  const fail = unlisted.length + stale.length + wrongIssue.length + duplicate.length > 0;
  console.log(
    `bench gate: ${losses.length} losses vs. a baseline, ${pending.length} pending entries`,
  );
  if (unlisted.length) {
    console.error(
      `\n✗ ${unlisted.length} loss(es) not on the pending list. Fix them, or add these to evals/tokens/pending-losses.json:`,
    );
    for (const l of unlisted) console.error(`  ${lossKey(l)}: ${l.ours} vs ${l.theirs}`);
    console.error("");
    for (const l of unlisted) console.error(`    ${JSON.stringify(pendingEntry(l))},`);
  }
  if (stale.length) {
    console.error(
      `\n✗ ${stale.length} pending entr(y/ies) no longer a loss. Remove them from evals/tokens/pending-losses.json:`,
    );
    for (const p of stale) console.error(`  ${lossKey(p)}`);
  }
  if (wrongIssue.length) {
    console.error(`\n✗ ${wrongIssue.length} pending entr(y/ies) link the wrong issue:`);
    for (const p of wrongIssue) console.error(`  ${lossKey(p)}: #${p.issue}`);
  }
  if (duplicate.length) {
    console.error(`\n✗ ${duplicate.length} duplicate pending entr(y/ies):`);
    for (const p of duplicate) console.error(`  ${lossKey(p)}`);
  }
  if (!fail) console.log("✓ every loss is pending; no pending entry is stale");
  process.exit(fail ? 1 : 0);
}

if (process.argv.includes("--json")) {
  console.log(
    JSON.stringify(
      {
        model: MODEL,
        eagerTokens,
        rows,
        sessions,
        apiSessions,
        waitPerHour,
        strategyTotals,
        eventSessions,
        idleHour,
        charsPerTokenSensitivity: {
          measured: MEASURED_CPT,
          // Per baseline: the steps left out of its comparison, and each
          // session's totals over the rest at the measured ratios.
          incomplete: Object.fromEntries(
            BASELINE_KEYS.map((b) => [
              b,
              rows.filter((_, i) => cptIncomplete[b].has(i)).map((r) => r.id),
            ]),
          ),
          sessions: Object.fromEntries(
            BASELINE_KEYS.map((b) => [
              b,
              Object.fromEntries(
                Object.entries(cptCompare[b].measuredSessions).map(([k, v]) => [
                  k,
                  { total: { shepherd: v.total.shepherd, [b]: v.total[b] } },
                ]),
              ),
            ]),
          ),
          flips: cptFlips,
        },
        losses,
      },
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
const METRIC_LABELS = {
  ite: "cost (ITE)",
  toolTokens: "tool tokens",
  turns: "turns",
  calls: "tool calls",
  graphqlPoints: "GraphQL points",
  restCore: "REST core requests",
};

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
  "| session | GraphQL points: pr-shepherd / gh / MCP | REST core: pr-shepherd / gh / MCP | pr-shepherd on the REST transport | pr-shepherd on cloud REST |",
  "| --- | --- | --- | --- | --- |",
  ...Object.entries({ pr: "single PR", stack: "PR stack" }).map(([k, label]) => {
    const a = apiSessions[k];
    return `| ${label} | ${num(a.shepherd.graphqlPoints)} / ${num(a.gh.graphqlPoints)} / ${num(a.mcp.graphqlPoints)} | ${num(a.shepherd.restCore)} / ${num(a.gh.restCore)} / ${num(a.mcp.restCore)} | ${num(a.shepherdRest.restCore)} core + ${num(a.shepherdRest.graphqlPoints)} points | ${num(a.shepherdCloud.restCore)} core + ${num(a.shepherdCloud.graphqlPoints)} points |`;
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
  `- **GitHub rate limit (assumed).** In a PR session pr-shepherd spends ${num(apiSessions.pr.shepherd.graphqlPoints)} GraphQL points and ${num(apiSessions.pr.shepherd.restCore)} REST requests; gh ${num(apiSessions.pr.gh.graphqlPoints)} and ${num(apiSessions.pr.gh.restCore)}; MCP ${num(apiSessions.pr.mcp.graphqlPoints)} and ${num(apiSessions.pr.mcp.restCore)}. GraphQL points ${apiPct("pr", "gh", "graphqlPoints")} vs. gh and ${apiPct("pr", "mcp", "graphqlPoints")} vs. MCP; REST requests ${apiPct("pr", "gh", "restCore")} and ${apiPct("pr", "mcp", "restCore")}.`,
);
out(
  `- **Waiting on CI, per hour.** pr-shepherd spends ${waitPerHour.shepherdGraphql} GraphQL points on the GraphQL transport (one fingerprint hit per ${POLL_SECONDS}s poll) and about ${waitPerHour.shepherdRest} REST requests on the REST transport (${waitPerHour.shepherdCloud} on cloud REST), which has no fingerprint shortcut. A \`gh pr checks --watch\` refresh costs ${waitPerHour.ghWatchGraphql} points; an MCP re-check about ${waitPerHour.mcpRest} requests.`,
);
// The event arm's summary lines: its session totals against each arm, and
// idle waiting per hour.
const evLine = (key, label) => {
  const { tokens: t, api: a } = eventSessions[key];
  const cmp = (v) =>
    `${num(v("event"))} (poll ${num(v("shepherd"))}, gh ${num(v("gh"))}, MCP ${num(v("mcp"))})`;
  const api = (f) => cmp((arm) => a[arm][f]);
  const tk = (m) => cmp((arm) => t[arm][m]);
  return `${label}: ${api("graphqlPoints")} GraphQL points, ${api("restCore")} REST requests, ${tk("turns")} turns, ${tk("toolTokens")} tool tokens and ${tk("ite")} ITE`;
};
out(
  `- **Event arm (informational, assumed, not gated).** A background \`pr-shepherd wait\` with ETag change detectors (#544). ${evLine("pr", "PR session")}. ${evLine("stack", "Stack session")}. Each of its ${num(eventSessions.pr.wakes)} PR-session wakes (${num(eventSessions.stack.wakes)} on a stack) adds a request to read the background start, so it spends more turns and tokens than the blocking poll. The hypothetical hosted webhook proxy spends ${num(eventSessions.pr.api.eventProxy.graphqlPoints)} GraphQL points and ${num(eventSessions.pr.api.eventProxy.restCore)} REST core of the user's token in a PR session (${num(eventSessions.stack.api.eventProxy.graphqlPoints)} and ${num(eventSessions.stack.api.eventProxy.restCore)} on a stack), on the agent's own mutations and reads.`,
);
out(
  `- **Idle waiting, per hour (assumed).** The poll arm's blocking \`--until-terminal\` call (the skill's mode, and the comparison that counts) spends ${idleHour.shepherd.graphqlPoints} GraphQL points and no turn; the legacy bounded \`--timeout 4.5m\` CLI mode, which the skill no longer uses, spends ${num(idleHour.shepherdBounded.graphqlPoints)} points (it returns every ${BOUNDED_POLL_SECONDS}s, after ${boundedTicks} ticks) and ${num(idleHour.shepherdBounded.wakes)} wakes (${num(idleHour.shepherdBounded.turns)} turns, ${num(idleHour.shepherdBounded.ite)} ITE). The event arm spends ${idleHour.event.graphqlPoints} points on ${num(idleHour.event.wakes)} reconcile snapshots and no REST (${num(idleHour.event.conditional)} conditional requests, all 304), with ${num(idleHour.event.turns)} turns (${num(idleHour.event.ite)} ITE). The hypothetical proxy spends nothing of the user's token, with the same wakes.`,
);
const TRANSPORT_LABELS = { graphql: "GraphQL", rest: "REST", cloud: "cloud REST" };
const lossCount = (issue) => losses.filter((l) => l.issue === issue).length;
out(
  losses.length
    ? `- **Losses: ${losses.length}.** pr-shepherd costs more than a baseline on ${losses.length} gated cells below: ${lossCount(528)} on tokens or turns (#528) and ${lossCount(525)} on the GitHub rate limit (#525). Each is on the temporary pending list, pending-losses.json; \`bench.mjs --check\` fails on any other loss and on any listed one that is gone.`
    : "- **Losses: none.** pr-shepherd costs no more than any baseline on any gated metric.",
);
out();
if (losses.length) {
  out("### Losses");
  out();
  out(
    'Every session and scenario where pr-shepherd costs strictly more than a baseline, on any gated metric. Token metrics are the same on both transports; rate-limit metrics are listed per transport (GraphQL, standard REST, and REST through the Claude Code cloud proxy). README.md "The gate" has the rules.',
  );
  out();
  out("| where | metric | vs. | pr-shepherd | baseline | change | issue |");
  out("| --- | --- | --- | --- | --- | --- | --- |");
  for (const l of losses) {
    const where = l.where.startsWith("session:")
      ? `${SESSIONS[l.where.slice(8)]}`
      : `\`${l.where}\``;
    const metric = `${METRIC_LABELS[l.metric]}${l.transport ? ` (${TRANSPORT_LABELS[l.transport]} transport)` : ""}`;
    out(
      `| ${where} | ${metric} | ${BASELINES[l.baseline]} | ${num(l.ours)} | ${num(l.theirs)} | ${pct(saving(l.theirs, l.ours))} | #${l.issue} |`,
    );
  }
  out();
}

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
  `Rate-limit cost per session, weighted like the token numbers. **Deterministic and assumed**: no GitHub call is made. GraphQL is counted in points, REST in core requests, and the two buckets are separate. pr-shepherd costs come from docs/graphql-usage.md and the REST HTTP-boundary tests; gh costs are the per-call assumptions in README.md, and MCP costs are read from the pinned github-mcp-server source (data/mcp-api-map.json). ${mcpVerificationNote(MCP_API)} The pr-shepherd one-PR tick is cross-checked against live \`--verbose\` apiUsage below.`,
);
out();
out("| session | arm | GraphQL points | REST core requests |");
out("| --- | --- | --- | --- |");
const API_LABELS = {
  shepherd: "pr-shepherd",
  shepherdRest: "pr-shepherd, REST transport",
  shepherdCloud: "pr-shepherd, cloud REST",
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
out(
  "| scenario | pr-shepherd | pr-shepherd, REST | pr-shepherd, cloud REST | gh CLI | GitHub MCP |",
);
out("| --- | --- | --- | --- | --- | --- |");
for (const r of rows.filter((r) => !r.setup)) {
  const c = (a) => `${num(r.api[a].graphqlPoints)} / ${num(r.api[a].restCore)}`;
  out(
    `| \`${r.id}\` | ${c("shepherd")} | ${c("shepherdRest")} | ${c("shepherdCloud")} | ${c("gh")}${r.gaps.gh ? " †" : ""} | ${c("mcp")}${r.gaps.mcp ? " †" : ""} |`,
  );
}
out();
out(
  `- Waiting on CI costs ${waitPerHour.shepherdGraphql} GraphQL points an hour for pr-shepherd (one fingerprint hit per ${POLL_SECONDS}s poll), about ${waitPerHour.shepherdRest} REST requests an hour on the REST transport (${waitPerHour.shepherdCloud} on cloud REST), ${waitPerHour.ghWatchGraphql} points for \`gh pr checks --watch --interval ${POLL_SECONDS}\`, and about ${waitPerHour.mcpRest} REST requests for a one-minute MCP re-check.`,
);
out(
  MCP_API.verified
    ? `- MCP tool costs are read from data/mcp-api-map.json, checked against each tool's handler in ${MCP_API.source} (default configuration: lockdown and IFC labels off).`
    : `- MCP tool costs are read from data/mcp-api-map.json. They have not been re-checked since the pin moved to ${MCP_API.source}.`,
);
out(
  "- The REST-transport column resolves nothing by REST: a thread resolve has no standard REST route, so `apply review` there spends only its replies, and ready-for-review escalates as transport-unsupported.",
);
out(
  "- The cloud REST column is REST through the Claude Code cloud proxy (`CLAUDE_CODE_REMOTE=true`): each PR snapshot also reads `/ccr/review_threads` (one more request per PR per tick), and thread resolves and ready-for-review are one CCR POST each.",
);
out();
out("### Live cross-check");
out();
out(
  `Measured \`apiUsage\` from \`pr-shepherd iterate --verbose\` on ${API_CHECK.pr} (${API_CHECK.date}; ${API_CHECK.prState}), two one-shot ticks per transport from fresh state, against the model. A one-shot \`iterate\` skips the fingerprint cache, so each tick is a full read; a first tick's model adds its first-look annotation reads.`,
);
out();
out("| transport | tick | action | measured points / requests | model | measured ÷ model |");
out("| --- | --- | --- | --- | --- | --- |");
// The model side comes from lib.mjs, so a changed constant shows up here. A
// one-shot `iterate` never uses the fingerprint cache (only the poll path
// does), so every measured tick is a full read; first-look annotation reads
// are added through annotationBatchApi.
const MODEL_TICK = {
  "full GraphQL tick": SHEPHERD_TICK_API,
  "full REST tick": SHEPHERD_TICK_API_REST,
};
for (const t of API_CHECK.ticks) {
  const key = t.transport === "rest" ? "restCore" : "graphqlPoints";
  const base = MODEL_TICK[t.model];
  if (base === undefined) throw new Error(`api-usage-check.json: unknown model ${t.model}`);
  const model =
    base[key] + (t.annotationCheckRuns ? annotationBatchApi(t.annotationCheckRuns)[key] : 0);
  out(
    `| ${t.transport} | ${t.tick} (${t.model}) | \`${t.action}\` | ${num(t[key])} | ${num(model)} | ${(t[key] / model).toFixed(2)} |`,
  );
}
out();
for (const t of API_CHECK.ticks.filter((t) => t.detail))
  out(`- ${t.transport}, ${t.tick}: ${t.detail}.`);
out();
out("## Event arm (informational)");
out();
out(
  'A local session where a background `pr-shepherd wait` replaces the blocking poll: REST change detectors with ETags, a full snapshot only when one changes, and a reconcile snapshot on a timer. The command does not exist yet (#544), and it is not the cloud event mode (`poll.mode`), so **every number here is assumed** (README.md "Event arm"). It is not gated: it adds no loss and removes none.',
);
out();
out("| session | arm | GraphQL points | REST core requests | turns | tool calls | tool tokens | cost (ITE) |");
out("| --- | --- | --- | --- | --- | --- | --- | --- |");
const EVENT_LABELS = {
  event: "event",
  eventProxy: "event, hosted webhook proxy (hypothetical)",
  shepherd: "pr-shepherd poll",
  gh: "gh CLI",
  mcp: "GitHub MCP",
};
for (const [key, title] of Object.entries(SESSIONS)) {
  const { tokens: t, api: a } = eventSessions[key];
  for (const arm of EVENT_API_ARMS) {
    const tk = t[arm === "eventProxy" ? "event" : arm];
    out(
      `| ${title} | ${EVENT_LABELS[arm]} | ${num(a[arm].graphqlPoints)} | ${num(a[arm].restCore)} | ${num(tk.turns)} | ${num(tk.calls)} | ${num(tk.toolTokens)} | ${num(tk.ite)} |`,
    );
  }
}
out();
out(
  "Per scenario, `GraphQL points / REST core requests · turns` for one occurrence. The proxy column counts only the user's token; its turns are the event arm's.",
);
out();
out("| scenario | weight | wake | pr-shepherd poll | event | event, proxy |");
out("| --- | --- | --- | --- | --- | --- |");
for (const r of rows.filter((r) => !r.setup)) {
  const c = (a, turns) =>
    `${num(r.api[a].graphqlPoints)} / ${num(r.api[a].restCore)}${turns === undefined ? "" : ` · ${turns}`}`;
  out(
    `| \`${r.id}\` | ${r.weight} | ${r.eventWake} | ${c("shepherd", r.shepherd.turns)} | ${c("event", r.event.turns)} | ${c("eventProxy")} |`,
  );
}
out();
out("An idle hour, while nothing changes:");
out();
out("| arm | GraphQL points | REST core requests | conditional requests (304) | wakes | turns | cost (ITE) |");
out("| --- | --- | --- | --- | --- | --- | --- |");
for (const [a, label] of Object.entries({
  shepherd: "pr-shepherd poll, `--until-terminal` (the skill)",
  shepherdBounded: "pr-shepherd poll, legacy bounded `--timeout 4.5m` (not the skill)",
  event: "event",
  eventProxy: "event, hosted webhook proxy (hypothetical)",
})) {
  const h = idleHour[a];
  out(
    `| ${label} | ${num(h.graphqlPoints)} | ${num(h.restCore)} | ${num(h.conditional)} | ${num(h.wakes)} | ${num(h.turns)} | ${num(h.ite)} |`,
  );
}
out();
out(
  `- Wakes: \`change\` is a detector change, \`timer\` an elapsed \`nextCheck\` (here the ready delay), \`none\` a step the wait handles in process, as the poll does. Each wake costs one more request than the poll arm, which reads the background start's acknowledgement.`,
);
out(
  `- Detectors: ${EVENT_DETECTORS.length} conditional REST reads per PR every ${DETECTOR_POLL_SECONDS}s (${EVENT_DETECTORS.map((d) => `\`${d}\``).join(", ")}). A 304 costs no primary rate limit, only latency; a 200 is one REST core request. A change wakes the agent with one full snapshot, at the poll arm's GraphQL tick cost with no fingerprint miss.`,
);
out(
  `- Reconcile: a full snapshot ${RECONCILE_MINUTES} minutes after the last one, which wakes the agent. No modeled wait is that long, so the sessions have none; the idle hour has ${num(reconcilesPerHour)}.`,
);
out(
  "- The proxy row moves every pr-shepherd snapshot (detectors, change ticks, reconciles, and their log and annotation reads) to a hosted proxy's own token. The agent's mutations, merges, `apply review` reads and its own `gh` reads still count against the user.",
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
out("## Sensitivity: measured characters per token");
out();
if (!cptMeasured)
  out(
    "Not measured: `data/real-sessions.json` has too few clean samples for a ratio, so every step keeps the model's.",
  );
else {
  out(
    `The model counts ${MODEL.charsPerToken} characters per token for every arm. The real sessions below measured pr-shepherd's output at ${MEASURED_CPT.shepherd} and tool output overall at ${MEASURED_CPT.baseline}: pr-shepherd's output is denser. Here every step's tool results are re-scored with pr-shepherd at ${MEASURED_CPT.shepherd} and gh and GitHub MCP at ${MEASURED_CPT.baseline}; commands and tool schemas, which the fits did not measure, keep ${MODEL.charsPerToken}. MCP's ratio is unmeasured (no real session used it), so it takes the overall one. Turns and calls do not depend on the ratio. A denser ratio also pushes more MCP results past the host's ${num(MODEL.mcpOutputCapTokens)}-token cap, where they are rejected: MCP's cost can fall while it finishes less of the step. Only the ratio changes: the fits' per-result intercept (wrapper and harness reminders) is left out, as the model leaves it out.${baselinesNeverFewerCalls ? " Every baseline makes at least as many calls as pr-shepherd on every step, so the intercept would only add to the baselines' cost." : ""}`,
  );
  out();
  const cptExcluded = BASELINE_KEYS.flatMap((b) => {
    const ids = rows.filter((_, i) => cptIncomplete[b].has(i)).map((r) => `\`${r.id}\``);
    return ids.length ? [`vs. ${BASELINES[b]}, ${ids.join(", ")}`] : [];
  });
  if (cptExcluded.length) {
    out(
      "An arm that gains a truncated or rejected call at the measured ratios no longer finishes that step. Each comparison below and its verdicts leave out, on both sides, the steps where pr-shepherd or that baseline does:",
    );
    out();
    for (const line of cptExcluded) out(`- ${line}`);
    out();
  }
  out("| session | metric | vs. | characters per token | pr-shepherd | baseline | saving |");
  out("| --- | --- | --- | --- | --- | --- | --- |");
  for (const [key, title] of Object.entries(SESSIONS))
    for (const m of ["ite", "toolTokens"])
      for (const b of ["gh", "mcp"])
        for (const [label, s] of [
          [`${MODEL.charsPerToken} for every arm`, cptCompare[b].baseSessions[key]],
          [
            `${MEASURED_CPT.shepherd} / ${MEASURED_CPT.baseline}${b === "mcp" ? " (unmeasured)" : ""}`,
            cptCompare[b].measuredSessions[key],
          ],
        ]) {
          const t = s.total;
          out(
            `| ${title} | ${METRIC_LABELS[m]} | ${BASELINES[b]} | ${label} | ${num(t.shepherd[m])} | ${num(t[b][m])} | ${pct(saving(t[b][m], t.shepherd[m]))} |`,
          );
        }
  out();
  if (cptFlips.length) {
    out(
      "Verdicts, per session and per scenario, that flip to a loss at the measured ratios. They are gated like any other loss and pending in `pending-losses.json` under `chars-per-token:`:",
    );
    out();
    for (const l of cptFlips)
      out(
        `- ${l.where.slice("chars-per-token:".length)}: ${METRIC_LABELS[l.metric]} vs. ${BASELINES[l.baseline]}, ${num(l.ours)} vs. ${num(l.theirs)} (#${l.issue})`,
      );
  } else out("No session or scenario verdict flips at the measured ratios.");
}
out();
for (const line of realSessionsSection()) out(line);

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
  `- \`BatchPr\` supplements are charged where the scenario's state triggers them. \`CheckRunAnnotationsBatch\` is ${annotationBatchApi(1).graphqlPoints} point per 20 uncached annotated check runs (${annotationBatchApi(1).restCore} annotation read per check run on REST), in \`failing-check\` and \`check-annotations\`. The READY-receipt sibling makes the elapsed-ready-delay tick in \`merge\` and \`merge-queue\` 2 points. \`BaseBehind\` (${BASE_BEHIND_GRAPHQL} point on every tick while a required status context is unreported) matches no scenario's state, so none is charged it.`,
);
out(
  "- The REST column is standard REST (no Claude Code cloud proxy): ready-for-review and thread resolves are unsupported there.",
);
out(
  `- The cloud REST column is the same REST path through the Claude Code cloud proxy: ${SHEPHERD_TICK_API_CLOUD.restCore} requests per one-PR tick (the standard ${SHEPHERD_TICK_API_REST.restCore} plus \`/ccr/review_threads\`), 6 + 13 per layer on a stack, a 5-request transcript read before replies, and one CCR POST per thread resolve and per ready-for-review.`,
);
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
