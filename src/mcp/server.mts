/* eslint-disable max-lines */
import { readFileSync } from "node:fs";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  createPrShepherd,
  type ApplyInput,
  type BuildSuggestionPatchInput,
  type CreatePrShepherdOptions,
  type IterateInput,
  PartialApplyError,
  type PrShepherd,
  PrShepherdValidationError,
} from "../api.mts";
import { formatJournalResult } from "../cli/journal-formatter.mts";
import {
  formatCommitSuggestionResult,
  formatIterateResult,
  formatMarkFilesAsViewedResult,
  formatMutateResult,
} from "../cli/formatters.mts";
import { errorToExitCode, EXIT } from "../exit-codes.mts";

export interface CreatePrShepherdMcpServerOptions extends CreatePrShepherdOptions {
  /** Optional injection point for embedding hosts and focused tests. */
  shepherd?: PrShepherd;
}

const pr = z.union([z.number().int().positive(), z.string().url()]).optional();
const ids = z.array(z.string().min(1)).optional();

const iterateInputSchema = z.object({
  pr,
  readyDelaySeconds: z.number().nonnegative().optional(),
  stallTimeoutSeconds: z.number().nonnegative().optional(),
  noAutoMarkReady: z.boolean().optional(),
  noAutoCancelActionable: z.boolean().optional(),
  neverCancelRuns: z.array(z.string()).optional(),
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
  tests: z.boolean().optional(),
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

/** Creates a local-only MCP server with the three public Shepherd operations. */
export function createPrShepherdMcpServer(
  options: CreatePrShepherdMcpServerOptions = {},
): McpServer {
  const shepherd = options.shepherd ?? createPrShepherd({ cwd: options.cwd });
  const server = new McpServer({ name: "pr-shepherd", version: readPackageVersion() });

  server.registerTool(
    "iterate",
    {
      description: "Inspect the current pull request and return the next Shepherd state.",
      inputSchema: iterateInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => runTool(() => shepherd.iterate(input as IterateInput), formatIterateResult),
  );

  server.registerTool(
    "apply",
    {
      description: "Apply ordered review, file-view, and journal operations after prevalidation.",
      inputSchema: applyInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => runTool(() => shepherd.apply(input as ApplyInput), formatApplyResult),
  );

  server.registerTool(
    "build_suggestion_patch",
    {
      description: "Build, but never apply, a patch from an eligible review suggestion.",
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
        () => shepherd.buildSuggestionPatch(input as BuildSuggestionPatchInput),
        formatCommitSuggestionResult,
      ),
  );

  return server;
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
  const details =
    error instanceof PartialApplyError
      ? { failedIndex: error.failedIndex, completed: redactValue(error.completed) }
      : error instanceof PrShepherdValidationError
        ? { validation: true }
        : {};
  const message = redactErrorMessage(error instanceof Error ? error.message : String(error));
  return {
    isError: true,
    content: [{ type: "text" as const, text: `pr-shepherd error (${code}): ${message}` }],
    structuredContent: { code, message, details },
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
