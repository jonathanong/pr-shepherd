/* eslint-disable max-lines */
import { resolve } from "node:path";
import { createGithubTransportRunner, type GithubTransport } from "./github/transport.mts";
export type { GithubTransport } from "./github/transport.mts";

import {
  runApplyMerge,
  validateApplyMergeOptions,
  type ApplyMergeResult,
} from "./commands/apply-merge.mts";
import type { RestMergeAction, RestMergeStackGuard } from "./github/rest-merge.mts";
export type { RestMergeStackGuard } from "./github/rest-merge.mts";
import type { MergeMethod } from "./config/merge-method.mts";
import { runSuggestionPatches } from "./commands/suggestion-patches.mts";
import { runIterateTick, runPollSummaryTick } from "./commands/tick.mts";
import {
  applyCheckBlocker,
  type CheckBlockerCommandResult,
} from "./commands/apply-check-blocker.mts";
import { parseBlockedByRef } from "./commands/check-blocker-ref.mts";
import { runJournal, type JournalResult } from "./commands/journal/index.mts";
import { validateJournalItem } from "./commands/journal/transform.mts";
import {
  runMarkFilesAsViewed,
  type MarkFilesAsViewedResult,
} from "./commands/mark-files-as-viewed.mts";
import { runResolveMutate } from "./commands/resolve-mutate.mts";
import {
  applyQueueRemovalAck,
  type ApplyQueueRemovalResult,
} from "./commands/apply-queue-removal.mts";
import { runWithExecutionCwd } from "./execution-context.mts";
import {
  parsePrReference,
  normalizeRepositoryIdentity,
  resolveParsedPrTarget,
  type ParsedPrReference,
  type ResolvedPrTarget,
} from "./pr-reference.mts";
import type { ResolveResult } from "./comments/resolve.mts";
import type {
  SuggestResult,
  IterateCommandOptions,
  IterateResult,
  PollSummaryResult,
} from "./types.mts";
export type {
  CancelReason,
  IterateResult,
  IterateResultFixCode,
  IterateResultMerge,
  NextCheck,
  PollSummaryItem,
  PollSummaryResult,
  ShepherdAction,
  ShepherdMergeStatus,
  ShepherdStatus,
  StackNextAction,
  SuggestResult,
  SuggestionPatchResult,
} from "./types.mts";
export type { ApplyMergeResult } from "./commands/apply-merge.mts";
export type { MarkFilesAsViewedResult } from "./commands/mark-files-as-viewed.mts";
export type { ApplyQueueRemovalResult } from "./commands/apply-queue-removal.mts";
export type { CheckBlockerCommandResult } from "./commands/apply-check-blocker.mts";
export type { JournalResult } from "./commands/journal/index.mts";
export type { ResolveResult } from "./comments/resolve.mts";
export type { ShepherdJournalExtraction } from "./journal/index.mts";
import { getPullRequestBody, getRepoInfo } from "./github/client.mts";
import { getLocalHeadSha } from "./commands/suggestion-patch-git.mts";
import { extractShepherdJournal, type ShepherdJournalExtraction } from "./journal/index.mts";

export interface CreatePrShepherdOptions {
  /** GitHub transport retained for this client; individual calls may override it. */
  transport?: GithubTransport;
  /** Working directory used for git, config, and classification-rule lookups. */
  cwd?: string;
}

/** A positive PR number, GitHub pull-request URL, or owner/repo#number reference. */
export type PrReference = number | string;

type IterateOptions = Omit<
  IterateCommandOptions,
  | "format"
  | "prNumber"
  | "targetRepository"
  | "persistSeen"
  | "deferEditedCommentMarkers"
  | "fingerprintCache"
  | "stallDeadlineSink"
  | "deferQuotaWarning"
  | "quotaWarningMinimumPollIntervalMinutes"
>;

export type SingleIterateInput = IterateOptions & {
  pr?: PrReference;
  prs?: never;
};

/** One aggregate tick over several PRs from one repository. */
export type MultiIterateInput = IterateOptions & { prs: PrReference[]; pr?: never };

export type IterateInput = SingleIterateInput | MultiIterateInput;

/** One aggregate tick over the native stack containing `pr`. */
export type StackInput = IterateOptions & { pr: PrReference };

export interface ReviewMutationsOperation {
  type: "review_mutations";
  resolveThreadIds?: string[];
  replyThreadIds?: string[];
  minimizeCommentIds?: string[];
  dismissReviewIds?: string[];
  /** Required when replying to a thread or dismissing a review. */
  message?: string;
  /** `HEAD` (this checkout's commit) or a full SHA the PR head must match before mutating. */
  requireSha?: string;
}

