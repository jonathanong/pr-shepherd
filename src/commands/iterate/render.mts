import type {
  AgentThread,
  AgentComment,
  AgentCheck,
  Review,
  ResolveCommand,
  FirstLookThread,
  FirstLookComment,
  ReviewThread,
} from "../../types.mts";
import { renderShellCommand, type CliRunner } from "../../cli/runner.mts";
import { buildFailingCheckInstructions } from "./check-instructions.mts";
import {
  SHEPHERD_JOURNAL_FIRST_LOOK_GUIDANCE,
  SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEM_HEADINGS,
  buildShepherdJournalInstruction,
} from "../shepherd-journal.mts";
import { buildCommitSuggestionInstruction } from "../commit-suggestion-instruction.mts";

export const FIX_INSTRUCTION_STOP =
  "Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick.";

/**
 * Render a resolve command as a shell snippet. Wraps `$DISMISS_MESSAGE`, `$HEAD_SHA`, and
 * whitespace-bearing argv entries for placeholder substitution. `$HEAD_SHA` is never in `argv` —
 * `renderResolveCommand` appends `--require-sha "$HEAD_SHA"` when `requiresHeadSha` is set.
 */
export function renderResolveCommand(rc: ResolveCommand): string {
  const parts = [...rc.argv];
  if (rc.requiresHeadSha) {
    parts.push("--require-sha", "$HEAD_SHA");
  }
  return renderShellCommand(parts);
}

export function buildFixInstructions(
  threads: AgentThread[],
  actionableComments: AgentComment[],
  checks: AgentCheck[],
  changesRequestedReviews: Review[],
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
  resolutionOnlyThreads: ReviewThread[] = [],
  runner?: CliRunner,
): string[] {
  const instructions: string[] = [];

  const hasNonConflictHints =
    threads.length > 0 ||
    checks.length > 0 ||
    changesRequestedReviews.length > 0 ||
    actionableComments.length > 0;

  // Leading decision or mandatory instruction depending on what actionable items exist.
  if (hasNonConflictHints) {
    const actionableSections: string[] = [];
    if (threads.length > 0) actionableSections.push("`## Review threads`");
    if (actionableComments.length > 0) actionableSections.push("`## Actionable comments`");
    if (checks.length > 0) actionableSections.push("`## Failing checks`");
    if (changesRequestedReviews.length > 0)
      actionableSections.push("`## Changes-requested reviews`");
    const sectionRef =
      actionableSections.length > 0 ? `under ${actionableSections.join(", ")}` : "above";
    const resolveClause = resolveCommand.hasMutations ? ", then run the `resolve:` command" : "";
    if (hasConflicts) {
      // Conflicts make push mandatory regardless of whether code edits are needed.
      instructions.push(
        `The branch has merge conflicts that require rebase before merging. Apply any code edits for items ${sectionRef}, commit if edits were made, rebase onto \`origin/${baseBranch}\` per your repository's conventions, push${resolveClause}.`,
      );
    } else {
      const skipClause = resolveCommand.hasMutations
        ? "skip cancellation/commit/push and run the `resolve:` command"
        : "no push is needed";
      instructions.push(
        `Decide for each item ${sectionRef} whether a code change is warranted. **If any code changes are needed:** cancel in-progress runs first, apply edits, commit, rebase, push${resolveClause}. **If no code changes are needed:** ${skipClause}.`,
      );
    }
  } else if (hasConflicts) {
    instructions.push(
      `The branch has merge conflicts — rebase onto \`origin/${baseBranch}\` per your repository's conventions to resolve them, then push.`,
    );
  }

  if (inProgressRunIds.length > 0) {
    instructions.push(
      `If you decide to push new commits: cancel each in-progress run listed under \`## In-progress runs\` before applying code fixes (e.g. \`gh run cancel <id>\`). Runs may complete between the tick and your action; treat cancellation errors on already-finished runs as non-fatal. Skip this step if you are only resolving threads without pushing — the existing runs remain relevant.`,
    );
  }

  const hasSuggestions = threads.some((t) => t.suggestion);
  if (hasSuggestions) {
    instructions.push(
      buildCommitSuggestionInstruction(prNumber, "## Review threads", false, runner),
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

  if (resolutionOnlyThreads.length > 0) {
    instructions.push(
      `Resolve the threads under \`## Review threads to resolve\` with the \`resolve:\` command shown below. These threads are already outdated or minimized, so no code edit is required for them unless their body reveals separate work you choose to do.`,
    );
  }

  instructions.push(...buildFailingCheckInstructions(checks));

  if (changesRequestedReviews.length > 0) {
    instructions.push(
      `For each bullet under \`## Changes-requested reviews\` above: read the review body and apply the requested changes.`,
    );
  }

  if (hasNonConflictHints) {
    instructions.push(
      `If you applied code edits: commit them with a descriptive message, then rebase onto \`origin/${baseBranch}\` per your repository's conventions before pushing.`,
    );
  }

  if (resolveCommand.hasMutations) {
    const substituteParts: string[] = [];
    if (resolveCommand.requiresHeadSha) {
      substituteParts.push(
        `\`$HEAD_SHA\` with the pushed commit SHA (or \`$(git rev-parse HEAD)\` if you did not push)`,
      );
    }
    if (resolveCommand.requiresDismissMessage) {
      substituteParts.push(
        `\`$DISMISS_MESSAGE\` with a one-sentence description of what you changed`,
      );
    }
    const substituteHint =
      substituteParts.length > 0 ? `, substituting ${substituteParts.join(" and ")}` : "";
    instructions.push(`Run the \`resolve:\` command shown above${substituteHint}.`);
  }

  if (cancelledCount > 0) {
    instructions.push(
      `Do not re-run \`gh run cancel\` on the IDs listed under \`## Cancelled runs\` — those runs were already cancelled by the CLI before this turn.`,
    );
  }

  const firstLookTotal = firstLookThreads.length + firstLookComments.length;
  if (firstLookTotal > 0) {
    instructions.push(
      `Items in \`## First-look items\` are shown so you can acknowledge their current status before acting. If a first-look thread also appears under \`## Review threads to resolve\`, its ID is already included in the \`resolve:\` command; otherwise do not pass first-look-only IDs to mutation flags.`,
    );
  }
  if (firstLookSummaries.length > 0) {
    instructions.push(SHEPHERD_JOURNAL_FIRST_LOOK_GUIDANCE);
  }
  const editedTotal =
    editedSummaries.length +
    firstLookThreads.filter((t) => t.edited).length +
    firstLookComments.filter((c) => c.edited).length;
  if (editedTotal > 0) {
    instructions.push(
      `Items under \`## Review summaries (edited since first look)\` and any first-look bullet tagged \`, edited\` were updated by their author after you previously acknowledged them. Read the updated body before deciding whether any matching \`## Review threads to resolve\` item should be resolved.`,
    );
  }

  if (resolveCommand.hasMutations) {
    instructions.push(
      buildShepherdJournalInstruction(
        prNumber,
        SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEM_HEADINGS,
      ),
    );
  }

  instructions.push(FIX_INSTRUCTION_STOP);

  return instructions;
}
