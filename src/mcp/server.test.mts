import { describe, expect, it, vi } from "vitest";

import { PrShepherdValidationError } from "../api.mts";
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
});
