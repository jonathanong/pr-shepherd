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
      expect(humanMessage).toMatch(/triage-thrash/);
      expect(humanMessage).toMatch(/thread-1/);
      expect(humanMessage).toMatch(/src\/foo\.mts/);
      expect(humanMessage).toMatch(
        /pr-shepherd:pr-shepherd https:\/\/github\.com\/owner\/repo\/pull\/42/,
      );
      expect(humanMessage).toMatch(
        /pr-shepherd:pr-shepherd https:\/\/github\.com\/owner\/repo\/pull\/42` to resume/,
      );
    }
  });

  it.each([
    { name: "empty", baseBranch: "" },
    { name: "unsafe", baseBranch: "main; rm -rf /" },
  ])("triages with a read-the-base step when the base branch is $name", async ({ baseBranch }) => {
    // A name outside [A-Za-z0-9._/-] must never reach a printed command or the output.
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        baseBranch,
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
    expect(result.action).toBe("triage");
    if (result.action === "triage") {
      expect(result.baseBranch).toBe("");
      const steps = result.triage.instructions.join("\n");
      expect(steps).toContain(
        "gh pr view https://github.com/owner/repo/pull/42 --json baseRefName",
      );
      expect(steps).not.toContain("rm -rf");
    }
  });
});
