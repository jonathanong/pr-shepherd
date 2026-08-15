/* eslint-disable max-lines */
import { describe, expect, it, vi } from "vitest";

import { PartialApplyError, PrShepherdValidationError } from "../api.mts";
import { createPrShepherdMcpServer } from "./server.mts";

interface RegisteredTool {
  annotations: Record<string, boolean>;
  handler: (input: unknown) => Promise<{
    isError?: boolean;
    structuredContent?: unknown;
    content?: Array<{ type: string; text: string }>;
  }>;
}

function registeredTools(server: ReturnType<typeof createPrShepherdMcpServer>) {
  return (
    server as unknown as {
      _registeredTools: Record<string, RegisteredTool>;
    }
  )._registeredTools;
}

describe("pr-shepherd MCP server", () => {
  it("registers only the public tools and returns API results as structured content", async () => {
    const result = {
      action: "wait" as const,
      pr: 3,
      repo: "openai/pr-shepherd",
      status: "PENDING" as const,
      state: "OPEN" as const,
      mergeStateStatus: "UNKNOWN" as const,
      mergeStatus: "UNSTABLE" as const,
      reviewDecision: null,
      blockingBotReviewInProgress: false,
      isDraft: false,
      shouldCancel: false,
      remainingSeconds: 0,
      summary: { passing: 0, skipped: 0, filtered: 0, inProgress: 1, superseded: 0 },
      baseBranch: "main",
      branchProtection: null,
      checks: [],
      log: "waiting",
    };
    const iterate = vi.fn().mockResolvedValue(result);
    const server = createPrShepherdMcpServer({
      shepherd: {
        iterate,
        apply: vi.fn(),
        buildSuggestionPatch: vi.fn(),
      },
    });
    const tools = registeredTools(server);

    expect(Object.keys(tools).sort()).toEqual(["apply", "build_suggestion_patch", "iterate"]);
    expect(tools.iterate!.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    });
    expect(tools.build_suggestion_patch!.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    });
    const response = await tools.iterate!.handler({ pr: 3 });

    expect(iterate).toHaveBeenCalledWith({ pr: 3 });
    expect(response.structuredContent).toBe(result);
  });

  it("maps typed API errors to safe coded MCP errors", async () => {
    const server = createPrShepherdMcpServer({
      shepherd: {
        iterate: vi.fn().mockRejectedValue(new PrShepherdValidationError("bad input")),
        apply: vi.fn(),
        buildSuggestionPatch: vi.fn(),
      },
    });

    const response = await registeredTools(server).iterate!.handler({});

    expect(response).toMatchObject({
      isError: true,
      structuredContent: {
        code: 64,
        message: "bad input",
        details: { validation: true },
      },
    });
    expect(response.content?.[0]?.text).toBe("pr-shepherd error (64): bad input");
  });

  it("formats all ordered apply results and suggestion patches", async () => {
    const applyResult = {
      operations: [
        {
          type: "review_mutations" as const,
          result: {
            repliedThreads: [],
            resolvedThreads: ["PRRT_one"],
            minimizedComments: [],
            dismissedReviews: [],
            errors: [],
          },
        },
        {
          type: "mark_files_viewed" as const,
          result: {
            prNumber: 3,
            repo: "acme/widgets",
            matchedPaths: ["src/api.mts"],
            markedPaths: ["src/api.mts"],
            alreadyViewedPaths: [],
            missingPaths: [],
            unmatchedSelectors: [],
            errors: [],
          },
        },
        {
          type: "append_journal" as const,
          result: { prNumber: 3, mutated: true, sectionExisted: false, dryRun: false },
        },
      ],
    };
    const suggestionResult = {
      pr: 3,
      repo: "acme/widgets",
      threadId: "PRRT_two",
      author: "reviewer",
      path: "src/api.mts",
      startLine: 1,
      endLine: 1,
      patch: "",
      commitMessage: "apply suggestion",
      commitBody: "",
      postActionInstructions: [],
    };
    const apply = vi.fn().mockResolvedValue(applyResult);
    const buildSuggestionPatch = vi.fn().mockResolvedValue(suggestionResult);
    const server = createPrShepherdMcpServer({
      shepherd: { iterate: vi.fn(), apply, buildSuggestionPatch },
    });
    const tools = registeredTools(server);

    const applyResponse = await tools.apply!.handler({
      operations: [{ type: "mark_files_viewed", tests: true }],
    });
    const suggestionResponse = await tools.build_suggestion_patch!.handler({
      threadId: "PRRT_two",
      message: "apply suggestion",
    });

    expect(applyResponse.structuredContent).toBe(applyResult);
    expect(applyResponse.content?.[0]?.text).toContain("Operation 1: review_mutations");
    expect(applyResponse.content?.[0]?.text).toContain("Operation 2: mark_files_viewed");
    expect(applyResponse.content?.[0]?.text).toContain("Operation 3: append_journal");
    expect(suggestionResponse.structuredContent).toBe(suggestionResult);
    expect(buildSuggestionPatch).toHaveBeenCalledWith({
      threadId: "PRRT_two",
      message: "apply suggestion",
    });
  });

  it("redacts secrets and reports completed operations for partial apply failures", async () => {
    const completed = [
      {
        type: "append_journal" as const,
        result: {
          prNumber: 3,
          mutated: true,
          sectionExisted: true,
          dryRun: false,
          previewBody: "github_pat_secret",
          values: ["authorization: Bearer secret", 1],
        },
      },
    ];
    const error = new PartialApplyError(1, completed, new Error("ghp_supersecret failed"));
    const server = createPrShepherdMcpServer({
      shepherd: {
        iterate: vi.fn(),
        apply: vi.fn().mockRejectedValue(error),
        buildSuggestionPatch: vi.fn(),
      },
    });

    const response = await registeredTools(server).apply!.handler({ operations: [] });

    expect(response).toMatchObject({
      isError: true,
      structuredContent: {
        message: "apply operation 1 failed: [redacted] failed",
        details: {
          failedIndex: 1,
          completed: [
            {
              result: {
                previewBody: "[redacted]",
                values: ["authorization: Bearer [redacted]", 1],
              },
            },
          ],
        },
      },
    });
  });
});
