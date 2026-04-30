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
 * Render a resolve command as a shell snippet. Wraps `$DISMISS_MESSAGE` and whitespace-bearing
 * argv entries in double quotes for placeholder substitution. Throws if argv contains `"$\`\`.
 * `$HEAD_SHA` is appended separately when `requiresHeadSha` is set.
 */
export function renderResolveCommand(rc: ResolveCommand): string {
  const needsQuoting = (arg: string) => {
    if (arg === "$DISMISS_MESSAGE") return true;
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
  firstLookSummaries: Review[] = [],
  editedSummaries: Review[] = [],
): string[] {
  const instructions: string[] = [];
  const hasSuggestions = threads.some((t) => t.suggestion);

  if (hasSuggestions) {
    instructions.push(
      `For each thread marked \`[suggestion]\` under \`## Review threads\`: run \`npx pr-shepherd commit-suggestion ${prNumber} --thread-id <id> --message "<one-sentence headline>" --format=json\`, one thread at a time. On \`applied: true\` the CLI already resolved the thread — remove its ID from \`--resolve-thread-ids\` in the \`resolve:\` command below. On \`applied: false\` read \`reason\` and \`patch\`, fall through to the manual-edit step, and do not retry the same command. Optionally pass \`--dry-run\` (omitting \`--message\`) to preview the patch without mutating the working tree.`,
    );
  }

  if (threads.length > 0 || actionableComments.length > 0) {
    const suggestionFallback = hasSuggestions
      ? ` When applying a \`[suggestion]\` thread manually (e.g. after a failed \`commit-suggestion\` run), replace the exact line range shown in the heading (\`path:startLine-endLine\`) with the replacement shown in its \`Replaces lines …\` block verbatim — an empty replacement deletes those lines, a single blank line replaces the range with one blank line.`
      : "";
    instructions.push(
      `Apply code fixes: read and edit each file referenced under \`## Review threads\` and \`## Actionable comments\` above.${suggestionFallback}`,
    );
  }
  const checksWithRunId = checks.filter((c) => c.runId);
  const externalChecks = checks.filter((c) => !c.runId && c.detailsUrl);
  const bareChecks = checks.filter((c) => !c.runId && !c.detailsUrl);
  if (checksWithRunId.length > 0) {
    instructions.push(
      `For each failing check under \`## Failing checks\` with a run ID, examine the log tail in the fenced block to decide what to do:\n   - If the log tail shows a transient runner or infrastructure failure (network timeout, runner setup crash, OOM kill), run \`gh run rerun <runId> --failed\` and stop this iteration — CI will re-run automatically.\n   - If the log tail shows a real test or build failure, apply a code fix.\n   - If the fenced log block is absent, run \`gh run view <runId> --log-failed\` first to fetch it, then choose between rerun and fix above.`,
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

  const firstLookTotal = firstLookThreads.length + firstLookComments.length;
  if (firstLookTotal > 0) {
    instructions.push(
      `Items in \`## First-look items\` are for acknowledgement only — do not pass their IDs to \`--resolve-thread-ids\`, \`--minimize-comment-ids\`, or \`--dismiss-review-ids\`. Acknowledge each one with a one-line classification (e.g. "outdated — addressed by commit abc1234", "resolved — already fixed", "minimized — noise").`,
    );
  }

  if (firstLookSummaries.length > 0) {
    instructions.push(
      `Review the bodies shown under \`## Review summaries (first look — to be minimized)\` — you are seeing these for the first time. Their IDs are already included in the \`resolve:\` command's \`--minimize-comment-ids\`; if any warrants a \`## Shepherd Journal\` entry, record it before running resolve.`,
    );
  }
  const editedTotal =
    editedSummaries.length +
    firstLookThreads.filter((t) => t.edited).length +
    firstLookComments.filter((c) => c.edited).length;
  if (editedTotal > 0) {
    instructions.push(
      `Items under \`## Review summaries (edited since first look)\` and any first-look bullet tagged \`, edited\` were updated by their author after you previously acknowledged them. Read the updated body. Do **not** include their IDs in \`--minimize-comment-ids\`, \`--resolve-thread-ids\`, or \`--dismiss-review-ids\` — they are already closed or minimized on GitHub.`,
    );
  }
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
