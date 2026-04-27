import type { FetchResult } from "./resolve.mts";

/**
 * Build the numbered triage/fix/resolve instruction steps for the agent to follow.
 * Steps are conditionally emitted based on what the fetch returned (mirrors
 * `buildFixInstructions` in `commands/iterate/render.mts`).
 */
export function buildFetchInstructions(
  prNumber: number,
  result: Omit<FetchResult, "instructions">,
): string[] {
  const {
    actionableThreads,
    firstLookThreads,
    actionableComments,
    firstLookComments,
    changesRequestedReviews,
    reviewSummaries,
    commitSuggestionsEnabled,
  } = result;

  const firstLookTotal = firstLookThreads.length + firstLookComments.length;

  const total =
    actionableThreads.length +
    actionableComments.length +
    changesRequestedReviews.length +
    reviewSummaries.length +
    firstLookTotal;

  if (total === 0) {
    return ["No actionable items and no first-look items — end this invocation."];
  }

  const hasCodeItems =
    actionableThreads.length > 0 ||
    actionableComments.length > 0 ||
    changesRequestedReviews.length > 0;
  const hasSuggestions =
    commitSuggestionsEnabled && actionableThreads.some((t) => t.suggestion != null);

  const instructions: string[] = [];

  instructions.push(
    `Classify every item listed above into exactly one of: Fixed / Actionable / Not relevant / Outdated / Acknowledge. Do not silently skip any item. Bot-authored review summaries (authors whose name contains \`[bot]\` or matches \`copilot-pull-request-reviewer\`, \`gemini-code-assist\`) default to Acknowledge with reason "bot summary — no actionable content" unless the body calls out an unaddressed issue.`,
  );

  if (firstLookTotal > 0) {
    instructions.push(
      `Items in \`## First-look items\` are for acknowledgement only — do not pass their IDs to \`--resolve-thread-ids\`, \`--minimize-comment-ids\`, or \`--dismiss-review-ids\`. Acknowledge each one with a one-line classification (e.g. "outdated — addressed by commit abc1234", "resolved — already fixed", "minimized — noise").`,
    );
  }

  if (hasSuggestions) {
    instructions.push(
      `For each Actionable thread marked \`[suggestion]\` in \`## Actionable Review Threads\` above: run \`npx pr-shepherd commit-suggestion ${prNumber} --thread-id <id> --message "<one-sentence headline>" --format=json\`, one thread at a time. On \`applied: true\` mark it Fixed — the CLI already resolved the thread, so exclude the ID from \`--resolve-thread-ids\`. On \`applied: false\` read \`reason\` and \`patch\`, then fall through to the manual fix step — do not retry the same command. Optionally pass \`--dry-run\` (omitting \`--message\`) if you want to inspect the unified diff before it mutates the working tree — the CLI validates with \`git apply --check\`, returns the patch and \`valid: true/false\`, and exits \`1\` on drift without committing or resolving the thread.`,
    );
  }

  if (hasCodeItems) {
    instructions.push(
      `Read and edit each file referenced under \`## Actionable Review Threads\`, \`## Actionable PR Comments\`, and \`## Pending CHANGES_REQUESTED reviews\` above. Reclassify each fixed item as Fixed. If an item is too complex to address, leave it as Actionable for the final report.`,
    );
    instructions.push(
      `Commit changed files: \`git add <files>\` (not \`git add -A\`) \`&& git commit -m "<descriptive message>"\`.`,
    );
    instructions.push(
      `Keep the PR title and description current: if the fixes alter the PR's scope or intent, run \`gh pr edit ${prNumber} --title "<new title>" --body "<new body>"\` to reflect them. Skip if the existing title/body still accurately describe the PR.`,
    );
    instructions.push(
      `Rebase and push: \`BASE_BRANCH=$(gh pr view ${prNumber} --json baseRefName --jq .baseRefName) && git fetch origin && git rebase "origin/$BASE_BRANCH" && git push --force-with-lease\`.`,
    );
    instructions.push(
      `Cancel stale in-progress runs: \`BRANCH=$(git rev-parse --abbrev-ref HEAD) && CURRENT_SHA=$(git rev-parse HEAD) && gh run list --branch "$BRANCH" --status in_progress --json databaseId,headSha --jq ".[] | select(.headSha != \\"$CURRENT_SHA\\") | .databaseId" | xargs -I{} gh run cancel {}\`.`,
    );
  }

  const requireShaHint = hasCodeItems
    ? ` Include \`--require-sha $(git rev-parse HEAD)\` only when the rebase-and-push step above ran.`
    : "";
  const dismissNote =
    changesRequestedReviews.length > 0
      ? ` For \`--dismiss-review-ids\`: \`--message\` is required with one specific sentence describing the fix or the reason for not acting (no boilerplate like "address review comments"); omit \`--message\` when not dismissing. Review-summary IDs (\`PRR_…\` from \`## Review summaries\`) go into \`--minimize-comment-ids\`, never \`--dismiss-review-ids\`.`
      : reviewSummaries.length > 0
        ? ` Review-summary IDs (\`PRR_…\` from \`## Review summaries\`) go into \`--minimize-comment-ids\`.`
        : "";

  instructions.push(
    `Run \`npx pr-shepherd resolve ${prNumber} [--resolve-thread-ids <ids>] [--minimize-comment-ids <ids>] [--dismiss-review-ids <ids> --message "<reason>"]\` with only the non-empty flag subsets. Skip the command entirely if all three ID lists are empty.${requireShaHint}${dismissNote}`,
  );

  instructions.push(
    `For any large decisions or rejections you made this iteration, add or update a \`## Shepherd Journal\` section in the PR description (\`gh pr edit ${prNumber} --body …\`) summarizing each decision. For threads and comments, use the markdown link shown in each item's bullet above; for reviews, reference the review ID.`,
  );

  instructions.push(
    `Report: echo the CLI's mutation output, then one line per Acknowledged item: \`Acknowledged <id> (@<author>): <reason>\`. If any fetched item was neither resolved nor acknowledged, stop and escalate: "<N> item(s) fetched but not acted on or acknowledged — need human direction before closing".`,
  );

  return instructions;
}
