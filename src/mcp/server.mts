/* eslint-disable max-lines */
import { readFileSync } from "node:fs";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  createPrShepherd,
  type ApplyInput,
  type BuildSuggestionPatchInput,
  type BuildSuggestionPatchesInput,
  type CreatePrShepherdOptions,
  type IterateInput,
  type AggregateIterateInput,
  type SingleIterateInput,
  PartialApplyError,
  type PrShepherd,
  PrShepherdValidationError,
} from "../api.mts";
import { isRepositoryQualifiedPrReference, parsePrReference } from "../pr-reference.mts";
import { formatJournalResult } from "../cli/journal-formatter.mts";
import {
  formatCommitSuggestionResult,
  formatSuggestionPatchesResult,
  formatIterateResult,
  formatMarkFilesAsViewedResult,
  formatMutateResult,
  projectIterateLean,
} from "../cli/formatters.mts";
import { formatPollSummaryResult } from "../cli/poll-summary-formatter.mts";
import type { IterateResult, PollSummaryResult } from "../types.mts";
import { formatCliError, serializeGitHubRequestErrorDetails } from "../cli/error-format.mts";
import { errorToExitCode, EXIT } from "../exit-codes.mts";

export interface CreatePrShepherdMcpServerOptions extends CreatePrShepherdOptions {
  /** Optional injection point for embedding hosts and focused tests. */
  shepherd?: PrShepherd;
}

const QUALIFIED_PR_ERROR = "pr must be a GitHub pull-request URL or an owner/repo#number reference";
const pr = z
  .string()
  .refine(isRepositoryQualifiedPrReference, { message: QUALIFIED_PR_ERROR })
  .describe(
    "GitHub pull-request URL or owner/repo#number; the explicit repository may differ from the server working directory",
  );
const ids = z.array(z.string().min(1)).optional();

const iterateInputSchema = z
  .object({
    pr: pr.optional(),
    prs: z.array(pr).min(1).optional(),
    stack: pr.optional(),
    readyDelaySeconds: z.number().nonnegative().optional(),
    stallTimeoutSeconds: z.number().nonnegative().optional(),
    noAutoMarkReady: z.boolean().optional(),
    merge: z.boolean().optional(),
    noAutoCancelActionable: z
      .boolean()
      .optional()
      .describe("Deprecated no-op; Shepherd never cancels workflow runs."),
    neverCancelRuns: z
      .array(z.string())
      .optional()
      .describe("Deprecated per-call no-op retained for compatibility."),
  })
  .refine(
    (input) =>
      [input.pr, input.prs, input.stack].filter((value) => value !== undefined).length === 1,
    {
      message: "exactly one of pr, prs, or stack is required",
    },
  )
  .refine(
    (input) =>
      !input.prs || new Set(input.prs.map((ref) => parsePrReference(ref)?.repository)).size === 1,
    { message: "all prs must belong to the same repository" },
  );

const reviewMutationsOperationSchema = z.object({
  type: z.literal("review_mutations"),
  resolveThreadIds: ids,
  replyThreadIds: ids,
  minimizeCommentIds: ids,
  dismissReviewIds: ids,
  message: z.string().optional(),
  requireSha: z.string().optional(),
});

const markFilesViewedOperationSchema = z.object({
  type: z.literal("mark_files_viewed"),
  files: z.array(z.string().min(1)).optional(),
  tests: z.boolean().optional().describe("Select changed test files to mark as viewed."),
  matchPatterns: z.array(z.string().min(1)).optional(),
});

const appendJournalOperationSchema = z.object({
  type: z.literal("append_journal"),
  item: z.string(),
  dryRun: z.boolean().optional(),
});

const applyInputSchema = z.object({
  pr,
  operations: z
    .array(
      z.discriminatedUnion("type", [
        reviewMutationsOperationSchema,
        markFilesViewedOperationSchema,
        appendJournalOperationSchema,
      ]),
    )
    .min(1),
});

const suggestionPatchInputSchema = z.object({
  pr,
  threadId: z.string().min(1),
  message: z.string().min(1),
  description: z.string().optional(),
});

const suggestionPatchesInputSchema = z.object({
  pr,
  suggestions: z
    .array(
      z.object({
        threadId: z.string().min(1),
        message: z.string().min(1),
        description: z.string().optional(),
      }),
    )
    .min(1),
});

