import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

function makeActionableCheck(runId: string, name = "typecheck") {
  return {
    name,
    status: "COMPLETED" as const,
    conclusion: "FAILURE" as const,
    detailsUrl: `https://github.com/owner/repo/actions/runs/${runId}`,
    event: "pull_request",
    runId,
    category: "failing" as const,
  };
}

describe("runIterate — fix_code agent projection", () => {
  it("emits AgentThread shape — no isResolved/isOutdated/createdAtUnix on fix.threads", async () => {
    const thread = {
      id: "t-1",
      isResolved: false,
      isOutdated: false,
      isMinimized: false,
      path: "src/foo.mts",
      line: 5,
      startLine: null,
      author: "alice",
      authorType: "Unknown" as const,
      body: "Please fix this",
      url: "",
      createdAtUnix: 1700000000,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: {
          actionable: [thread],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      const t = result.fix.threads[0]!;
      expect(t.id).toBe("t-1");
      expect(t.path).toBe("src/foo.mts");
      expect(t.line).toBe(5);
      expect(t.author).toBe("alice");
      expect(t.body).toBe("Please fix this");
      expect(t).not.toHaveProperty("isResolved");
      expect(t).not.toHaveProperty("isOutdated");
      expect(t).not.toHaveProperty("createdAtUnix");
    }
  });
  it("emits AgentComment shape — no isMinimized/createdAtUnix on fix.actionableComments", async () => {
    const comment = {
      id: "c-1",
      isMinimized: false,
      author: "bob",
      authorType: "Unknown" as const,
      body: "Consider renaming this",
      url: "",
      createdAtUnix: 1700000000,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        comments: { actionable: [comment], firstLook: [] },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      const c = result.fix.actionableComments[0]!;
      expect(c.id).toBe("c-1");
      expect(c.author).toBe("bob");
      expect(c.body).toBe("Consider renaming this");
      expect(c).not.toHaveProperty("isMinimized");
      expect(c).not.toHaveProperty("createdAtUnix");
    }
  });
  it("emits AgentCheck shape — has conclusion; no failureKind/category/logTail on fix.checks", async () => {
    const check = makeActionableCheck("run-55");
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [check],
          inProgress: [],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,

        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      const c = result.fix.checks[0]!;
      expect(c.name).toBe("typecheck");
      expect(c.runId).toBe("run-55");
      expect(c.detailsUrl).toBeDefined();
      expect(c).toHaveProperty("conclusion");
      expect(c).not.toHaveProperty("failureKind");
      expect(c).not.toHaveProperty("category");
      expect(c).not.toHaveProperty("logTail");
    }
  });
});