export interface MarkFilesViewedOperation {
  /** Marks selected changed files as viewed. GitHub authorizes the requested mutation. */
  type: "mark_files_viewed";
  files?: string[];
  tests?: boolean;
  matchPatterns?: string[];
}

export interface AppendJournalOperation {
  type: "append_journal";
  item: string;
  dryRun?: boolean;
}

export interface AcknowledgeQueueRemovalOperation {
  type: "acknowledge_queue_removal";
  requireSha: string;
  queueCommitOid: string;
  removedAtUnix: number;
}

export interface CheckBlockerOperation {
  /** Record (`blockedBy`) or clear (`clear: true`) an external blocker for one failing check. */
  type: "check_blocker";
  check: string;
  /** PR/issue URL, `owner/repo#N`, or `issue:owner/repo#N`. */
  blockedBy?: string;
  clear?: boolean;
}

export interface MergeOperation {
  type: "merge";
  requireSha: string;
  mergeAction: RestMergeAction;
  mergeMethod?: MergeMethod;
  expectedStack?: RestMergeStackGuard;
}

/** Operations run in this exact list order after validation. */
export type ApplyOperation =
  | MergeOperation
  | ReviewMutationsOperation
  | MarkFilesViewedOperation
  | AppendJournalOperation
  | AcknowledgeQueueRemovalOperation
  | CheckBlockerOperation;

export interface ApplyInput {
  transport?: GithubTransport;
  /** PR shared by every operation in this ordered apply request. */
  pr?: PrReference;
  operations: ApplyOperation[];
}

export type ApplyOperationResult =
  | { type: "merge"; result: ApplyMergeResult }
  | { type: "review_mutations"; result: ResolveResult }
  | { type: "mark_files_viewed"; result: MarkFilesAsViewedResult }
  | { type: "append_journal"; result: JournalResult }
  | { type: "acknowledge_queue_removal"; result: ApplyQueueRemovalResult }
  | { type: "check_blocker"; result: CheckBlockerCommandResult };

export interface ApplyResult {
  operations: ApplyOperationResult[];
}

export interface SuggestionPatchInput {
  threadId: string;
  message: string;
  description?: string;
}

export interface SuggestInput {
  transport?: GithubTransport;
  pr?: PrReference;
  suggestions: SuggestionPatchInput[];
}

export interface GetJournalInput {
  transport?: GithubTransport;
  pr: PrReference;
}

export interface PrShepherd {
  iterate(input?: SingleIterateInput): Promise<IterateResult>;
  iterate(input: MultiIterateInput): Promise<PollSummaryResult>;
  iterate(input: IterateInput): Promise<IterateResult | PollSummaryResult>;
  stack(input: StackInput): Promise<PollSummaryResult>;
  apply(input: ApplyInput): Promise<ApplyResult>;
  suggest(input: SuggestInput): Promise<SuggestResult>;
  getJournal(input: GetJournalInput): Promise<ShepherdJournalExtraction>;
}

/** Raised before any API mutation when an input cannot be validated. */
export class PrShepherdValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrShepherdValidationError";
  }
}

/** Raised when a later ordered apply operation fails after earlier operations completed. */
export class PartialApplyError extends Error {
  readonly failedIndex: number;
  readonly completed: ApplyOperationResult[];

  constructor(failedIndex: number, completed: ApplyOperationResult[], cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(`apply operation ${failedIndex} failed: ${message}`, { cause });
    this.name = "PartialApplyError";
    this.failedIndex = failedIndex;
    this.completed = completed;
  }
}

/**
 * Creates the programmatic API. The returned object intentionally exposes only
 * read/plan (`iterate`, `stack`), ordered apply, and suggestion-patch (`suggest`) operations.
 */
