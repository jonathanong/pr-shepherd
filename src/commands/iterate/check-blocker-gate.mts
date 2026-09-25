import { graphql } from "../../github/client.mts";
import { pollRateLimitRetryAfterMs } from "../poll-quota.mts";
import {
  clearCheckBlocker,
  formatCheckBlockerRef,
  readCheckBlockers,
  type CheckBlockerRef,
} from "../../state/check-blockers.mts";
import type { IterateResult } from "../../types.mts";

const RATE_LIMIT = "cost limit nodeCount remaining resetAt used";

const PULL_QUERY = `query CheckBlockerPull($owner: String!, $name: String!, $number: Int!) {
  _shepherdRateLimit: rateLimit { ${RATE_LIMIT} }
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) { state merged }
  }
}`;

const ISSUE_QUERY = `query CheckBlockerIssue($owner: String!, $name: String!, $number: Int!) {
  _shepherdRateLimit: rateLimit { ${RATE_LIMIT} }
  repository(owner: $owner, name: $name) {
    issue(number: $number) { state }
  }
}`;

export interface CheckBlockerGate {
  deferredNames: ReadonlySet<string>;
  releasedNames: ReadonlySet<string>;
  /** `owner/name#number` for blockers that are still open. */
  openBlockers: readonly string[];
}

type Lookup = "deferred" | "released" | "ignored";

interface StateKey {
  owner: string;
  repo: string;
  pr: number;
}

/**
 * Match failing checks to stored blockers. No records, or none of them name a
 * failing check, skips GitHub. Rate-limit errors propagate; other lookup
 * failures leave that check as a normal failure.
 */
/** Behind or conflicting branches still need the update-branch instruction. */
const KEEP_RELEASED_STATUS = new Set(["BEHIND", "CONFLICTS", "DIRTY", "UNKNOWN"]);

export async function resolveCheckBlockerGate(
  key: StateKey,
  failing: readonly { name: string }[],
  mergeStatus?: string,
): Promise<CheckBlockerGate | null> {
  const records = await readCheckBlockers(key);
  if (records.length === 0 || failing.length === 0) return null;
  const failingNames = new Set(failing.map((check) => check.name));
  const matched = records.filter((record) => failingNames.has(record.checkName));
  if (matched.length === 0) return null;

  const lookups = new Map<string, Lookup>();
  for (const record of matched) {
    const id = blockerKey(record.blocker);
    if (lookups.has(id)) continue;
    lookups.set(id, await lookupBlocker(record.blocker));
  }

  const deferredNames = new Set<string>();
  const releasedNames = new Set<string>();
  const openBlockers: string[] = [];
  const seen = new Set<string>();
  for (const record of matched) {
    const status = lookups.get(blockerKey(record.blocker));
    if (status === "deferred") {
      deferredNames.add(record.checkName);
      const label = formatCheckBlockerRef(record.blocker);
      if (!seen.has(label)) {
        seen.add(label);
        openBlockers.push(label);
      }
    } else if (status === "released") {
      if (mergeStatus !== undefined && !KEEP_RELEASED_STATUS.has(mergeStatus)) {
        // The branch is already current, so update-branch would no-op and a
        // later unrelated failure must be a normal check again.
        await clearCheckBlocker(key, record.checkName);
      } else {
        releasedNames.add(record.checkName);
      }
    }
  }
  if (deferredNames.size === 0 && releasedNames.size === 0) return null;
  return { deferredNames, releasedNames, openBlockers };
}

/** Append the open blocker to a WAIT log. Other actions are unchanged. */
export function annotateBlockedWait(
  result: IterateResult,
  gate: CheckBlockerGate | null,
): IterateResult {
  if (result.action !== "wait" || gate === null || gate.openBlockers.length === 0) return result;
  const note = `blocked by ${gate.openBlockers.join(", ")}`;
  if (result.log.includes(note)) return result;
  return { ...result, log: `${result.log} — ${note}` };
}

async function lookupBlocker(blocker: CheckBlockerRef): Promise<Lookup> {
  try {
    const vars = { owner: blocker.owner, name: blocker.name, number: blocker.number };
    if (blocker.kind === "issue") {
      const { data } = await graphql<{
        repository: { issue: { state: string } | null } | null;
      }>(ISSUE_QUERY, vars);
      const issue = data.repository?.issue;
      if (!issue) return ignore(blocker, "not found");
      if (issue.state === "OPEN") return "deferred";
      if (issue.state === "CLOSED") return "released";
      return ignore(blocker, `unexpected state ${issue.state}`);
    }
    const { data } = await graphql<{
      repository: { pullRequest: { state: string; merged: boolean } | null } | null;
    }>(PULL_QUERY, vars);
    const pull = data.repository?.pullRequest;
    if (!pull) return ignore(blocker, "not found");
    if (pull.state === "OPEN" && pull.merged !== true) return "deferred";
    if (pull.state === "MERGED" || pull.state === "CLOSED" || pull.merged === true) {
      return "released";
    }
    return ignore(blocker, `unexpected state ${pull.state}`);
  } catch (err) {
    if (pollRateLimitRetryAfterMs(err) !== null) throw err;
    const message = err instanceof Error ? err.message : String(err);
    return ignore(blocker, message);
  }
}

function ignore(blocker: CheckBlockerRef, message: string): "ignored" {
  process.stderr.write(
    `pr-shepherd: check blocker lookup failed for ${formatCheckBlockerRef(blocker)} (ignored): ${message}\n`,
  );
  return "ignored";
}

function blockerKey(blocker: CheckBlockerRef): string {
  return `${blocker.kind}:${formatCheckBlockerRef(blocker)}`;
}
