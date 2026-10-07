// Cases 23+: rules from recent CLI changes and recent transcript failures.

import { ITERATES_AGAIN, PR_URL, PR_URL_43, llm, regex, shapeA, skillFired } from "../lib.mjs";

export const RECENT_CASES = [
  {
    // #477 and agent-blackboard: "pr-shepherd tells you to rebase. why didn't
    // you follow?". The rebase step sits in the middle of an ordinary review
    // fix, so it is easy to push the fix and skip the rebase.
    slug: "23-behind-base-rebase-hint",
    fixture: "73-fix-code-behind-base-hint",
    shape: shapeA,
    tags: ["fix-code", "behind-base"],
    graders: {
      "rebases-before-pushing": llm(
        `The plan rebases the PR branch onto \`main\` before pushing, as instructed
("The branch is behind PR base branch \`main\`. rebase --force-with-lease before
pushing."), and pushes with \`--force-with-lease\` rather than a plain \`--force\`.

Passing responses fix the review thread, rebase onto the current \`main\`, push
with \`--force-with-lease\`, and then use the pushed SHA for the review command.

Failing responses do any of: skip the rebase; merge \`main\` into the branch
instead; push with bare \`--force\`; rebase only after running the review
command; defer the rebase to a later tick; stop to ask the user for permission
before rebasing or force-pushing (rebasing your own PR head and pushing with
\`--force-with-lease\` needs no confirmation).`,
      ),
      "runs-the-generated-apply-command": llm(
        `The plan commits to running the generated \`apply review:\` command for
\`PRRT_behind_hint\`, with \`$HEAD_SHA\` set to the SHA pushed after the rebase.

Failing responses do any of: omit it; run it with the pre-rebase SHA; resolve the
thread through the GitHub UI instead.`,
      ),
      "iterates-immediately": llm(ITERATES_AGAIN),
      "skill-fired": skillFired,
    },
  },
  {
    // Six sessions across Claude, Codex and Cursor: an agent shepherding several
    // independent PRs stops when the first loop ends ("Only 3 of 4 PRs have
    // reached terminal", "why are there so many PRs in draft still? are you not
    // shepherding them?", "the skill says to continue until it returns CANCEL or
    // ESCALATE. why do you keep stopping?"). The CANCEL is real, but it ends one
    // PR's loop, not the task.
    slug: "25-multi-pr-cancel-is-per-pr",
    fixture: "03-cancel-ready-delay-elapsed-clean",
    // The framing mirrors the real shape: the request is old, and what arrives is
    // one background loop's result with nothing about the other PR's state.
    shape: (
      fixture,
    ) => `Earlier I asked you to "make PRs for issues #101 and #102 and shepherd them".
You opened ${PR_URL} and ${PR_URL_43}, then started
\`pr-shepherd <url> --until-terminal\` in the background for each.

Background task finished: \`pr-shepherd ${PR_URL} --until-terminal\`

---

${fixture}`,
    tags: ["cancel", "multi-pr"],
    graders: {
      "stops-only-42": llm(
        `The plan treats #42's \`[CANCEL]\` as the end of #42's loop only, and keeps
shepherding #43 (letting its running \`pr-shepherd … --until-terminal\` loop continue
and handling its result, or rerunning it if that loop already ended)
until #43 itself returns \`[CANCEL]\` or \`[ESCALATE]\`.

Passing responses stop polling #42 and continue #43's loop, then report once
both are terminal. Treating #43's pending CI as something the loop handles, not
a reason to wait by hand, is fine.

Failing responses do any of: report the task complete or stop entirely because
#42 returned \`[CANCEL]\`; hand #43 back to the user; keep polling #42; start a
second #43 loop while the first is still running; poll #43
with \`gh pr checks\`, \`gh pr watch\` or \`gh run watch\`; merge either PR (the user
did not ask for a merge).`,
      ),
      "skill-fired": skillFired,
    },
  },
  {
    // Four sessions across Claude and Cursor: "why are you asking me to rebase?
    // that's part of the workflow.", "you rebase. stop asking me to approve
    // rebases", "why didn't you just rebase main and push?", "why did you make a
    // duplicate PR? you could've just rebased it". Rebasing your own PR head and
    // pushing --force-with-lease is in scope; bare --force is not.
    // Rebase-vs-merge is the repository's convention, not the skill's (the CLI
    // only relays it via iterate.behindBaseHint, #492), so the prompt states it.
    // What the skill adds is permission: lease-push your own head without asking.
    slug: "26-conflicts-rebase-without-asking",
    fixture: "27-fix-code-conflicts",
    shape: (
      fixture,
    ) => `This repository's AGENTS.md says: "Keep a linear history. Update a PR branch by
rebasing it onto its base, never by merging the base in."

${shapeA(fixture)}`,
    tags: ["fix-code", "conflicts"],
    graders: {
      "force-with-lease": regex(String.raw`push(?:[^\n]|\\\n)*--force-with-lease`),
      "rebases-without-asking": llm(
        `The plan rebases the PR branch onto the current \`main\`, resolves the
conflicts, pushes with \`--force-with-lease\`, and continues in the same turn.

Passing responses fetch \`main\`, rebase, resolve conflicts, push with
\`--force-with-lease\`, and iterate. Asking the user only when a conflict's correct
resolution is genuinely ambiguous is fine.

Failing responses do any of: stop to ask the user for permission to rebase or
force-push; merge \`main\` into the branch instead of rebasing; push with bare
\`--force\`; open a new PR or branch instead of updating #42; hand the conflicts
back to the user without attempting them.`,
      ),
      "iterates-immediately": llm(ITERATES_AGAIN),
      "skill-fired": skillFired,
    },
  },
  {
    // #2099 remained based on merged #2095's old head branch after its code was
    // rebased onto main. GitHub reported a conflict against that obsolete base.
    slug: "27-merged-parent-stale-base",
    fixture: "127-fix-code-merged-parent-stale-base",
    shape: (
      fixture,
    ) => `Shepherd https://github.com/vouchington/vouchington/pull/2099 through to a terminal state.
This is the final layer after PR #2095 merged. PR #2099 still targets
\`knip-exports-retentions\`, #2095's old head branch. I verified with GitHub's
compare API that #2099's head contains current \`main\` (2 ahead, 0 behind),
while it diverges from the old base (4 ahead, 7 behind). I have not asked you
to merge or enqueue the PR. Here is Shepherd's current output.

---

${fixture}`,
    tags: ["fix-code", "conflicts", "merged-parent"],
    graders: {
      "qualified-base-edit-command": regex(
        String.raw`gh pr edit https://github\.com/vouchington/vouchington/pull/2099 --base ["']?main["']?`,
      ),
      "retargets-verified-base-first": llm(
        `The plan verifies that merged PR #2095 is the exact old-base parent of
PR #2099 using the displayed branch, head OID, and repository fields. It then
runs \`gh pr edit https://github.com/vouchington/vouchington/pull/2099 --base main\`
before any code or branch update.

Failing responses retain \`knip-exports-retentions\` as #2099's base; only
suggest retargeting without committing to the command; ask the user for
permission to run the ordinary base edit; or change a different PR.`,
      ),
      "reruns-qualified-single-pr": llm(
        `After the base change, the plan immediately reruns
\`pr-shepherd https://github.com/vouchington/vouchington/pull/2099 --until-terminal\`
and follows its fresh output. It does not run the old output's remaining
conflict-resolution steps first.

Failing responses stop after \`gh pr edit\`, rerun a native-stack selector,
or use an unqualified PR number from another checkout.`,
      ),
      "avoids-obsolete-base-update-and-unauthorized-merge": llm(
        `The plan does not rebase, commit, or push #2099 against the obsolete
\`knip-exports-retentions\` parent before seeing the new Shepherd result.
It does not use \`gh stack\` because GitHub reports no native stack, and it
does not merge or enqueue the PR because the user has not authorized that.

Failing responses follow the generic conflict steps and push, call
\`gh stack rebase\` or \`gh stack merge\`, or add \`--merge\` to the next
Shepherd command.`,
      ),
      "skill-fired": skillFired,
    },
  },
];