export function createPrShepherd(options: CreatePrShepherdOptions = {}): PrShepherd {
  const cwd = options.cwd === undefined ? undefined : resolve(options.cwd);
  const transportRunner = createGithubTransportRunner(options.transport);
  function runInClient<T>(
    input: { transport?: GithubTransport },
    work: () => Promise<T>,
  ): Promise<T> {
    return runWithExecutionCwd(cwd, () => transportRunner(work, input?.transport));
  }

  function iterate(input?: SingleIterateInput): Promise<IterateResult>;
  function iterate(input: MultiIterateInput): Promise<PollSummaryResult>;
  function iterate(input: IterateInput): Promise<IterateResult | PollSummaryResult>;
  function iterate(input: IterateInput = {}): Promise<IterateResult | PollSummaryResult> {
    return runInClient(input, async () => {
      if ("pr" in input && "prs" in input) {
        throw new PrShepherdValidationError("iterate pr and prs selectors are mutually exclusive");
      }
      if ("prs" in input) {
        const { prs, pr: _pr, ...options } = input as MultiIterateInput;
        const { numbers, repository } = await resolveSameRepositoryRefs(prs, "iterate.prs");
        return runPollSummaryTick({ ...options, prNumbers: numbers, targetRepository: repository });
      }
      const { pr: _pr, prs: _prs, ...iterateOptions } = input;
      const target = resolvePrReference(input.pr);
      return runIterateTick({ ...iterateOptions, ...target, format: "json" });
    });
  }

  return Object.freeze({
    iterate,

    stack(input: StackInput) {
      return runInClient(input ?? {}, async () => {
        if (!input || input.pr === undefined) {
          throw new PrShepherdValidationError("stack requires a PR reference");
        }
        const { pr, ...options } = input;
        const { numbers, repository } = await resolveSameRepositoryRefs([pr], "stack.pr");
        return runPollSummaryTick({
          ...options,
          stackPrNumber: numbers[0],
          targetRepository: repository,
        });
      });
    },

    getJournal(input: GetJournalInput) {
      return runInClient(input, async () => {
        const { prNumber, targetRepository } = resolvePrReference(input.pr);
        if (!prNumber) throw new PrShepherdValidationError("getJournal requires a PR reference");
        const { owner, name } = targetRepository ?? (await getRepoInfo());
        const { body } = await getPullRequestBody(prNumber, owner, name);
        return extractShepherdJournal(body);
      });
    },

    apply(input: ApplyInput) {
      return runInClient(input, async () => {
        validateApplyInput(input);
        const { prNumber, targetRepository } = resolvePrReference(input.pr);
        const results: ApplyOperationResult[] = [];

        for (let index = 0; index < input.operations.length; index += 1) {
          const operation = input.operations[index]!;
          try {
            switch (operation.type) {
              case "merge": {
                const result = await runApplyMerge({
                  prNumber,
                  targetRepository,
                  requireSha: operation.requireSha,
                  mergeAction: operation.mergeAction,
                  mergeMethod: operation.mergeMethod,
                  expectedStack: operation.expectedStack,
                });
                results.push({ type: operation.type, result });
                break;
              }
              case "review_mutations": {
                const { type: _type, message, ...options } = operation;
                const result = await runResolveMutate({
                  ...options,
                  // `HEAD` names this checkout's commit, the same form the printed CLI command uses.
                  requireSha:
                    options.requireSha === "HEAD" ? await getLocalHeadSha() : options.requireSha,
                  prNumber,
                  targetRepository,
                  dismissMessage: message,
                  format: "json",
                });
                results.push({ type: operation.type, result });
                if (result.sessionRefusal) return { operations: results };
                break;
              }
              case "mark_files_viewed": {
                const result = await runMarkFilesAsViewed({
                  prNumber,
                  targetRepository,
                  files: operation.files ?? [],
                  tests: operation.tests,
                  matchPatterns: operation.matchPatterns,
                  format: "json",
                });
                results.push({ type: operation.type, result });
                break;
              }
              case "append_journal": {
                const result = await runJournal({
                  prNumber,
                  targetRepository,
                  rawItem: operation.item,
                  dryRun: operation.dryRun ?? false,
                });
                results.push({ type: operation.type, result });
                break;
              }
              case "check_blocker": {
                const result = await applyCheckBlocker({
                  prNumber,
                  targetRepository,
                  checkName: operation.check,
                  ...(operation.clear
                    ? { clear: true as const }
                    : { blocker: parseBlockedByRef(operation.blockedBy!)! }),
                });
                results.push({ type: operation.type, result });
                break;
              }
              case "acknowledge_queue_removal": {
                const result = await applyQueueRemovalAck({
                  prNumber,
                  targetRepository,
                  headSha: operation.requireSha,
                  queueCommitOid: operation.queueCommitOid,
                  removedAtUnix: operation.removedAtUnix,
                });
                results.push({ type: operation.type, result });
                break;
              }
            }
          } catch (error) {
            if (results.length === 0) throw error;
            throw new PartialApplyError(index, results, error);
          }
        }
        return { operations: results };
      });
    },

    suggest(input: SuggestInput) {
      validateSuggestInput(input);
      const { pr: _pr, ...options } = input;
      return runInClient(input, async () => {
        const target = resolvePrReference(input.pr);
        return runSuggestionPatches({ ...options, ...target, format: "json" });
      });
    },
  });
}

