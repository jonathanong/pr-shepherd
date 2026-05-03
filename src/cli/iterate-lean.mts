import type { IterateResult } from "../types.mts";
import type { AgentRuntime } from "../agent-runtime.mts";
import {
  adaptIterateLog,
  adaptFixCodeInstructions,
  buildSimpleIterateInstructions,
} from "./iterate-instructions.mts";
import type { CliRunner } from "./runner.mts";
interface IterateProjectionOptions {
  runtime?: AgentRuntime;
  readyDelaySuffix?: string;
  retryInterval?: string;
  runner?: CliRunner;
}

/**
 * Project an IterateResult to a lean JSON shape for the default (non-verbose) output.
 * Omits fields that are the trivial default (false, 0, empty) or state-gated fields
 * outside the state where they are meaningful.
 */
export function projectIterateLean(
  result: IterateResult,
  opts?: IterateProjectionOptions,
): unknown {
  const runtime = opts?.runtime ?? "claude";
  const readyDelaySuffix = opts?.readyDelaySuffix;
  const retryInterval = opts?.retryInterval;
  const runner = opts?.runner;
  const simpleInstructions = (r: Exclude<IterateResult, { action: "fix_code" }>) =>
    buildSimpleIterateInstructions(r, runtime, readyDelaySuffix, retryInterval, runner);
  const base: Record<string, unknown> = {
    action: result.action,
    pr: result.pr,
    repo: result.repo || undefined,
    status: result.status,
    state: result.state,
    mergeStateStatus: result.mergeStateStatus,
    ...(result.mergeStatus === "BLOCKED" &&
      result.reviewDecision !== null && { reviewDecision: result.reviewDecision }),
    ...(result.copilotReviewInProgress && { copilotReviewInProgress: true }),
    ...(result.isDraft && { isDraft: true }),
    summary: {
      passing: result.summary.passing,
      ...(result.summary.skipped > 0 && { skipped: result.summary.skipped }),
      ...(result.summary.filtered > 0 && { filtered: result.summary.filtered }),
      ...(result.summary.inProgress > 0 && { inProgress: result.summary.inProgress }),
    },
    // remainingSeconds: only when the ready-delay timer is actively counting down
    ...(result.status === "READY" &&
      result.remainingSeconds > 0 && {
        remainingSeconds: result.remainingSeconds,
      }),
    ...(result.baseBranch && { baseBranch: result.baseBranch }),
  };

  switch (result.action) {
    case "cooldown":
      return {
        ...base,
        log: adaptIterateLog(result.log, runtime),
        instructions: simpleInstructions(result),
      };
    case "wait":
      return {
        ...base,
        log: adaptIterateLog(result.log, runtime),
        instructions: simpleInstructions(result),
      };
    case "cancel":
      return {
        ...base,
        reason: result.reason,
        log: adaptIterateLog(result.log, runtime),
        instructions: simpleInstructions(result),
      };
    case "mark_ready":
      // drop markedReady — always true, redundant with action discriminator
      return {
        ...base,
        log: adaptIterateLog(result.log, runtime),
        instructions: simpleInstructions(result),
      };
    case "fix_code":
      return {
        ...base,
        ...(result.checks.length > 0 && { checks: result.checks }),
        ...(result.cancelled.length > 0 && { cancelled: result.cancelled }),
        fix: {
          mode: result.fix.mode,
          ...(result.fix.threads.length > 0 && { threads: result.fix.threads }),
          ...(result.fix.resolutionOnlyThreads.length > 0 && {
            resolutionOnlyThreads: result.fix.resolutionOnlyThreads,
          }),
          ...(result.fix.actionableComments.length > 0 && {
            actionableComments: result.fix.actionableComments,
          }),
          ...(result.fix.reviewSummaryIds.length > 0 && {
            reviewSummaryIds: result.fix.reviewSummaryIds,
          }),
          ...(result.fix.firstLookSummaries.length > 0 && {
            firstLookSummaries: result.fix.firstLookSummaries,
          }),
          ...(result.fix.editedSummaries.length > 0 && {
            editedSummaries: result.fix.editedSummaries,
          }),
          ...(result.fix.surfacedApprovals.length > 0 && {
            surfacedApprovals: result.fix.surfacedApprovals,
          }),
          ...(result.fix.firstLookThreads.length > 0 && {
            firstLookThreads: result.fix.firstLookThreads,
          }),
          ...(result.fix.firstLookComments.length > 0 && {
            firstLookComments: result.fix.firstLookComments,
          }),
          ...(result.fix.inProgressRunIds.length > 0 && {
            inProgressRunIds: result.fix.inProgressRunIds,
          }),
          ...(result.fix.checks.length > 0 && { checks: result.fix.checks }),
          ...(result.fix.changesRequestedReviews.length > 0 && {
            changesRequestedReviews: result.fix.changesRequestedReviews,
          }),
          resolveCommand: result.fix.resolveCommand,
          ...(result.fix.instructions.length > 0 && {
            instructions: adaptFixCodeInstructions(
              result.fix.instructions,
              result.pr,
              runtime,
              readyDelaySuffix,
              retryInterval,
              runner,
            ),
          }),
        },
      };
    case "escalate":
      return {
        ...base,
        escalate: {
          ...(result.escalate.triggers.length > 0 && { triggers: result.escalate.triggers }),
          ...(result.escalate.unresolvedThreads.length > 0 && {
            unresolvedThreads: result.escalate.unresolvedThreads,
          }),
          ...(result.escalate.ambiguousComments.length > 0 && {
            ambiguousComments: result.escalate.ambiguousComments,
          }),
          ...(result.escalate.changesRequestedReviews.length > 0 && {
            changesRequestedReviews: result.escalate.changesRequestedReviews,
          }),
          ...(result.escalate.attemptHistory &&
            result.escalate.attemptHistory.length > 0 && {
              attemptHistory: result.escalate.attemptHistory,
            }),
          suggestion: result.escalate.suggestion,
          humanMessage: result.escalate.humanMessage,
        },
        instructions: simpleInstructions(result),
      };
  }
}

export function projectIterateVerbose(
  result: IterateResult,
  opts?: IterateProjectionOptions,
): unknown {
  const runtime = opts?.runtime ?? "claude";
  const readyDelaySuffix = opts?.readyDelaySuffix;
  const retryInterval = opts?.retryInterval;
  const runner = opts?.runner;
  if (result.action === "fix_code") {
    return {
      ...result,
      fix: {
        ...result.fix,
        instructions: adaptFixCodeInstructions(
          result.fix.instructions,
          result.pr,
          runtime,
          readyDelaySuffix,
          retryInterval,
          runner,
        ),
      },
    };
  }
  const log =
    "log" in result && typeof result.log === "string"
      ? { log: adaptIterateLog(result.log, runtime) }
      : {};
  return {
    ...result,
    ...log,
    instructions: buildSimpleIterateInstructions(
      result,
      runtime,
      readyDelaySuffix,
      retryInterval,
      runner,
    ),
  };
}
