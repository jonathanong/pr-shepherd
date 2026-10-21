/* eslint-disable max-lines */
import { readFileSync } from "node:fs";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  createPrShepherd,
  type ApplyInput,
  type SuggestInput,
  type CreatePrShepherdOptions,
  type GetJournalInput,
  type MultiIterateInput,
  type SingleIterateInput,
  type StackInput,
  PartialApplyError,
  type PrShepherd,
  PrShepherdValidationError,
} from "../api.mts";
import {
  isRepositoryQualifiedPrReference,
  normalizeRepositoryIdentity,
  parsePrReference,
} from "../pr-reference.mts";
import { formatJournalResult } from "../cli/journal-formatter.mts";
import {
  formatSuggestionPatchesResult,
  formatIterateResult,
  formatMarkFilesAsViewedResult,
  formatMutateResult,
  projectIterateLean,
} from "../cli/formatters.mts";
import { formatPollSummaryResult } from "../cli/poll-summary-formatter.mts";
import { projectStackOverview } from "../cli/stack-overview.mts";
import type { IterateResult, PollSummaryResult } from "../types.mts";
import { formatCliError, serializeGitHubRequestErrorDetails } from "../cli/error-format.mts";
import { errorToExitCode, EXIT } from "../exit-codes.mts";
import { formatApplyMergeResult } from "../cli/apply-merge-handler.mts";
import { extractShepherdJournal } from "../journal/index.mts";
import { formatPlaybookResult, runPlaybook } from "../commands/playbook.mts";
import { formatCheckBlockerResult } from "../commands/apply-check-blocker.mts";

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
const transport = z.enum(["auto", "graphql", "rest"]).optional();

const tickOptionsSchema = {
  transport,
  readyDelaySeconds: z.number().nonnegative().optional(),
  stallTimeoutSeconds: z.number().nonnegative().optional(),
  noAutoMarkReady: z.boolean().optional(),
  merge: z.boolean().optional(),
  instructions: z
    .enum(["playbook", "inline"])
    .optional()
    .describe(
      "fix_code instruction style. inline (default) prints every step each tick; playbook folds commit and push into the Fix-code loop playbook.",
    ),
};

const iterateInputSchema = z
  .object({
    ...tickOptionsSchema,
    pr: pr.optional(),
    prs: z.array(pr).min(1).optional(),
  })
  .refine((input) => (input.pr === undefined) !== (input.prs === undefined), {
    message: "exactly one of pr or prs is required",
  })
  .refine(
    (input) =>
      !input.prs ||
      new Set(
        input.prs.map((ref) =>
          normalizeRepositoryIdentity(parsePrReference(ref)?.repository ?? ""),
        ),
      ).size === 1,
    { message: "all prs must belong to the same repository" },
  );

const stackInputSchema = z.object({ ...tickOptionsSchema, pr });

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

const acknowledgeQueueRemovalOperationSchema = z.object({
  type: z.literal("acknowledge_queue_removal"),
  requireSha: z.string().regex(/^[0-9a-f]{40}$/),
  queueCommitOid: z.string().regex(/^[0-9a-f]{40}$/),
  removedAtUnix: z.number().int().positive().safe(),
});

const checkBlockerOperationSchema = z.object({
  type: z.literal("check_blocker"),
  check: z.string().min(1).describe("Exact check name."),
  blockedBy: z
    .string()
    .min(1)
    .optional()
    .describe("Blocking PR/issue URL, owner/repo#N, or issue:owner/repo#N."),
  clear: z.boolean().optional().describe("Clear the recorded blocker instead of setting one."),
});

const mergeOperationSchema = z.object({
  type: z.literal("merge"),
  requireSha: z.string().regex(/^[0-9a-f]{40}$/),
  mergeAction: z.enum(["direct_merge", "merge_queue", "default"]),
  mergeMethod: z.enum(["merge", "squash", "rebase"]).optional(),
  expectedStack: z
    .object({
      number: z.number().int().positive().safe(),
      baseRefName: z.string().min(1),
      prefix: z
        .array(
          z.object({
            pr: z.number().int().positive().safe(),
            headRefName: z.string().min(1),
            headRefOid: z.string().regex(/^[0-9a-f]{40}$/),
            baseRefName: z.string().min(1),
          }),
        )
        .min(1)
        .max(100_000),
    })
    .optional(),
});
const applyInputSchema = z.object({
  transport,
  pr,
  operations: z
    .array(
      z.discriminatedUnion("type", [
        mergeOperationSchema,
        reviewMutationsOperationSchema,
        markFilesViewedOperationSchema,
        appendJournalOperationSchema,
        acknowledgeQueueRemovalOperationSchema,
        checkBlockerOperationSchema,
      ]),
    )
    .min(1),
});

