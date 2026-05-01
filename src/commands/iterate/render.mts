import type {
  AgentThread,
  AgentComment,
  AgentCheck,
  Review,
  ResolveCommand,
  FirstLookThread,
  FirstLookComment,
} from "../../types.mts";

/**
 * Render a resolve command as a shell snippet. Wraps `$DISMISS_MESSAGE` and whitespace-bearing
 * argv entries in double quotes for placeholder substitution. Throws if argv contains `"`, `$`,
 * `` ` ``, or `\`. `$HEAD_SHA` is appended separately when `requiresHeadSha` is set.
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
  inProgressRunIds: string[] = [],
): string[] {
  const instructions: string[] = [];

  if (inProgressRunIds.length > 0)
    instructions.push(
      `Cancel in-progress CI runs first: for each ID under \`## In-progress runs\`, run \`gh run cancel <id>\`. Do this before applying any code fixes — the push at the end of this iteration will supersede those runs anyway, so letting them continue burns CI minutes for results no one will read. If \`gh\` reports a run is already completed, ignore it and continue with the next ID.`,
    );
  const hasSuggestions = threads.some((t) => t.suggestion);
  if (hasSuggestions) {
    instructions.push(
      `For each thread marked \`[suggestion]\` under \`## Review threads\`: run \`npx pr-shepherd commit-suggestion ${prNumber} --thread-id <id> --message "<one-sentence headline>" --format=json\` to retrieve the patch and suggested commit. The CLI does not mutate the working tree — apply the patch yourself (run \`git apply\` with the diff shown, or edit the file directly using the line range), then stage the listed file and run the suggested \`git commit\` from the \`## Instructions\` section. Include the thread ID in \`--resolve-thread-ids\` in the \`resolve:\` command below (the thread is not auto-resolved). If the patch fails to apply, fall through to the manual-edit step. Do not retry the same command.`,
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
  const cancelledRunIdChecks = checks.filter((c) => c.runId && c.conclusion === "CANCELLED");
  const failedRunIdChecks = checks.filter((c) => c.runId && c.conclusion !== "CANCELLED");
  const externalChecks = checks.filter((c) => !c.runId && c.detailsUrl);
  const bareChecks = checks.filter((c) => !c.runId && !c.detailsUrl);
  if (failedRunIdChecks.length > 0) {
    instructions.push(
      `For each failing check under \`## Failing checks\` with a run ID and no \`[conclusion: CANCELLED]\` tag: run \`gh run view <runId> --log-failed\` to fetch the failing job's log.`,
    );
    instructions.push(
      `If the log shows a transient infrastructure failure (network timeout, runner setup crash, OOM kill): run \`gh run rerun <runId> --failed\`.`,
    );
    instructions.push(`If the log shows a real test/build failure: apply a code fix.`);
  }
  if (cancelledRunIdChecks.length > 0) {
    instructions.push(
      `For each \`[conclusion: CANCELLED]\` bullet under \`## Failing checks\`: the run was cancelled outside Shepherd's control (manual cancel, newer push, concurrency-group eviction). Run \`gh run rerun <runId>\` only if the cancellation looks unintended; otherwise treat it as resolved by the superseding run. Do NOT confuse these with IDs under \`## Cancelled runs\` — those were cancelled by Shepherd itself.`,
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
