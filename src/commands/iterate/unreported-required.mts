import type { IterateResult, IterateResultBase, ShepherdReport } from "../../types.mts";
import { buildPrShepherdCommand } from "../../cli/runner.mts";
import { formatPrUrl } from "../../pr-reference.mts";
import { readCiRetrigger, sameCiRetrigger, writeCiRetrigger } from "../../state/ci-retrigger.mts";
import { buildFixCompletionInstruction } from "./check-instructions.mts";
import { buildEscalateHumanMessage, buildEscalateSuggestion } from "./escalate.mts";
import { buildNativeStackRebaseInstruction } from "./native-stack-rebase.mts";

interface UnreportedPlan {
  escalate?: IterateResult;
  repairInstructions?: string[];
}

/** Rebase when the trunk or the PR base is behind; otherwise close and reopen once. */
function decideUnreportedRequired(input: {
  behind: boolean;
  alreadyRetriggered: boolean;
  otherAutonomousWork: boolean;
}): "none" | "escalate" | "reopen" | "rebase" {
  if (input.behind) return "rebase";
  if (input.alreadyRetriggered) return input.otherAutonomousWork ? "none" : "escalate";
  return "reopen";
}

function buildUnreportedRequiredInstruction(input: {
  names: readonly string[];
  repo: string;
  pr: number;
  baseBranch: string;
  behind: boolean;
  trunkBehindBy?: number;
  stackRebase?: string;
}): string {
  const listed = input.names.map((name) => `\`${name}\``).join(", ");
  const observed =
    input.trunkBehindBy !== undefined && input.trunkBehindBy > 0
      ? `The stack trunk compare is behind by ${input.trunkBehindBy}.`
      : input.behind
        ? "This PR's derived merge status is BEHIND."
        : "The stack trunk compare is not behind and this PR's derived merge status is not BEHIND.";
  const update = input.stackRebase
    ? `${input.stackRebase} Then push the rewritten stack with \`gh stack push\`.`
    : `Rebase or otherwise update the PR branch from \`${input.baseBranch}\` according to repository conventions, then push.`;
  return [
    `Required status checks have no check run and no status context on this head, and no Actions workflow is running: ${listed}.`,
    observed,
    `If the stack trunk is behind or this PR is behind its base, update the branch so a pull_request synchronize event runs: ${update}`,
    `Otherwise retrigger workflows once for this head with \`gh pr close ${input.pr} -R ${input.repo}\` then \`gh pr reopen ${input.pr} -R ${input.repo}\`.`,
    "Do not close the PR again if those checks are still missing on the next poll.",
  ].join(" ");
}

export async function planUnreportedRequired(input: {
  report: ShepherdReport;
  base: IterateResultBase;
  stateKey: { owner: string; repo: string; pr: number };
  headSha: string;
  otherAutonomousWork: boolean;
}): Promise<UnreportedPlan> {
  const names = input.report.unreportedRequiredChecks ?? [];
  const actionsRunning =
    input.report.actionsWorkflowInProgress === true || input.report.checks.inProgress.length > 0;
  const failing = input.report.checks.failing.length > 0;
  const conflicts = input.report.mergeStatus.status === "CONFLICTS";
  const inQueue = input.report.mergeQueue?.inQueue === true;
  if (names.length === 0 || actionsRunning || failing || conflicts || inQueue) return {};
  const behind =
    (input.report.trunkBehindBy ?? 0) > 0 || input.report.mergeStatus.status === "BEHIND";
  const decision = decideUnreportedRequired({
    behind,
    alreadyRetriggered: sameCiRetrigger(
      await readCiRetrigger(input.stateKey),
      input.headSha,
      names,
    ),
    otherAutonomousWork: input.otherAutonomousWork,
  });
  if (decision === "none") return {};
  if (decision === "escalate")
    return { escalate: escalateUnreported(input.base, input.report, names) };
  const rebase = stackRebase(input.report);
  const instruction = buildUnreportedRequiredInstruction({
    names,
    repo: input.report.repo,
    pr: input.report.pr,
    baseBranch: input.report.baseBranch,
    behind,
    ...(input.report.trunkBehindBy !== undefined && { trunkBehindBy: input.report.trunkBehindBy }),
    ...(rebase && { stackRebase: rebase }),
  });
  if (decision === "reopen") {
    await writeCiRetrigger(input.stateKey, { headSha: input.headSha, contexts: names });
  }
  return { repairInstructions: [instruction] };
}

export function buildUnreportedFixResult(
  base: IterateResultBase,
  report: ShepherdReport,
  instructions: string[],
): IterateResult {
  const prUrl = formatPrUrl(report.repo, report.pr);
  return {
    ...base,
    action: "fix_code",
    fix: {
      threads: [],
      resolutionOnlyThreads: [],
      actionableComments: [],
      reviewSummaryIds: [],
      firstLookSummaries: [],
      editedSummaries: [],
      surfacedApprovals: [],
      checks: [],
      changesRequestedReviews: [],
      resolveCommand: {
        argv: buildPrShepherdCommand(["apply", "review", prUrl]).argv,
        requiresHeadSha: false,
        requiresDismissMessage: false,
        hasMutations: false,
      },
      instructions: [...instructions, buildFixCompletionInstruction([])],
      inProgressRunIds: [],
      protectedRuns: [],
      firstLookThreads: [],
      firstLookComments: [],
    },
    cancelled: [],
  };
}

function stackRebase(report: ShepherdReport): string | undefined {
  const stack = report.mergeStatus.mergeRequirements?.stack;
  if (!stack) return undefined;
  const start =
    report.stackBottomPr !== undefined
      ? { bottomPr: report.stackBottomPr }
      : { trunk: stack.baseRefName };
  return buildNativeStackRebaseInstruction(report.repo, stack.number, start);
}

function escalateUnreported(
  base: IterateResultBase,
  report: ShepherdReport,
  names: readonly string[],
): IterateResult {
  const detail = names.map((name) => `\`${name}\``).join(", ");
  const escalateBase = {
    triggers: ["required-checks-unreported" as const],
    unresolvedThreads: [],
    ambiguousComments: [],
    changesRequestedReviews: [],
    suggestion: buildEscalateSuggestion(["required-checks-unreported"], detail),
  };
  return {
    ...base,
    action: "escalate",
    escalate: {
      ...escalateBase,
      humanMessage: buildEscalateHumanMessage(escalateBase, report.pr),
    },
  };
}
