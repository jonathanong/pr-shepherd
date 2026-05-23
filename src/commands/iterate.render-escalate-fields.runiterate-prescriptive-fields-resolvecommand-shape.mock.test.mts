import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  NOW,
  makeOpts,
  makeReport,
  mockExecFile,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "./iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

// THREAD fixture reused across prescriptive-fields tests in this file.
const THREAD = {
  id: "thread-1",
  isResolved: false,
  isOutdated: false,
  isMinimized: false,
  path: "src/foo.mts",
  line: 10,
  startLine: null,
  author: "reviewer",
  authorType: "User" as const,
  body: "Fix this",
  url: "",
  createdAtUnix: NOW - 3600,
};

describe("runIterate — prescriptive fields: resolveCommand shape", () => {
  it("resolveCommand includes thread IDs and comment IDs with $HEAD_SHA flag", async () => {
    const thread = { ...THREAD };
    const comment = {
      id: "c-1",
      isMinimized: false,
      author: "reviewer",
      authorType: "Bot" as const,
      body: "Fix the types here",
      url: "",
      createdAtUnix: NOW,
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
        comments: { actionable: [comment], firstLook: [] },
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
      if (cmd === "gh" && args[1] === "view")
        return Promise.resolve({ stdout: "main\n", stderr: "" });
      return Promise.resolve({ stdout: "", stderr: "" });
    });

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      const { resolveCommand } = result.fix;
      expect(resolveCommand.argv).toContain("--reply-thread-ids");
      expect(resolveCommand.argv.join(" ")).toContain("thread-1");
      expect(resolveCommand.argv).toContain("--minimize-comment-ids");
      expect(resolveCommand.argv.join(" ")).toContain("c-1");
      expect(resolveCommand.requiresHeadSha).toBe(true);
      expect(resolveCommand.requiresDismissMessage).toBe(true);
    }
  });

  it("resolveCommand does not include dismiss-review-ids when changesRequested", async () => {
    const review = {
      id: "r-1",
      author: "reviewer",
      authorType: "Unknown" as const,
      body: "Please address the naming",
    };
    const thread = { ...THREAD };
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
        changesRequestedReviews: [review],
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
      if (cmd === "gh" && args[1] === "view")
        return Promise.resolve({ stdout: "main\n", stderr: "" });
      return Promise.resolve({ stdout: "", stderr: "" });
    });

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      const { resolveCommand } = result.fix;
      expect(resolveCommand.argv).not.toContain("--dismiss-review-ids");
      expect(resolveCommand.argv.join(" ")).not.toContain("r-1");
      expect(resolveCommand.argv).toContain("$DISMISS_MESSAGE");
      expect(resolveCommand.requiresDismissMessage).toBe(true);
    }
  });
});