const suggestInputSchema = z.object({
  transport,
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
  let shepherd = options.shepherd;
  const getShepherd = () =>
    (shepherd ??= createPrShepherd({ cwd: options.cwd, transport: options.transport }));
  const server = new McpServer({ name: "pr-shepherd", version: readPackageVersion() });

  server.registerTool(
    "iterate",
    {
      description:
        "Inspect one pull request (pr) or an explicit same-repository set (prs) and return one Shepherd tick.",
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
        () => runIterateSelector(getShepherd(), requireRepositoryQualifiedIterate(input)),
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
    "stack",
    {
      description:
        "Inspect the native stack containing one pull request and return one aggregate Shepherd tick.",
      inputSchema: stackInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) =>
      runTool(
        () => getShepherd().stack(requireRepositoryQualifiedPr(input) as StackInput),
        formatPollSummaryResult,
        projectStackOverview,
      ),
  );

  server.registerTool(
    "apply",
    {
      description:
        "Apply ordered merge, review, file-view, journal, check-blocker, and queue-removal operations after prevalidation; explicit requests rely on GitHub's mutation response.",
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
        () => getShepherd().apply(requireRepositoryQualifiedPr(input) as ApplyInput),
        formatApplyResult,
      ),
  );

  server.registerTool(
    "extract_journal",
    {
      description:
        "Extract the validated Shepherd Journal from a supplied Markdown body without I/O.",
      inputSchema: z.object({ body: z.string() }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) =>
      runTool(async () => {
        if (typeof input.body !== "string") {
          throw new PrShepherdValidationError("body must be a Markdown string");
        }
        return extractShepherdJournal(input.body);
      }, JSON.stringify),
  );

  server.registerTool(
    "get_journal",
    {
      description:
        "Fetch one pull request body through the selected transport and extract its Shepherd Journal.",
      inputSchema: z.object({ pr, transport }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) =>
      runTool(
        () => getShepherd().getJournal(requireRepositoryQualifiedPr(input) as GetJournalInput),
        JSON.stringify,
      ),
  );

  server.registerTool(
    "playbook",
    {
      description:
        "Return a playbook named by an instruction-step playbook pointer, from the package. Omit name to list playbooks. Read-only; no GitHub I/O.",
      inputSchema: z.object({ name: z.string().optional() }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => runTool(async () => runPlaybook(input.name), formatPlaybookResult),
  );

  server.registerTool(
    "suggest",
    {
      description: "Build, but never apply, an ordered list of eligible review suggestion patches.",
      inputSchema: suggestInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) =>
      runTool(
        () => getShepherd().suggest(requireRepositoryQualifiedPr(input) as SuggestInput),
        formatSuggestionPatchesResult,
      ),
  );

  return server;
}

function runIterateSelector(
  shepherd: PrShepherd,
  input: SingleIterateInput | MultiIterateInput,
): Promise<IterateResult | PollSummaryResult> {
  return "prs" in input && input.prs !== undefined
    ? shepherd.iterate(input as MultiIterateInput)
    : shepherd.iterate(input as SingleIterateInput);
}

function requireRepositoryQualifiedIterate(input: {
  pr?: unknown;
  prs?: unknown;
}): SingleIterateInput | MultiIterateInput {
  if ((input.pr === undefined) === (input.prs === undefined)) {
    throw new PrShepherdValidationError("exactly one of pr or prs is required");
  }
  const refs = Array.isArray(input.prs) ? input.prs : [input.pr];
  if (refs.length === 0 || refs.some((ref) => !isRepositoryQualifiedPrReference(ref))) {
    throw new PrShepherdValidationError(QUALIFIED_PR_ERROR);
  }
  const repositories = new Set(
    refs.map((ref) =>
      normalizeRepositoryIdentity(parsePrReference(ref as string)?.repository ?? ""),
    ),
  );
  if (repositories.size !== 1) {
    throw new PrShepherdValidationError("all prs must belong to the same repository");
  }
  return input as SingleIterateInput | MultiIterateInput;
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
 * whose CLI JSON is the raw result object (apply, suggest — see
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
        case "merge":
          return `${heading}\n\n${formatApplyMergeResult(operation.result)}`;
        case "review_mutations":
          return `${heading}\n\n${formatMutateResult(operation.result)}`;
        case "mark_files_viewed":
          return `${heading}\n\n${formatMarkFilesAsViewedResult(operation.result)}`;
        case "append_journal":
          return `${heading}\n\n${formatJournalResult(operation.result)}`;
        case "check_blocker":
          return `${heading}\n\n${formatCheckBlockerResult(operation.result)}`;
        case "acknowledge_queue_removal": {
          const result = operation.result;
          return [
            heading,
            "",
            `PR: ${result.repo}#${result.pr}`,
            `headSha: ${result.acknowledgment.headSha}`,
            `queueCommitOid: ${result.acknowledgment.queueCommitOid}`,
            `removedAtUnix: ${result.acknowledgment.removedAtUnix}`,
          ].join("\n");
        }
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
