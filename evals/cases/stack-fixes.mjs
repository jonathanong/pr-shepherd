// Cases 47–52: agent behavior on the output of recent native-stack fixes.
//
//   - #567: a stacked layer's required contexts come from the stack trunk, and
//     a cancelled run with the highest run ID is the one GitHub's required gate
//     reads (duplicate runs from a stack push, github/gh-stack#466). 47 and 48
//     are mirrors, like 05 and 04: rerun the printed cancellations in one, rerun
//     nothing in the other. 49 is the same cancellation on a queue commit.
//   - #509: a merged parent's retained base on the bottom open layer (50).
//   - Merge-queue removal of a native stack layer (51) and the REST stack queue
//     guard (52).
//
// Fixtures with no case here, because an existing case already grades the same
// behavior: 144 (WAIT on an in-progress check: 01, 11), 118 (single-PR queue
// ejection: 35, 36), 122 (51 plus an external check: 10), 130 (all owned layers
// at once: 16, merged parent: 28), 132 (route only the listed layer: 17) and
// 134 (REST queue recovery on a one-layer stack: 36).

import { ITERATES_AGAIN, ITERATES_STACK_AGAIN, PR_URL, llm, regex, skillFired, stackShape } from "../lib.mjs";

const VOUCH_2687 = "https://github.com/vouchington/vouchington/pull/2687";

/** 47 and 48 share this framing, so only the fixture separates them. */
const stackLayerShape = (fixture) =>
  `Shepherd ${VOUCH_2687} through to a terminal state. It is the top layer of a
native PR stack; I pushed the stack with \`gh stack push\` a few minutes ago. I
already ran the first tick — here is what it returned. Take it from there.

---

${fixture}`;

/** 49 was recorded with `--merge`; the framing carries that intent. */
const mergeShape = (fixture) =>
  `Shepherd ${PR_URL} and merge it. I already ran the first tick
(\`pr-shepherd ${PR_URL} --until-terminal --merge\`) — here is what it returned.
Take it from there.

---

${fixture}`;

/** 51 was recorded without `--merge`. */
const shepherdShape = (fixture) =>
  `Shepherd ${PR_URL} through to a terminal state. I already ran the first tick —
here is what it returned. Take it from there.

---

${fixture}`;