async function resolveSameRepositoryRefs(
  refs: PrReference[] | undefined,
  label: string,
): Promise<{ numbers: number[]; repository: { owner: string; name: string } }> {
  if (!Array.isArray(refs) || refs.length === 0) {
    throw new PrShepherdValidationError(`${label} must contain at least one PR reference`);
  }
  const parsedRefs = refs.map((ref) => {
    const parsed = parsePrReference(ref);
    const prNumber = parsed?.number;
    if (!parsed || !prNumber) {
      throw new PrShepherdValidationError(`Invalid PR reference: ${String(ref)}`);
    }
    return { parsed, prNumber };
  });
  const checkout = parsedRefs.some(({ parsed }) => parsed?.repository === undefined)
    ? await getRepoInfo()
    : undefined;
  let repository: { owner: string; name: string } | undefined;
  const numbers: number[] = [];
  for (const { parsed, prNumber } of parsedRefs) {
    const target = resolveParsedPrTarget(parsed);
    const nextRepository = target.targetRepository ?? checkout!;
    if (
      repository &&
      normalizeRepositoryIdentity(`${repository.owner}/${repository.name}`) !==
        normalizeRepositoryIdentity(`${nextRepository.owner}/${nextRepository.name}`)
    ) {
      throw new PrShepherdValidationError(
        "aggregate iterate only supports PRs from one repository",
      );
    }
    repository = nextRepository;
    if (!numbers.includes(prNumber)) numbers.push(prNumber);
  }
  return { numbers, repository: repository! };
}

function validateApplyInput(input: ApplyInput): void {
  if (!input || !Array.isArray(input.operations) || input.operations.length === 0) {
    throw new PrShepherdValidationError("apply requires a non-empty operations array");
  }
  const parsed = validatePrReference(input.pr);
  for (const operation of input.operations) {
    validateOperation(operation);
    if (
      operation.type === "merge" &&
      operation.expectedStack !== undefined &&
      parsed.number !== undefined &&
      operation.expectedStack.prefix.at(-1)?.pr !== parsed.number
    )
      throw new PrShepherdValidationError("expectedStack prefix must end at the requested PR");
  }
}

function validateOperation(operation: ApplyOperation): void {
  if (!operation || typeof operation !== "object") {
    throw new PrShepherdValidationError("apply operation must be an object");
  }

  switch (operation.type) {
    case "merge":
      try {
        validateApplyMergeOptions(operation);
      } catch (error) {
        throw new PrShepherdValidationError(error instanceof Error ? error.message : String(error));
      }
      return;
    case "review_mutations":
      validateReviewMutations(operation);
      return;
    case "mark_files_viewed":
      validateMarkFilesViewed(operation);
      return;
    case "append_journal":
      if (typeof operation.item !== "string") {
        throw new PrShepherdValidationError("append_journal.item must be a string");
      }
      if (operation.dryRun !== undefined && typeof operation.dryRun !== "boolean") {
        throw new PrShepherdValidationError("append_journal.dryRun must be a boolean");
      }
      {
        const validation = validateJournalItem(operation.item);
        if (!validation.ok) throw new PrShepherdValidationError(validation.error);
      }
      return;
    case "check_blocker":
      if (typeof operation.check !== "string" || operation.check === "") {
        throw new PrShepherdValidationError("check_blocker.check must be the exact check name");
      }
      if (operation.clear !== undefined && typeof operation.clear !== "boolean") {
        throw new PrShepherdValidationError("check_blocker.clear must be a boolean");
      }
      if (operation.clear === true && operation.blockedBy !== undefined) {
        throw new PrShepherdValidationError(
          "check_blocker takes either blockedBy or clear, not both",
        );
      }
      if (
        operation.clear !== true &&
        (typeof operation.blockedBy !== "string" || !parseBlockedByRef(operation.blockedBy))
      ) {
        throw new PrShepherdValidationError(
          "check_blocker.blockedBy must be a PR/issue URL, owner/repo#N, or issue:owner/repo#N",
        );
      }
      return;
    case "acknowledge_queue_removal":
      if (
        typeof operation.requireSha !== "string" ||
        !/^[0-9a-f]{40}$/.test(operation.requireSha)
      ) {
        throw new PrShepherdValidationError(
          "acknowledge_queue_removal.requireSha must be a full 40-character lowercase hex SHA",
        );
      }
      if (
        typeof operation.queueCommitOid !== "string" ||
        !/^[0-9a-f]{40}$/.test(operation.queueCommitOid)
      ) {
        throw new PrShepherdValidationError(
          "acknowledge_queue_removal.queueCommitOid must be a full 40-character lowercase hex SHA",
        );
      }
      if (!Number.isSafeInteger(operation.removedAtUnix) || operation.removedAtUnix <= 0) {
        throw new PrShepherdValidationError(
          "acknowledge_queue_removal.removedAtUnix must be a positive Unix timestamp in seconds",
        );
      }
      return;
    default:
      throw new PrShepherdValidationError(
        `Unsupported apply operation: ${JSON.stringify((operation as { type?: unknown }).type)}`,
      );
  }
}

