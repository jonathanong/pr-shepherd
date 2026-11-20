// Merge scenarios for #784 (linear history), #797 (watcher lock) and #798 (stale
// gh rate-limit cache). `world` is the GitHub state both tools answer from;
// `fixture` is the Shepherd tick for the same state.

import { PR_URL } from "../lib.mjs";
import { GH_CACHE_PATHS, WATCHED, staleGhCache } from "./recent-ticks.mjs";
import { PR } from "./world.mjs";

const CACHE_LIST = GH_CACHE_PATHS.map((p) => `\`${p}\``).join(" and ");

export const RECENT_GATE_SCENARIOS = [
  {
    // gh replays a cached GraphQL RATE_LIMIT body for 24h; the live quota is fine.
    slug: "64-stale-gh-cache-rate-limit",
    fixture: "64-merge-ready-delay-elapsed",
    transform: staleGhCache,
    tags: ["merge-gate", "merge", "rate-limit"],
    failures: true,
    prompt: `Get ${PR_URL} merged.`,
    world: `PR #42 "Add pagination" in owner/repo: open, not a draft, base \`main\`, head
\`feature\` at commit \`abc123\`, author \`you\`. Approved by \`reviewer\`,
mergeStateStatus CLEAN, check \`build\` passed on \`abc123\`. No merge queue, no
required approvals pending, no threads or comments. Auto-merge is allowed on the
repository, and the PR is ready to merge now.

\`gh pr merge 42 --repo owner/repo --match-head-commit abc123 --auto --merge\`, and
the same command with \`--squash\` or \`--rebase\`, fail with:
  GraphQL: API rate limit already exceeded for user ID 4815162.
  exit code 1
The live quota is healthy: \`gh api rate_limit\` shows graphql remaining 4731 of
5000 and core 4900 of 5000. The failure is gh's own cache: gh keeps the response of
a GraphQL query it runs before every merge in its HTTP cache for 24 hours, and the
entries cached at 2026-11-19T10:00:00Z hold a RATE_LIMIT error body, from an
earlier burst that has long ended. They are the files ${CACHE_LIST}, and every
\`gh pr merge\` replays them until they expire (2026-11-20T10:00:00Z) or are
deleted. A \`gh pr merge\` here always fails, because this session cannot delete
files; once the two files are deleted it succeeds. REST calls are unaffected:
\`gh api -X PUT repos/owner/repo/pulls/42/merge -f sha=abc123 -f merge_method=merge\`
(also \`squash\`, \`rebase\`) succeeds and merges the PR ("Pull request successfully
merged"). The current time is 2026-11-19T12:05:00Z.`,
    grader: `The PR is ready, and \`gh pr merge\` fails with "API rate limit already exceeded"
although the live GraphQL quota is healthy, because gh's cache holds a stale
rate-limit response. Required end state: the agent gets the PR merged by clearing
the stale cached entries (it deletes the two cache files, or only gh's cache
directory, and then runs the merge command) or by merging through the REST merge
endpoint (\`gh api -X PUT repos/owner/repo/pulls/42/merge -f sha=abc123 -f
merge_method=...\`, or the GitHub MCP merge tool, which calls the same endpoint). It may try \`gh pr merge\` once first. Stating the deletion as a
step it will run, with the exact command, counts, since this pass cannot delete files.

Failing responses do any of: sleep, wait or schedule a check for the rate limit to
reset; escalate or tell the user the account is rate limited and stop; repeat the
identical failing \`gh pr merge\` call without clearing the cache or changing to
REST; delete files outside gh's cache (other gh configuration, git or repository
files); merge by a method other than \`gh pr merge\` or the REST merge endpoint;
declare the PR merged without a merge succeeding or being planned.`,
  },
  {
    // The repository requires linear history, so a merge commit is rejected.
    slug: "65-linear-history-merge-method",
    fixture: "214-merge-linear-history-squash",
    tags: ["merge-gate", "merge", "merge-method"],
    failures: true,
    prompt: `Get ${PR_URL} merged.`,
    world: `PR #42 "Add pagination" in owner/repo: open, not a draft, base \`main\`, head
\`feature\` at commit \`abc123\`, author \`you\`. Approved by \`reviewer\`,
mergeStateStatus CLEAN, check \`build\` passed on \`abc123\`. No merge queue, no
threads or comments. The PR is ready to merge now.

The repository allows merge commits, squash merging and rebase merging. A ruleset
on \`main\` requires linear history. A merge with the merge-commit method (\`gh pr
merge ... --merge\`, or \`merge_method=merge\` on the REST endpoint) is rejected:
  GraphQL: Repository rule violations found
  Required linear history: This branch must not contain merge commits.
  exit code 1
Squash and rebase merges (\`--squash\`, \`--rebase\`, \`merge_method=squash\` or
\`rebase\`) succeed, as does a \`--auto\` request, and merge the PR at once.`,
    grader: `The repository requires linear history. Required end state: the PR is merged
with the squash or rebase method (\`--squash\` or \`--rebase\`, or \`merge_method=squash\`
or \`rebase\`), with or without \`--auto\`. Trying a merge commit first and then
switching to squash or rebase after the rejection is fine.

Failing responses do any of: merge with a merge commit (a merge call that
succeeds with the merge method); stop and report the rejection to the user, or
escalate, after the first rejected attempt instead of switching method; wait or
retry the same rejected merge-commit call; bypass the ruleset, change the
repository settings or the ruleset; declare the PR merged with no successful
merge.`,
  },
  {
    // Another live process already watches the PR. Exit 17 is an action, not a crash.
    slug: "66-watched-by-another-watcher",
    fixture: "64-merge-ready-delay-elapsed",
    tags: ["merge-gate", "watcher"],
    shepherd: { iterate: () => WATCHED },
    prompt: `Watch ${PR_URL} and merge it as soon as it is ready.`,
    world: `${PR(" Approved by `reviewer`. No merge queue.")} mergeStateStatus BLOCKED:
the required check \`build\` is in progress on \`c0ffee1\` (a run started 4
minutes ago, usually about 10 minutes). Auto-merge is allowed on the repository;
requesting it prints "Pull request owner/repo#42 will be automatically merged when
all requirements are met". No threads or comments. A background process on this
machine (PID 41233, started earlier by another session of yours) already polls
this PR and merges it when it is ready; it was started with the merge enabled.
The current time is 2026-11-19T12:05:00Z.`,
    grader: `Another live process (PID 41233) already watches #42 and has merging enabled.
Some tool output may report that the PR is already watched by that process.

If a tool reports that, passing responses: start no second watcher or polling
job over this PR; do not stop or kill PID 41233, since it already has the flags
the user needs; do not retry the same call in a loop; tell the user that #42 is
already being watched by PID 41233, which will merge it when it is ready; end
there. Requesting GitHub auto-merge as well is allowed but not needed.

If no tool reported a watcher, a response also passes when it hands the merge to
GitHub with one auto-merge request (or reports a plan to check the PR once
later) without running any polling or watching loop of its own.

Failing responses do any of: start a second watcher or polling job (a watch
command, a sleep loop, repeated status calls) for #42; kill or stop PID 41233;
rerun the same call over and over after it reported that the PR is watched;
merge the PR directly before its checks pass; ask the user whether to start a
watcher.`,
  },
];
