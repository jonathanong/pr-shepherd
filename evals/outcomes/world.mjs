// Shared pieces of scenario worlds and graders.

/** The diff size a world states unless it gives its own, so the mocks do not invent one. */
export const DIFF = "+48 −3";

/** The PR line every world starts from; `extra` adds repo rules after it. */
export const PR = (
  extra = "",
  files = "`src/paginate.ts`, `tests/pagination.spec.ts`",
  diff = DIFF,
) => `PR #42 "Add pagination" in owner/repo: open, not a draft, base \`main\`, head
\`feature\` at commit \`c0ffee1\`, author \`you\`.${extra}
Changed files: ${files}. The diff is ${diff} (additions, deletions).`;

/**
 * The follow-through clause most graders share. The case prompt forbids
 * re-checking within the pass, so a re-check listed as the next step counts.
 */
export const STEPS = `After the work, the plan checks the PR again (with whatever tool it uses) and
keeps going until it is mergeable, rather than presenting the work as finished or
asking the user whether to continue. The prompt forbids re-checking within this
pass, so a re-check listed as the next numbered step counts. Leaving the merge
itself for the user's go-ahead is fine when the user did not ask for a merge.`;

/**
 * What counts as polling. The state-reading tool may answer instantly with the
 * same state, so a couple of back-to-back re-reads are not a wait.
 */
export const REREAD = `Re-reading the PR state once or twice in a row (for example re-running the
same status tool right after it answered) is not polling, even when the prompt
forbids re-checking. After reporting that a human must decide, any further re-check
is polling, as are sleeping, watching, or further repeated re-checks.`;

/**
 * Adds the "files changed on both sides" section and its step (#699) to a
 * conflicts tick recorded before that output existed, as fixture 179 prints it.
 */
export const withConflictFiles = (files) => (t) =>
  t
    .replace(
      "\n## Instructions\n",
      `\n## Files changed on both sides since the merge base\n\n${files.map((f) => `- \`${f}\``).join("\n")}\n\n## Instructions\n`,
    )
    .replace(
      "2. Commit any remaining conflict-resolution changes",
      "2. Start with the files under `## Files changed on both sides since the merge base`: the PR and its base both changed them, so they are the likeliest conflicts, but GitHub does not list conflicting files and the list may be incomplete. Resolve the conflicts yourself rather than handing them to the user.\n3. Commit any remaining conflict-resolution changes",
    )
    .replace("3. Rerun Shepherd now.", "4. Rerun Shepherd now.");

/**
 * What `gh stack merge` and a squash merge do, as world facts so every arm can
 * find the same atomic merge and knows what a bottom-up merge needs.
 */
export const GH_STACK = `\`gh stack merge N --yes --squash\` squash-merges layers 1 through N of N's stack
into \`main\` atomically, bottom-up, and GitHub retargets any layer above N onto
\`main\`. If any layer conflicts with \`main\` it prints \`merge failed: Merge
conflict detected\` and merges nothing. Merging a layer with \`gh pr merge\` while
its base is still the layer below's branch lands it on that branch, not on
\`main\`. A squash merge rewrites the layer's commits: after layer K is
squash-merged and the layer above it is retargeted onto \`main\`, that layer still
carries layer K's original commits. If it edits lines layer K changed, merging it
reports a merge conflict, and its diff shows layer K's changes.
\`git rebase --onto main <old head of layer K>\` (or \`gh stack rebase\`) drops
those commits; the rebased branch is pushed with \`--force-with-lease\`.`;

/**
 * The one rule every stack-merge grader applies. A native stack lands either in
 * one atomic merge, or bottom-up with a rebase after each squash merge.
 */
export const STACK_MERGE_RULE = `Judge the outcome: every layer in scope ends up merged into \`main\` (never into a
parent branch), nothing outside scope is merged, and the report matches the calls
the agent made. Any of these ways of landing the layers passes:
- one atomic stack merge (\`gh stack merge <top layer> --yes --squash\` or an
  equivalent single operation) through the named top layer;
- bottom-up, retargeting each layer above the first to \`main\` (\`gh pr edit N --base
  main\` or the equivalent API call) and then merging it with a merge commit. The
  history is untouched, so no rebase is needed, and nothing here asks for squash
  or linear history;
- bottom-up with squash merges, where the agent rebases the next layer onto
  \`main\` dropping the merged layer's commits (\`git rebase --onto main <old head
  of the merged layer>\`, or \`gh stack rebase\`) and pushes it with
  \`--force-with-lease\` before merging it. A retargeted layer that a squash merge
  accepts without a conflict also passes.
Any of these fails: merging a layer while its base is still its parent's branch
(it lands on the parent, not on \`main\`); retrying a merge that reported a
conflict instead of resolving it; reporting a merge no call made; leaving the
stack partly merged and calling it done; bare \`--force\`.`;

/**
 * The second, stricter grader on stack-merge scenarios that end in a merge. The
 * outcome grader (weight 3) passes either way of landing; this one (weight 2)
 * passes only the atomic stack merge, so atomic scores 1.0, a correct bottom-up
 * merge 0.6 and a failure 0. A user who asks to merge layers as they become ready
 * makes bottom-up the ideal, and the scenario then needs no atomic grader.
 */
export const ATOMIC_GRADER = `The user asked for the stack to be merged, so the ideal is one atomic stack
merge per requested stack (\`gh stack merge <top layer> --yes --squash\` or an
equivalent single operation) that lands every layer the user wants through the
top layer, with no per-layer merges. Pass only if the agent's plan lands the layers that way. Fail
if it merges layer by layer, even with the correct rebase and push between
merges, or if it does not merge. Judge only this; whether the merge is otherwise
correct is graded separately.`;

/**
 * Merge-queue repositories refuse a direct merge. Scenarios that use it set
 * `failures: true` so the mocks answer these calls as errors instead of "healthy".
 */
export const QUEUE_REJECTS_DIRECT_MERGE = `Direct merges are not allowed on \`main\`: the REST merge endpoint
(\`PUT /repos/owner/repo/pulls/N/merge\`) and the GitHub MCP merge tool answer HTTP
405 "Changes must be made through the merge queue", every time, and merge
nothing. \`gh pr merge N\` does not merge: it adds the PR to the merge queue (or,
with \`--auto\`, enables auto-merge through the queue) and prints that.`;

/**
 * For the graders of merge-queue scenarios. The prompts do not say the repository uses
 * a queue, so an agent often tries the direct merge first and gets the 405. That attempt
 * changes nothing; only an accepted enqueue or merge does.
 */
export const REJECTED_MERGE_NOTE = `A direct merge call that GitHub rejects (HTTP 405 "Changes must be made through the
merge queue") and that changes nothing is not by itself a failure. What counts is whether
the PR ends up queued or merged and what the agent commits to. \`gh pr merge\`, which the
queue accepts as an enqueue, still counts, as does a plan to run it or any merge that
succeeds.`;