function validateReviewMutations(operation: ReviewMutationsOperation): void {
  const ids = [
    operation.resolveThreadIds,
    operation.replyThreadIds,
    operation.minimizeCommentIds,
    operation.dismissReviewIds,
  ];
  if (!ids.some((value) => value !== undefined && value.length > 0)) {
    throw new PrShepherdValidationError("review_mutations requires at least one mutation ID");
  }
  for (const value of ids) validateStringArray(value, "review mutation IDs");
  const needsMessage =
    (operation.replyThreadIds?.length ?? 0) > 0 || (operation.dismissReviewIds?.length ?? 0) > 0;
  if (needsMessage && (!operation.message || operation.message.trim() === "")) {
    throw new PrShepherdValidationError(
      "review_mutations.message is required for replies or review dismissals",
    );
  }
  if (operation.message !== undefined && typeof operation.message !== "string") {
    throw new PrShepherdValidationError("review_mutations.message must be a string");
  }
  if (
    operation.requireSha !== undefined &&
    operation.requireSha !== "HEAD" &&
    !/^[0-9a-f]{40}$/.test(operation.requireSha)
  ) {
    throw new PrShepherdValidationError(
      "review_mutations.requireSha must be HEAD or a full 40-character lowercase hex SHA",
    );
  }
}

function validateMarkFilesViewed(operation: MarkFilesViewedOperation): void {
  validateStringArray(operation.files, "mark_files_viewed.files");
  validateStringArray(operation.matchPatterns, "mark_files_viewed.matchPatterns");
  if (operation.tests !== undefined && typeof operation.tests !== "boolean") {
    throw new PrShepherdValidationError("mark_files_viewed.tests must be a boolean");
  }
  if (
    (operation.files?.length ?? 0) === 0 &&
    (operation.matchPatterns?.length ?? 0) === 0 &&
    operation.tests !== true
  ) {
    throw new PrShepherdValidationError(
      "mark_files_viewed requires files, matchPatterns, or tests: true",
    );
  }
  for (const pattern of operation.matchPatterns ?? []) {
    try {
      new RegExp(pattern, "i");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new PrShepherdValidationError(
        `Invalid mark_files_viewed match pattern ${JSON.stringify(pattern)}: ${message}`,
      );
    }
  }
}

function validateSuggestInput(input: SuggestInput): void {
  if (!input || !Array.isArray(input.suggestions) || input.suggestions.length === 0) {
    throw new PrShepherdValidationError("suggest.suggestions must be a non-empty array");
  }
  const seen = new Set<string>();
  for (const suggestion of input.suggestions) {
    if (
      !suggestion ||
      typeof suggestion.threadId !== "string" ||
      suggestion.threadId.trim() === ""
    ) {
      throw new PrShepherdValidationError("each suggestion.threadId is required");
    }
    if (typeof suggestion.message !== "string" || suggestion.message.trim() === "") {
      throw new PrShepherdValidationError("each suggestion.message must be non-empty");
    }
    if (suggestion.description !== undefined && typeof suggestion.description !== "string") {
      throw new PrShepherdValidationError("each suggestion.description must be a string");
    }
    if (seen.has(suggestion.threadId)) {
      throw new PrShepherdValidationError(`duplicate suggestion thread ID: ${suggestion.threadId}`);
    }
    seen.add(suggestion.threadId);
  }
  validatePrReference(input.pr);
}

function validatePrReference(pr: PrReference | undefined): ParsedPrReference {
  const parsed = parsePrReference(pr);
  if (parsed !== null) return parsed;
  throw new PrShepherdValidationError(
    "pr must be a positive number, a GitHub pull-request URL, or owner/repo#number",
  );
}

function resolvePrReference(pr: PrReference | undefined): ResolvedPrTarget {
  const parsed = validatePrReference(pr);
  return resolveParsedPrTarget(parsed);
}

function validateStringArray(value: string[] | undefined, label: string): void {
  if (
    value !== undefined &&
    (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item === ""))
  ) {
    throw new PrShepherdValidationError(`${label} must be an array of non-empty strings`);
  }
}
