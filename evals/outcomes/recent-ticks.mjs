// Shepherd's answers for scenarios 64-68, the behavior merged in #781, #784, #797,
// #798 and #752/#754. Each edits a recorded snapshot rather than hand-writing the
// tick, so a later wording change in the snapshot flows through.

import { buildWatchedReport, formatWatchedReport } from "../../src/cli/watch-report.mts";
import { fixtureText } from "../lib.mjs";

/** gh's cached rate-limit entries, as `merge.ghCacheStaleRateLimit` lists them. */
export const GH_CACHE_PATHS = ["/Users/you/.cache/gh/3f/9a/3f9a6c1e", "/Users/you/.cache/gh/b2/07/b2074d5c"];
export const GH_CACHE_EXPIRES = "2026-11-20T10:00:00.000Z";

/** Fixture 64's MERGE tick plus the stale-cache step #798 puts before the merge command. */
export const staleGhCache = (t) => {
  const [head, steps] = t.split("## Instructions\n\n");
  const shifted = steps.replace(/^(\d+)\. /gm, (_, n) => `${Number(n) + 1}. `);
  const rm = `\`rm ${GH_CACHE_PATHS.join(" ")}\``;
  return `${head}## Instructions\n\n1. gh's HTTP cache holds a stale GraphQL rate-limit response that makes \`gh pr merge\` fail until ${GH_CACHE_EXPIRES}, although the live quota is healthy. Delete it with ${rm}, then run the merge command below.\n${shifted}`;
};

/** The report a repeating run prints when another live process holds the PR, then its exit code 17. */
export const WATCHED = `${formatWatchedReport(
  buildWatchedReport({ owner: "owner", name: "repo" }, [
    { pr: 42, pid: 41233, flags: ["--merge", "--until-terminal"] },
  ]),
)}
exit code 17`;

/** An `iterate` mock: the first call gets the investigation tick, later calls the wait. */
export const shownFailureIterate = (tick) => `---
type: agent
---

If your history shows no earlier call to this command, this is the first call:
answer it with the text between the FIRST lines. Answer every call that follows
an earlier one (same head, same run) with the text between the SECOND lines.
Print only that text and nothing else.

=== FIRST
${tick}
===

=== SECOND
${fixtureText("199-wait-in-progress-run-failure-shown")}
===`;

/** Fixture 178 cut to one review, made on an older commit that one later commit follows. */
export const olderCommitReview = (t) =>
  t
    .replace("[reviewed `1234567`, head `def5678`, 2 commits since]", "[reviewed `a1b2c3d`, head `c0ffee1`, 1 commit since]")
    .replace("### `reviewId=PRR_on_head` (@claude · Bot)\n\n> Please add a lock around the job counter.\n\n", "")
    .replace("PRR_older_commit,PRR_on_head", "PRR_older_commit");