export const STACK_FIXES_CASES = [
  {
    // #567 / fixture 145. Each required context has an older green run and a
    // newer cancelled one. The summary line says "3 passing" and the review is
    // APPROVED, which pulls toward calling the layer green.
    slug: "47-stack-layer-cancelled-latest-run-rerun",
    tier: "discriminating",
    runs: 6,
    fixture: "145-fix-code-stacked-layer-required-check-latest-run-cancelled",
    shape: stackLayerShape,
    tags: ["stack", "fix-code", "ci-triage"],
    graders: {
      "runs-a-printed-rerun": regex(String.raw`gh run rerun\s+20[0-2](?![0-9])`),
      "reruns-every-cancelled-required-check": llm(
        `The plan runs all three printed \`rerun:\` commands — \`gh run rerun 200\`,
\`gh run rerun 201\` and \`gh run rerun 202\` (each with \`-R vouchington/vouchington\`)
— once each, and then iterates without waiting for CI.

The output lists \`static\`, \`web\` and \`gitleaks\` under \`## Failing checks\`
with \`[conclusion: CANCELLED]\` and a printed \`rerun:\` command, and the status
is \`FAILING\` with merge state \`BLOCKED\`. A cancelled check is rerun.

Failing responses do any of: call CI green, passing or ready because the summary
says "3 passing"; skip any of the three reruns; merge or enqueue the PR; push an
empty commit or rebase to retrigger CI instead of rerunning; edit code; wait or
watch (\`gh run watch\`, \`gh pr checks --watch\`) for the reruns; escalate or
hand the cancellations to the user.`,
      ),
      "iterates-immediately": llm(ITERATES_AGAIN),
      "skill-fired": skillFired,
    },
  },

  {
    // Mirror of 47 / fixture 146: the cancellations are older than a green run,
    // so Shepherd lists them as superseded and waits. Without this case a
    // blanket "rerun anything cancelled" policy would pass 47.
    slug: "48-stack-layer-superseded-no-rerun",
    tier: "discriminating",
    runs: 6,
    fixture: "146-wait-stacked-layer-required-check-older-run-cancelled",
    shape: stackLayerShape,
    tags: ["stack", "wait", "ci-triage"],
    graders: {
      "does-not-rerun-superseded-checks": llm(
        `The plan reruns nothing. The \`superseded\` line names \`static\`, \`web\` and
\`gitleaks\`, but no check is failing, no \`rerun:\` command is printed, and the
action is \`[WAIT]\` with "no action needed this tick".

Passing responses take no CI action and rerun pr-shepherd with the same
options. Saying the superseded runs need no rerun is CORRECT and should pass.

Failing responses do any of: run \`gh run rerun\` or re-trigger any workflow;
push an empty commit or rebase to refresh CI; merge or enqueue the PR (the user
did not ask for a merge); present the PR as finished; wait on a watcher such as
\`gh run watch\` or \`gh pr checks --watch\`.`,
      ),
      "iterates-immediately": llm(ITERATES_AGAIN),
      "skill-fired": skillFired,
    },
  },

  {
    // #567 / fixture 147: the same latest-run cancellation, on the queue commit
    // that removed the PR. A merge_group run has no autonomous follow-up, so the
    // action is ESCALATE. Case 05's "CANCELLED must rerun" and the user's merge
    // request both pull the wrong way.
    slug: "49-queue-cancelled-required-run-escalate",
    tier: "discriminating",
    runs: 6,
    fixture: "147-escalate-queue-required-check-latest-run-cancelled",
    shape: mergeShape,
    tags: ["escalate", "merge-queue", "ci-triage"],
    graders: {
      "stops-and-hands-off": llm(
        `The plan stops the loop and hands the PR to the human, as the \`[ESCALATE]\`
output instructs, naming the evidence it shows: run \`200\`, the \`web\` check,
\`[conclusion: CANCELLED]\` on the queue commit \`queue-commit-1\`.

Passing responses report that evidence, say what the human needs to decide, and
stop. Mentioning the printed resume command for after the human acts is fine.

Failing responses do any of: rerun pr-shepherd now or keep polling; present the
PR as merged or ready; stop without saying what needs human attention.`,
      ),
      "does-not-rerun-or-requeue": llm(
        `The plan does NOT rerun run \`200\` or its workflow, and does NOT enqueue,
requeue or merge PR #42 itself.

The cancelled run belongs to the merge group (\`scope merge_group\`). Rerunning it
cannot restore the queue entry and overwrites the evidence, and the output
prints no rerun or queue command. Suggesting that the human may requeue after
investigating is fine.

Failing responses do any of: run \`gh run rerun 200\` or re-trigger the \`web\`
workflow; run \`gh pr merge 42\` (with or without \`--auto\`) or a GraphQL
\`enqueuePullRequest\` mutation; push an empty commit or update the branch to
retrigger CI.`,
      ),
      "skill-fired": skillFired,
    },
  },

  {
    // #509 / fixture 131: every open layer is READY and the user asked to merge,
    // but the bottom open layer still targets its merged parent's branch.
    // GitHub rejects `gh pr edit --base` on a native-stack PR.
    slug: "50-stack-merged-parent-retarget-wait",
    tier: "guard",
    runs: 6,
    fixture: "131-aggregate-stack-merged-parent-retarget-wait",
    shape: stackShape("https://github.com/vouchington/vouchington/pull/2547", { merge: true }),
    tags: ["stack", "wait", "merge", "merged-parent"],
    graders: {
      "waits-without-merging-or-retargeting": llm(
        `The plan merges nothing this tick and does not retarget or rewrite any layer.
It rechecks with the same \`pr-shepherd --stack … --merge\` selector at the
polling cadence.

Passing responses state that nothing needs doing now and rerun the stack
selector.

Failing responses do any of: run \`gh stack merge\`, \`gh pr merge\` or enable
auto-merge on any layer; change PR #2547's base (\`gh pr edit --base main\` or
the API); rebase or push any layer (\`gh stack rebase\`, \`gh stack push\`,
\`git push\`); unstack, close or recreate the PRs; block on a watcher such as
\`gh pr checks --watch\`; treat the \`timeout\` heading as the end of the loop or
ask the user what to do.`,
      ),
      "iterates-the-stack": llm(ITERATES_STACK_AGAIN),
      "skill-fired": skillFired,
    },
  },

  {
    // Fixture 120: a native stack layer removed from the merge queue for
    // failed_checks. The base update goes through `gh stack`, and the printed
    // `acknowledge queue removal:` is conditional on the head NOT changing.
    slug: "51-stack-queue-removal-ack-route",
    tier: "guard",
    runs: 6,
    fixture: "120-fix-code-native-stack-queue-removal-ack",
    shape: shepherdShape,
    tags: ["stack", "fix-code", "merge-queue"],
    graders: {
      "updates-through-gh-stack": regex(String.raw`gh stack rebase`),
      "acknowledges-only-on-an-unchanged-head": llm(
        `The plan updates the stack from the latest base with the printed route
(\`gh stack checkout 7\` if needed, check out PR #42's head branch,
\`gh stack rebase\`), and reproduces the failing \`CI › tests\` step on the updated
head. Then it branches on the result:

- If the rebase or a fix changed the head, it pushes with \`gh stack push\` and
  does NOT run \`acknowledge queue removal:\`.
- Only if the head did not change, no code changed and the failure is transient
  (the excerpt is a provider \`HTTP 529\`) does it run the printed
  \`pr-shepherd apply queue-removal …\` command exactly as printed.

Either way it then reruns pr-shepherd.

Failing responses do any of: run \`acknowledge queue removal:\` unconditionally or
after a push; update with a plain \`git rebase\`/\`git merge\` and push only
PR #42's branch with \`git push\`; skip the base update; run \`gh pr merge\` or
any enqueue command; rerun the \`scope: merge_group\` check (\`gh run rerun\`);
escalate.`,
      ),
      "iterates-immediately": llm(ITERATES_AGAIN),
      "skill-fired": skillFired,
    },
  },

  {
    // Fixture 135: a REST native-stack merge into a required merge queue goes
    // through Shepherd's own `apply merge`, bound to the observed stack. The
    // familiar `gh stack merge` (case 19) is not what this output prints.
    slug: "52-rest-stack-merge-queue",
    tier: "guard",
    runs: 6,
    fixture: "135-aggregate-rest-stack-queue-guard",
    shape: stackShape("https://github.com/owner/repo/pull/342", {
      merge: true,
      extra: " --transport rest",
    }),
    tags: ["stack", "merge", "merge-queue", "rest"],
    graders: {
      "runs-the-printed-apply-merge": regex(
        // `--transport rest` in the same invocation; the `--expected-stack` JSON
        // has no `;`, `&` or `|`, so the lookahead stays inside the command.
        String.raw`pr-shepherd\s+apply\s+merge\s+https://github\.com/owner/repo/pull/342(?![0-9])(?=(?:[^\n;&|]|\\\n)*--transport[=\s]+rest)`,
      ),
      "uses-the-printed-route-and-reruns": llm(
        `The plan runs the printed \`pr-shepherd apply merge …/pull/342 … --transport rest\`
command as printed, including its \`--require-sha\`, \`--merge-action merge_queue\`
and \`--expected-stack\` arguments. If it returns \`pending\` it reruns that same
command; \`enqueued\` is not treated as merged. Afterwards it reruns
\`pr-shepherd --stack … --until-terminal --merge --transport rest\` (in any flag
order, or "with the same options").

Failing responses do any of: replace the printed command with \`gh stack merge\`,
\`gh pr merge\` on #341 or #342, or a GraphQL \`enqueuePullRequest\` mutation; drop
or edit the \`--expected-stack\` or \`--require-sha\` arguments; merge or enqueue
the layers one at a time; report the stack merged as soon as it is enqueued;
drop \`--transport rest\` or \`--merge\` from the next tick; ask the user to
confirm the merge.`,
      ),
      "skill-fired": skillFired,
    },
  },
];
