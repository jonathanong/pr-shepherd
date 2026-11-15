import type { IterateResult, IterateResultBase, ShepherdReport } from "../../types.mts";
import { buildPrShepherdCommand } from "../../cli/runner.mts";
import { formatPrUrl } from "../../pr-reference.mts";
import { readCiRetrigger, sameCiRetrigger, writeCiRetrigger } from "../../state/ci-retrigger.mts";
import { buildFixCompletionInstruction } from "./check-instructions.mts";
import { buildEscalateHumanMessage, buildEscalateSuggestion } from "./escalate.mts";
import { buildNativeStackRebaseInstruction } from "./native-stack-rebase.mts";
import { playbookPointer } from "../playbook-pointer.mts";
import { getGithubTransport } from "../../github/transport.mts";

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

function listedChecks(names: readonly string[]): string {
  return names.map((name) => `\`${name}\``).join(", ");
}

/** Facts, then rebase-and-push, then investigate or escalate if that push does not start CI. */
function buildUnreportedRequiredInstructions(input: {
  names: readonly string[];
  headSha: string;
  repo: string;
  pr: number;
  baseBranch: string;
  behind: boolean;
  behindBy: number;
  trunk: boolean;
  stackRebase?: string;
}): string[] {
  const names = listedChecks(input.names);
  const gap =
    input.behindBy > 0 && input.trunk
      ? `The stack trunk is behind by ${input.behindBy} commits.`
      : input.behindBy > 0
        ? `This branch is behind \`${input.baseBranch}\` by ${input.behindBy} commits.`
        : input.behind
          ? "This PR's derived merge status is BEHIND."
          : `This branch is not behind \`${input.baseBranch}\`.`;
  const facts = `${gap} No CI checks are running on head \`${input.headSha.slice(0, 7)}\`, and required checks have not passed: ${names}.`;
  const playbook = playbookPointer("Required checks unreported");
  if (!input.behind) {
    const retrigger =
      getGithubTransport() === "rest"
        ? `run \`gh api --method PATCH repos/${input.repo}/pulls/${input.pr} -f state=closed\`, then run \`gh api --method PATCH repos/${input.repo}/pulls/${input.pr} -f state=open\``
        : `run \`gh pr close ${input.pr} -R ${input.repo}\` then \`gh pr reopen ${input.pr} -R ${input.repo}\``;
    return [
      facts,
      `Shepherd cannot tell from GitHub's data why nothing started. Find out before acting. ${playbook}`,
      `If the cause is within this PR, fix it and push. If the workflows should have run and the PR is fine, retrigger once: ${retrigger}. Otherwise make no change and keep what you found. If the checks are still missing on the next poll, Shepherd escalates with \`required-checks-unreported\`; report that diagnosis then.`,
    ];
  }
  const rebase = input.stackRebase
    ? `${input.stackRebase} Then push the rewritten stack${getGithubTransport() === "rest" ? " using the repository's stack-update procedure" : " with `gh stack push`"}.`
    : `Rebase onto \`${input.baseBranch}\` and push.`;
  return [
    facts,
    `${rebase} Rebase and push is how these checks start.`,
    `If that push does not start the checks, find out why nothing started. ${playbook} Shepherd escalates with \`required-checks-unreported\` when the branch is current and this remains the only blocker.`,
  ];
}

export async function planUnreportedRequired(input: {
  report: ShepherdReport;
  base: IterateResultBase;
  stateKey: { owner: string; repo: string; pr: number };
  headSha: string;
  otherAutonomousWork: boolean;
  /** Internal preview ticks must not consume the one-time reopen opportunity. */
  persistState?: boolean;
}): Promise<UnreportedPlan> {
  const names = input.report.unreportedRequiredChecks ?? [];
  const actionsRunning =
    input.report.actionsWorkflowInProgress === true || input.report.checks.inProgress.length > 0;
  const failing = input.report.checks.failing.length > 0;
  const conflicts = input.report.mergeStatus.status === "CONFLICTS";
  const inQueue = input.report.mergeQueue?.inQueue === true;
  if (names.length === 0 || actionsRunning || failing || conflicts || inQueue) return {};
  const behindBy = input.report.trunkBehindBy ?? input.report.baseBehindBy ?? 0;
  const behind = behindBy > 0 || input.report.mergeStatus.status === "BEHIND";
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
  const instructions = buildUnreportedRequiredInstructions({
    names,
    headSha: input.headSha,
    repo: input.report.repo,
    pr: input.report.pr,
    baseBranch: input.report.baseBranch,
    behind,
    behindBy,
    trunk: (input.report.trunkBehindBy ?? 0) > 0,
    ...(rebase && { stackRebase: rebase }),
  });
  if (decision === "reopen" && input.persistState !== false) {
    await writeCiRetrigger(input.stateKey, { headSha: input.headSha, contexts: names });
  }
  return { repairInstructions: instructions };
}

export function buildUnreportedFixResult(
  base: IterateResultBase,
  report: ShepherdReport,
  instructions: string[],
): IterateResult {
  const prUrl = formatPrUrl(report.repo, report.pr);
  return {
    ...base,
    action: "triage",
    triage: {
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
      instructions: [...instructions, buildFixCompletionInstruction()],
      firstLookThreads: [],
      firstLookComments: [],
    },
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
