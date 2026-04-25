import type {
  AgentThread,
  AgentComment,
  AgentCheck,
  Review,
  ResolveCommand,
  IterateResultBase,
  FirstLookThread,
  FirstLookComment,
} from "../../types.mts";

/**
 * Render a ResolveCommand as a single-line command string for the monitor loop
 * to print or execute. This is NOT a general-purpose POSIX escaper — it wraps
 * the two known placeholders ($DISMISS_MESSAGE, $HEAD_SHA) and any whitespace-
 * bearing arg in double quotes so multi-word values don't split across flags.
 *
 * Contract for callers substituting placeholders: replace the entire quoted
 * token (including the surrounding `"`) with a properly shell-quoted literal.
 * Do not splice raw text inside the existing quotes — the output would then
 * re-expand `$…` / `$(…)` / embedded `"` and break.
 */
export function renderResolveCommand(rc: ResolveCommand): string {
  // `$HEAD_SHA` is never in `rc.argv` — it is appended pre-quoted below when
  // `requiresHeadSha`. Only `$DISMISS_MESSAGE` (or whitespace-bearing values)
  // need quoting here.
  const needsQuoting = (arg: string) => {
    if (arg === "$DISMISS_MESSAGE") return true;
    // Assert no characters that would break the naive escaper are present in arg
    if (/["$`\\]/.test(arg)) {
      throw new Error(
        `Unexpected character in argv arg that needsQuoting can't handle: ${JSON.stringify(arg)}`,
      );
    }
    return /\s/.test(arg);
  };
  const parts = rc.argv.map((a) => (needsQuoting(a) ? `"${a}"` : a));
  if (rc.requiresHeadSha) {
    parts.push("--require-sha", '"$HEAD_SHA"');
  }
  return parts.join(" ");
}

export function buildFixInstructions(
  threads: AgentThread[],
  actionableComments: AgentComment[],
  checks: AgentCheck[],
  reviews: Review[],
  baseBranch: string,
  resolveCommand: ResolveCommand,
  hasConflicts: boolean,
  prNumber: number,
  cancelledCount: number,
  firstLookThreads: FirstLookThread[] = [],
  firstLookComments: FirstLookComment[] = [],
): string[] {
  const instructions: string[] = [];

  if (threads.length > 0 || actionableComments.length > 0) {
    instructions.push(
      `Apply code fixes: read and edit each file referenced under \`## Review threads\` and \`## Actionable comments\` above.`,
    );
  }
  const checksWithRunId = checks.filter((c) => c.runId);
  const externalChecks = checks.filter((c) => !c.runId && c.detailsUrl);
  const bareChecks = checks.filter((c) => !c.runId && !c.detailsUrl);
  if (checksWithRunId.length > 0) {
    instructions.push(
      `For each failing check under \`## Failing checks\` with a run ID: examine the log tail shown in the fenced block when available (or run \`gh run view <runId> --log-failed\` if the block is absent) to decide what to do. If the logs show a transient runner or infrastructure failure (e.g. network timeout, runner setup crash, OOM kill), run \`gh run rerun <runId> --failed\` and stop this iteration — CI will re-run automatically. If the logs show a real test or build failure, apply a code fix.`,
    );
  }
  if (externalChecks.length > 0) {
    instructions.push(
      `For each bullet in \`## Failing checks\` starting with \`external\` (external status check): open the linked URL in a browser to inspect the failure — log tails are not available for external checks.`,
    );
  }
  if (bareChecks.length > 0) {
    instructions.push(
      `For each bullet in \`## Failing checks\` starting with \`(no runId)\`: there is no run or details URL to inspect. Escalate these to a human — they require manual investigation outside the pr-shepherd flow.`,
    );
  }
  if (reviews.length > 0) {
    instructions.push(
      `For each bullet under \`## Changes-requested reviews\` above: read the review body and apply the requested changes.`,
    );
  }

  const hasCodeChanges =
    threads.length > 0 || actionableComments.length > 0 || checks.length > 0 || reviews.length > 0;
  const needsPush = hasCodeChanges || hasConflicts;

  if (hasCodeChanges) {
    instructions.push(
      `Commit changed files: \`git add <files> && git commit -m "<descriptive message>"\``,
    );
    instructions.push(
      `Keep the PR title and description current: if the changes alter the PR's scope or intent, run \`gh pr edit ${prNumber} --title "<new title>" --body "<new body>"\` to reflect them. Skip if the existing title/body still accurately describe the PR.`,
    );
  }

  if (needsPush) {
    const captureHint = resolveCommand.requiresHeadSha
      ? ` — capture \`HEAD_SHA=$(git rev-parse HEAD)\``
      : "";
    if (hasConflicts) {
      instructions.push(
        `Rebase with conflict resolution: run \`git fetch origin && git rebase origin/${baseBranch}\`. If the rebase halts with conflicts, edit the conflicted files to resolve them, \`git add <files>\`, then \`git rebase --continue\`. Repeat until the rebase completes, then \`git push --force-with-lease\`${captureHint}.`,
      );
    } else {
      instructions.push(
        `Rebase and push: \`git fetch origin && git rebase origin/${baseBranch} && git push --force-with-lease\`${captureHint}`,
      );
    }
  }

  // Only tell the agent to run `resolve:` if the command actually mutates
  // GitHub state. A CONFLICTS-only flow has nothing to mutate on GitHub.
  if (resolveCommand.hasMutations) {
    const substituteParts: string[] = [];
    if (resolveCommand.requiresHeadSha) {
      substituteParts.push(`"$HEAD_SHA" with the pushed commit SHA`);
    }
    if (resolveCommand.requiresDismissMessage) {
      substituteParts.push(`$DISMISS_MESSAGE with a one-sentence description of what you changed`);
    }
    const substituteHint =
      substituteParts.length > 0 ? `, substituting ${substituteParts.join(" and ")}` : "";
    instructions.push(`Run the \`resolve:\` command shown above${substituteHint}.`);
  }

  if (needsPush && cancelledCount > 0) {
    instructions.push(
      `Do not re-run \`gh run cancel\` on the IDs listed under \`## Cancelled runs\` — the CLI cancelled those runs before your push, and your push has already triggered new runs with different IDs.`,
    );
  }

  const firstLookTotal = firstLookThreads.length + firstLookComments.length;
  if (firstLookTotal > 0) {
    instructions.push(
      `Items in \`## First-look items\` are already closed on GitHub — do not pass their IDs to \`--resolve-thread-ids\`, \`--minimize-comment-ids\`, or \`--dismiss-review-ids\`. Acknowledge each one with a one-line classification (e.g. "outdated — addressed by commit abc1234", "resolved — already fixed", "minimized — noise").`,
    );
  }

  if (resolveCommand.hasMutations) {
    instructions.push(
      `For any large decisions or rejections you made this iteration, add or update a \`## Shepherd Journal\` section in the PR description (\`gh pr edit ${prNumber} --body …\`) summarizing each decision. For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID.`,
    );
  }

  if (needsPush) {
    instructions.push(
      `Stop this iteration — CI needs time to run on the new push before the next tick.`,
    );
  } else if (resolveCommand.hasMutations) {
    instructions.push(`Stop this iteration before the next tick.`);
  } else {
    instructions.push(`End this iteration.`);
  }

  return instructions;
}

export function buildWaitLog(base: IterateResultBase): string {
  const { summary, remainingSeconds } = base;
  const parts: string[] = [`WAIT: ${summary.passing} passing, ${summary.inProgress} in-progress`];

  switch (base.mergeStatus) {
    case "BLOCKED":
      if (base.reviewDecision === "REVIEW_REQUIRED") parts.push("awaiting human review");
      else if (base.reviewDecision === "APPROVED") parts.push("awaiting additional approvals");
      else parts.push("awaiting human review or branch protection");
      break;
    case "BEHIND":
      parts.push("branch is behind base");
      break;
    case "DRAFT":
      parts.push("PR is a draft");
      break;
    case "UNSTABLE":
      parts.push("some checks are unstable");
      break;
  }

  if (remainingSeconds > 0) {
    parts.push(`${remainingSeconds}s until auto-cancel`);
  }

  return parts.join(" — ");
}
