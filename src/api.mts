/* eslint-disable max-lines */
import { resolve } from "node:path";

import { runCommitSuggestion } from "./commands/commit-suggestion.mts";
import { runSuggestionPatches } from "./commands/suggestion-patches.mts";
import { runIterate } from "./commands/iterate/index.mts";
import { runJournal, type JournalResult } from "./commands/journal/index.mts";
import { validateJournalItem } from "./commands/journal/transform.mts";
import {
  runMarkFilesAsViewed,
  type MarkFilesAsViewedResult,
} from "./commands/mark-files-as-viewed.mts";
import { runResolveMutate } from "./commands/resolve-mutate.mts";
import { runWithExecutionCwd } from "./execution-context.mts";
import {
  parsePrReference,
  resolveParsedPrTarget,
  type ParsedPrReference,
  type ResolvedPrTarget,
} from "./pr-reference.mts";
import type { ResolveResult } from "./comments/resolve.mts";
import type {
  BuildSuggestionPatchesResult,
  CommitSuggestionResult,
  IterateCommandOptions,
  IterateResult,
} from "./types.mts";

export interface CreatePrShepherdOptions {
  /** Working directory used for git, config, and classification-rule lookups. */
  cwd?: string;
}

/** A positive PR number, GitHub pull-request URL, or owner/repo#number reference. */
export type PrReference = number | string;

export type IterateInput = Omit<
  IterateCommandOptions,
  "format" | "prNumber" | "targetRepository"
> & {
  pr?: PrReference;
};

export interface ReviewMutationsOperation {
  type: "review_mutations";
  resolveThreadIds?: string[];
  replyThreadIds?: string[];
  minimizeCommentIds?: string[];
  dismissReviewIds?: string[];
  /** Required when replying to a thread or dismissing a review. */
  message?: string;
  requireSha?: string;
}

export interface MarkFilesViewedOperation {
  /** Compatibility-named selection only; always skips mutation because authorization is unverifiable. */
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

/** Operations run in this exact list order after validation; file-view selection is non-mutating. */
export type ApplyOperation =
  | ReviewMutationsOperation
  | MarkFilesViewedOperation
  | AppendJournalOperation;

export interface ApplyInput {
  /** PR shared by every operation in this ordered apply request. */
  pr?: PrReference;
  operations: ApplyOperation[];
}

export type ApplyOperationResult =
  | { type: "review_mutations"; result: ResolveResult }
  | { type: "mark_files_viewed"; result: MarkFilesAsViewedResult }
  | { type: "append_journal"; result: JournalResult };

export interface ApplyResult {
  operations: ApplyOperationResult[];
}

export interface BuildSuggestionPatchInput {
  pr?: PrReference;
  threadId: string;
  message: string;
  description?: string;
}

export interface SuggestionPatchInput {
  threadId: string;
  message: string;
  description?: string;
}

export interface BuildSuggestionPatchesInput {
  pr?: PrReference;
  suggestions: SuggestionPatchInput[];
}

export interface PrShepherd {
  iterate(input?: IterateInput): Promise<IterateResult>;
  apply(input: ApplyInput): Promise<ApplyResult>;
  buildSuggestionPatches(input: BuildSuggestionPatchesInput): Promise<BuildSuggestionPatchesResult>;
  /** Compatibility adapter; prefer buildSuggestionPatches. */
  buildSuggestionPatch(input: BuildSuggestionPatchInput): Promise<CommitSuggestionResult>;
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
 * read/plan, ordered apply, and suggestion-patch operations.
 */
export function createPrShepherd(options: CreatePrShepherdOptions = {}): PrShepherd {
  const cwd = options.cwd === undefined ? undefined : resolve(options.cwd);

  return Object.freeze({
    iterate(input: IterateInput = {}) {
      const { pr: _pr, ...options } = input;
      return runWithExecutionCwd(cwd, async () => {
        const target = resolvePrReference(input.pr);
        return runIterate({ ...options, ...target, format: "json" });
      });
    },

    apply(input: ApplyInput) {
      return runWithExecutionCwd(cwd, async () => {
        validateApplyInput(input);
        const { prNumber, targetRepository } = resolvePrReference(input.pr);
        const results: ApplyOperationResult[] = [];

        for (let index = 0; index < input.operations.length; index += 1) {
          const operation = input.operations[index]!;
          try {
            switch (operation.type) {
              case "review_mutations": {
                const { type: _type, message, ...options } = operation;
                const result = await runResolveMutate({
                  ...options,
                  prNumber,
                  targetRepository,
                  dismissMessage: message,
                  format: "json",
                });
                results.push({ type: operation.type, result });
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
            }
          } catch (error) {
            if (results.length === 0) throw error;
            throw new PartialApplyError(index, results, error);
          }
        }
        return { operations: results };
      });
    },

    buildSuggestionPatch(input: BuildSuggestionPatchInput) {
      validateSuggestionPatchInput(input);
      const { pr: _pr, ...options } = input;
      return runWithExecutionCwd(cwd, async () => {
        const target = resolvePrReference(input.pr);
        return runCommitSuggestion({ ...options, ...target, format: "json" });
      });
    },

    buildSuggestionPatches(input: BuildSuggestionPatchesInput) {
      validateSuggestionPatchesInput(input);
      const { pr: _pr, ...options } = input;
      return runWithExecutionCwd(cwd, async () => {
        const target = resolvePrReference(input.pr);
        return runSuggestionPatches({ ...options, ...target, format: "json" });
      });
    },
  });
}

function validateApplyInput(input: ApplyInput): void {
  if (!input || !Array.isArray(input.operations) || input.operations.length === 0) {
    throw new PrShepherdValidationError("apply requires a non-empty operations array");
  }
  for (const operation of input.operations) validateOperation(operation);
  validatePrReference(input.pr);
}

function validateOperation(operation: ApplyOperation): void {
  if (!operation || typeof operation !== "object") {
    throw new PrShepherdValidationError("apply operation must be an object");
  }

  switch (operation.type) {
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
  if (operation.requireSha !== undefined && !/^[0-9a-f]{40}$/.test(operation.requireSha)) {
    throw new PrShepherdValidationError(
      "review_mutations.requireSha must be a full 40-character lowercase hex SHA",
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

function validateSuggestionPatchInput(input: BuildSuggestionPatchInput): void {
  if (!input || typeof input.threadId !== "string" || input.threadId.trim() === "") {
    throw new PrShepherdValidationError("buildSuggestionPatch.threadId is required");
  }
  if (typeof input.message !== "string" || input.message.trim() === "") {
    throw new PrShepherdValidationError(
      "buildSuggestionPatch.message is required and must be non-empty",
    );
  }
  if (input.description !== undefined && typeof input.description !== "string") {
    throw new PrShepherdValidationError("buildSuggestionPatch.description must be a string");
  }
  validatePrReference(input.pr);
}

function validateSuggestionPatchesInput(input: BuildSuggestionPatchesInput): void {
  if (!input || !Array.isArray(input.suggestions) || input.suggestions.length === 0) {
    throw new PrShepherdValidationError(
      "buildSuggestionPatches.suggestions must be a non-empty array",
    );
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
