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
  PartialApplyError,
  type PrShepherd,
  PrShepherdValidationError,
} from "../api.mts";
import { isRepositoryQualifiedPrReference } from "../pr-reference.mts";
import { formatJournalResult } from "../cli/journal-formatter.mts";
import {
  formatCommitSuggestionResult,
  formatSuggestionPatchesResult,
  formatIterateResult,
  formatMarkFilesAsViewedResult,
  formatMutateResult,
} from "../cli/formatters.mts";
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

const iterateInputSchema = z.object({
  pr,
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
});

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
  tests: z.boolean().optional().describe("Select changed test files; no mutation occurs."),
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
      description: "Inspect the specified pull request and return the next Shepherd state.",
      inputSchema: iterateInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) =>
      runTool(
        () => shepherd.iterate(requireRepositoryQualifiedPr(input) as IterateInput),
        formatIterateResult,
      ),
  );

  server.registerTool(
    "apply",
    {
      description:
        "Apply ordered authorized review and journal operations, or run selection-only file-view diagnostics, after prevalidation.",
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

function toolResult(result: object, text: string) {
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: result as Record<string, unknown>,
  };
}

async function runTool<Result extends object>(
  work: () => Promise<Result>,
  format: (result: Result) => string,
) {
  try {
    const result = await work();
    return toolResult(result, format(result));
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
