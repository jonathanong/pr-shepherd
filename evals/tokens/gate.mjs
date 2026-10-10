// The bench gate: every metric on which pr-shepherd is worse than a baseline,
// per session and per scenario. `bench.mjs --check` fails on a loss that is not
// on the pending list (pending-losses.json), and on a pending entry that is no
// longer a loss, so the list can only shrink. README.md "The gate" has the rules.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TOKENS_DIR } from "./lib.mjs";

/** Token metrics: the model gives every pr-shepherd transport the same output. */
export const TOKEN_METRICS = ["ite", "toolTokens", "turns", "calls"];
/** Rate-limit metrics, one bucket each, gated per pr-shepherd transport. */
export const API_METRICS = ["graphqlPoints", "restCore"];
/** "rest" is standard REST; "cloud" is REST through the Claude Code cloud proxy. */
export const TRANSPORTS = { graphql: "shepherd", rest: "shepherdRest", cloud: "shepherdCloud" };
const TOKEN_BASELINES = ["gh", "mcp", "mcpEager"];
// Eager MCP makes the same calls as MCP, so its rate-limit cost is MCP's.
const API_BASELINES = ["gh", "mcp"];

/** The issue that removes a loss on this metric. */
export const ISSUE_FOR = {
  ite: 528,
  toolTokens: 528,
  turns: 528,
  calls: 528,
  graphqlPoints: 525,
  restCore: 525,
};

export const PENDING_PATH = join(TOKENS_DIR, "pending-losses.json");

/** A loss's identity. Values are not part of it, so a number change is not churn. */
export const lossKey = (l) =>
  `${l.where} ${l.metric}${l.transport ? ` (${l.transport})` : ""} vs ${l.baseline}`;

/** A † baseline cannot finish the step: its lower cost is not a win. */
const gap = (row, baseline) => row.gaps[baseline === "mcpEager" ? "mcp" : baseline];

/**
 * Every (scope, metric, transport, baseline) where pr-shepherd costs strictly
 * more. A tie is not a loss.
 *
 * - Scenario rows skip a † baseline: it cannot do the step, so it cannot win it.
 *   Session totals keep the † rows at the baseline's partial cost, which only
 *   makes the session gate stricter on pr-shepherd.
 * - Setup rows compare against MCP only. gh has no setup step, and eager MCP
 *   carries its schemas on every later row instead. pr-shepherd's fixed cost is
 *   still gated against both, through the session totals.
 * - Setup touches no API, so setup rows have no rate-limit comparison.
 */
export function findLosses({ rows, sessions, apiSessions }) {
  const losses = [];
  const add = (where, metric, transport, baseline, ours, theirs) => {
    if (ours > theirs)
      losses.push({
        where,
        metric,
        ...(transport && { transport }),
        baseline,
        ours,
        theirs,
        issue: ISSUE_FOR[metric],
      });
  };
  for (const [key, s] of Object.entries(sessions)) {
    for (const b of TOKEN_BASELINES)
      for (const m of TOKEN_METRICS)
        add(`session:${key}`, m, null, b, s.total.shepherd[m], s.total[b][m]);
    for (const [t, arm] of Object.entries(TRANSPORTS))
      for (const b of API_BASELINES)
        for (const m of API_METRICS)
          add(`session:${key}`, m, t, b, apiSessions[key][arm][m], apiSessions[key][b][m]);
  }
  for (const r of rows) {
    for (const b of r.setup ? ["mcp"] : TOKEN_BASELINES) {
      if (gap(r, b)) continue;
      for (const m of TOKEN_METRICS) add(r.id, m, null, b, r.shepherd[m], r[b][m]);
    }
    if (r.setup) continue;
    for (const [t, arm] of Object.entries(TRANSPORTS))
      for (const b of API_BASELINES) {
        if (gap(r, b)) continue;
        for (const m of API_METRICS) add(r.id, m, t, b, r.api[arm][m], r.api[b][m]);
      }
  }
  return losses;
}

export const readPending = () => JSON.parse(readFileSync(PENDING_PATH, "utf8")).losses;

/** Compare the live losses with the pending list. */
export function checkPending(losses, pending) {
  const live = new Map(losses.map((l) => [lossKey(l), l]));
  const listed = new Map(pending.map((p) => [lossKey(p), p]));
  return {
    unlisted: losses.filter((l) => !listed.has(lossKey(l))),
    stale: pending.filter((p) => !live.has(lossKey(p))),
    wrongIssue: pending.filter(
      (p) => live.has(lossKey(p)) && p.issue !== ISSUE_FOR[p.metric],
    ),
    duplicate: pending.filter((p, i) => pending.findIndex((q) => lossKey(q) === lossKey(p)) !== i),
  };
}

/** A pending-list entry for a loss, as it should appear in pending-losses.json. */
export const pendingEntry = (l) => ({
  where: l.where,
  metric: l.metric,
  ...(l.transport && { transport: l.transport }),
  baseline: l.baseline,
  issue: l.issue,
});