/** Creates a local-only MCP server with Shepherd's public operations. */
export function createPrShepherdMcpServer(
  options: CreatePrShepherdMcpServerOptions = {},
): McpServer {
  const shepherd = options.shepherd ?? createPrShepherd({ cwd: options.cwd });
  const server = new McpServer({ name: "pr-shepherd", version: readPackageVersion() });

  server.registerTool(
    "iterate",
    {
      description:
        "Inspect one pull request, an explicit same-repository set, or a native stack and return one Shepherd tick.",
      inputSchema: iterateInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => {
      // One options object feeds both channels so JSON and Markdown cannot drift.
      const opts = {
        readyDelaySuffix:
          input.readyDelaySeconds === undefined ? undefined : `${input.readyDelaySeconds}s`,
      };
      return runTool(
        () => runIterateSelector(shepherd, requireRepositoryQualifiedIterate(input)),
        (result: IterateResult | PollSummaryResult) =>
          isPollSummary(result)
            ? formatPollSummaryResult(result)
            : formatIterateResult(result, opts),
        (result: IterateResult | PollSummaryResult) =>
          isPollSummary(result) ? result : projectIterateLean(result, opts),
      );
    },
  );

  server.registerTool(
    "apply",
    {
      description:
        "Apply ordered review, journal, and file-view operations after prevalidation; explicit requests rely on GitHub's mutation response.",
      inputSchema: applyInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) =>
      runTool(
        () => shepherd.apply(requireRepositoryQualifiedPr(input) as ApplyInput),
        formatApplyResult,
      ),
  );

  server.registerTool(
    "build_suggestion_patches",
    {
      description: "Build, but never apply, an ordered list of eligible review suggestion patches.",
      inputSchema: suggestionPatchesInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) =>
      runTool(
        () =>
          shepherd.buildSuggestionPatches(
            requireRepositoryQualifiedPr(input) as BuildSuggestionPatchesInput,
          ),
        formatSuggestionPatchesResult,
      ),
  );

  server.registerTool(
    "build_suggestion_patch",
    {
      description: "Deprecated: use build_suggestion_patches with a one-item suggestions array.",
      inputSchema: suggestionPatchInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) =>
      runTool(
        () =>
          shepherd.buildSuggestionPatch(
            requireRepositoryQualifiedPr(input) as BuildSuggestionPatchInput,
          ),
        formatCommitSuggestionResult,
      ),
  );

  return server;
}

function runIterateSelector(
  shepherd: PrShepherd,
  input: IterateInput,
): Promise<IterateResult | PollSummaryResult> {
  return "prs" in input || "stack" in input
    ? shepherd.iterate(input as AggregateIterateInput)
    : shepherd.iterate(input as SingleIterateInput);
}

function requireRepositoryQualifiedIterate(input: {
  pr?: unknown;
  prs?: unknown;
  stack?: unknown;
}): IterateInput {
  if ([input.pr, input.prs, input.stack].filter((value) => value !== undefined).length !== 1) {
    throw new PrShepherdValidationError("exactly one of pr, prs, or stack is required");
  }
  const refs = Array.isArray(input.prs) ? input.prs : [input.pr ?? input.stack];
  if (refs.length === 0 || refs.some((ref) => !isRepositoryQualifiedPrReference(ref))) {
    throw new PrShepherdValidationError(QUALIFIED_PR_ERROR);
  }
  const repositories = new Set(refs.map((ref) => parsePrReference(ref as string)?.repository));
  if (repositories.size !== 1) {
    throw new PrShepherdValidationError("all prs must belong to the same repository");
  }
  return input as IterateInput;
}

function isPollSummary(result: IterateResult | PollSummaryResult): result is PollSummaryResult {
  return "mode" in result && result.mode === "summary";
}

function requireRepositoryQualifiedPr<Input extends { pr?: unknown }>(
  input: Input,
): Input & { pr: string } {
  if (!isRepositoryQualifiedPrReference(input.pr)) {
    throw new PrShepherdValidationError(QUALIFIED_PR_ERROR);
  }
  return input as Input & { pr: string };
}

function readPackageVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  return packageJson.version;
}

function toolResult(structured: unknown, text: string) {
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: structured as Record<string, unknown>,
  };
}

/**
 * `project` mirrors the CLI's `--format=json` treatment of the same result. Tools
 * whose CLI JSON is the raw result object (apply, build_suggestion_patch(es) — see
 * handlers.mts and cli-parser.mts, which JSON.stringify the result directly) omit
 * `project` and return the result unchanged, matching their own CLI JSON output.
 */
async function runTool<Result extends object>(
  work: () => Promise<Result>,
  format: (result: Result) => string,
  project?: (result: Result) => unknown,
) {
  try {
    const result = await work();
    return toolResult(project ? project(result) : result, format(result));
  } catch (error) {
    return toolError(error);
  }
}

function formatApplyResult(result: Awaited<ReturnType<PrShepherd["apply"]>>): string {
  return result.operations
    .map((operation, index) => {
      const heading = `## Operation ${index + 1}: ${operation.type}`;
      switch (operation.type) {
        case "review_mutations":
          return `${heading}\n\n${formatMutateResult(operation.result)}`;
        case "mark_files_viewed":
          return `${heading}\n\n${formatMarkFilesAsViewedResult(operation.result)}`;
        case "append_journal":
          return `${heading}\n\n${formatJournalResult(operation.result)}`;
      }
    })
    .join("\n\n");
}

function toolError(error: unknown) {
  const code =
    error instanceof PrShepherdValidationError
      ? EXIT.USAGE
      : error instanceof PartialApplyError
        ? errorToExitCode(error.cause)
        : errorToExitCode(error);
  const cause = error instanceof PartialApplyError ? error.cause : error;
  const githubDetails = serializeGitHubRequestErrorDetails(cause);
  const details =
    error instanceof PartialApplyError
      ? { failedIndex: error.failedIndex, completed: redactValue(error.completed) }
      : error instanceof PrShepherdValidationError
        ? { validation: true }
        : {};
  const formattedCause = formatCliError(cause);
  const causeMessage = cause instanceof Error ? cause.message : String(cause);
  const message = redactErrorMessage(
    error instanceof PartialApplyError && formattedCause.startsWith(causeMessage)
      ? `${error.message}${formattedCause.slice(causeMessage.length)}`
      : formattedCause,
  );
  return {
    isError: true,
    content: [{ type: "text" as const, text: `pr-shepherd error (${code}): ${message}` }],
    structuredContent: {
      code,
      message,
      details: {
        ...details,
        ...(githubDetails !== undefined && { github: redactValue(githubDetails) }),
      },
    },
  };
}

function redactErrorMessage(message: string): string {
  return message
    .replace(/(?:ghp|github_pat)_[A-Za-z0-9_]+/g, "[redacted]")
    .replace(/(authorization:\s*bearer\s+)[^\s]+/gi, "$1[redacted]");
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactErrorMessage(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactValue(item)]));
  }
  return value;
}
