import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  NOW,
  makeOpts,
  makeReport,
  mockExecFile,
  mockReadFixAttempts,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";
import { hashBody } from "../state/seen-comments.mts";

registerIterateHooks();

// THREAD fixture used by escalate humanMessage tests.
const THREAD = {
  id: "thread-1",
  isResolved: false,
  isOutdated: false,
  isMinimized: false,
  path: "src/foo.mts",
  line: 10,
  startLine: null,
  author: "reviewer",
  authorType: "Unknown" as const,
  body: "Fix this",
  url: "",
  createdAtUnix: NOW - 3600,
};

describe("runIterate — prescriptive fields: escalate humanMessage", () => {
  it("escalate.humanMessage contains triggers, suggestion, and thread details", async () => {
    mockReadFixAttempts.mockResolvedValue({
      headSha: "abc123",
      threadAttempts: { "thread-1": 3 },
      threadBodyHashes: { "thread-1": hashBody(THREAD.body) },
    });
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: {
          actionable: [THREAD],
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
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "log")
        return Promise.resolve({ stdout: String(NOW - 60), stderr: "" });
      if (cmd === "git" && args[0] === "rev-parse")
        return Promise.resolve({ stdout: "abc123\n", stderr: "" });
      return Promise.resolve({ stdout: "", stderr: "" });
    });

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("escalate");
    if (result.action === "escalate") {
      const { humanMessage } = result.escalate;
      expect(humanMessage).toMatch(/paused/i);
      expect(humanMessage).toMatch(/fix-thrash/);
      expect(humanMessage).toMatch(/thread-1/);
      expect(humanMessage).toMatch(/src\/foo\.mts/);
      expect(humanMessage).toMatch(/pr-shepherd:pr-shepherd 42/);
      expect(humanMessage).toMatch(/pr-shepherd:pr-shepherd 42` to resume/);
    }
  });

  it("escalates with base-branch-unknown when fix_code needs a push but baseBranch is empty", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        baseBranch: "",
        threads: {
          actionable: [THREAD],
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
    expect(result.action).toBe("escalate");
    if (result.action === "escalate") {
      expect(result.escalate.triggers).toContain("base-branch-unknown");
      expect(result.escalate.suggestion).toMatch(/empty base branch name/);
      expect(result.escalate.humanMessage).toMatch(/base-branch-unknown/);
    }
  });

  it("escalates with base-branch-unknown on CONFLICTS-only when baseBranch is empty (no resolve IDs, but rebase still needed)", async () => {
    // Guards the `|| hasConflicts` branch of the fix_code base-branch-unknown
    // gate. Without it, a CONFLICTS-only PR with no threads/comments/checks/
    // reviews would silently rebase onto `main` when the base branch was
    // invalid, because resolveCommand.requiresHeadSha is false (nothing to
    // resolve).
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        baseBranch: "",
        mergeStatus: {
          status: "CONFLICTS",
          state: "OPEN" as const,
          isDraft: false,
          mergeable: "CONFLICTING",
          reviewDecision: null,
          blockingBotReviewInProgress: false,
          mergeStateStatus: "DIRTY",
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("escalate");
    if (result.action === "escalate") {
      expect(result.escalate.triggers).toEqual(["base-branch-unknown"]);
      expect(result.escalate.suggestion).toMatch(/empty base branch name/);
    }
  });

  it("escalates with base-branch-unknown when baseBranch contains unsafe characters", async () => {
    // Prevents shell interpolation via validateBaseBranch — a ref like
    // `main;rm -rf /` must not flow into the rebase instruction string.
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        baseBranch: "main; rm -rf /",
        threads: {
          actionable: [THREAD],
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
    expect(result.action).toBe("escalate");
    if (result.action === "escalate") {
      expect(result.escalate.triggers).toContain("base-branch-unknown");
      expect(result.escalate.suggestion).toMatch(/unsafe characters/);
      expect(result.escalate.suggestion).toContain("main; rm -rf /");
    }
  });
});
