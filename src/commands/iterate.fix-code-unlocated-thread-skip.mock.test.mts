import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  NOW,
  makeOpts,
  makeReport,
  defaultConfig,
  mockLoadConfig,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

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

describe("runIterate — unlocated review threads", () => {
  it("emits a no-SHA resolve mutation for an outdated bot thread without a line", async () => {
    const outdatedBot = {
      ...THREAD,
      id: "thread-outdated-bot",
      isOutdated: true,
      author: "chatgpt-codex-connector",
      authorType: "Bot" as const,
      path: "src/old.mts",
      line: null,
      viewerCanResolve: true,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        baseBranch: "",
        status: "PENDING",
        mergeStatus: {
          ...makeReport().mergeStatus,
          status: "BLOCKED",
          mergeStateStatus: "BLOCKED",
        },
        threads: { ...makeReport().threads, resolutionOnly: [outdatedBot] },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;
    expect(result.fix.resolutionOnlyThreads).toEqual([
      expect.objectContaining({ id: "thread-outdated-bot" }),
    ]);
    expect(result.fix.resolveCommand.resolveThreadIds).toEqual(["thread-outdated-bot"]);
    expect(result.fix.resolveCommand.replyThreadIds).toEqual(["thread-outdated-bot"]);
    expect(result.fix.resolveCommand.argv).toContain("--resolve-thread-ids");
    expect(result.fix.resolveCommand.argv).toContain("thread-outdated-bot");
    expect(result.fix.resolveCommand.argv).toContain("--reply-thread-ids");
    expect(result.fix.resolveCommand.requiresHeadSha).toBe(false);
    expect(result.fix.resolveCommand.requiresDismissMessage).toBe(true);
  });

  it("emits reply-and-resolve for an outdated unlocated viewer-authored thread", async () => {
    const outdatedOwn = {
      ...THREAD,
      id: "thread-outdated-own",
      isOutdated: true,
      author: "alice",
      authorType: "User" as const,
      viewerDidAuthor: true as const,
      path: "src/old.mts",
      line: null,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: { ...makeReport().threads, resolutionOnly: [outdatedOwn] },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;
    expect(result.fix.resolveCommand.replyThreadIds).toEqual(["thread-outdated-own"]);
    expect(result.fix.resolveCommand.resolveThreadIds).toEqual(["thread-outdated-own"]);
    expect(result.fix.resolveCommand.requiresHeadSha).toBe(false);
  });

  it("replies to an unlocated other-human thread without resolving it", async () => {
    const threadNoPath = {
      ...THREAD,
      id: "thread-noloc",
      path: null,
      line: null,
      authorType: "User" as const,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: { ...makeReport().threads, actionable: [threadNoPath] },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;
    expect(result.fix.threads).toEqual([expect.objectContaining({ id: "thread-noloc" })]);
    expect(result.fix.resolveCommand.replyThreadIds).toEqual(["thread-noloc"]);
    expect(result.fix.resolveCommand.resolveThreadIds).toBeUndefined();
    expect(result.fix.resolveCommand.hasMutations).toBe(true);
  });

  it("does not count a path-only thread toward fix thrash", async () => {
    const threadNoLine = { ...THREAD, id: "thread-noline", path: "src/foo.mts", line: null };
    let head = 0;
    mockRunCheck.mockImplementation(async () =>
      makeReport({
        headSha: `head-${head++}`,
        status: "UNRESOLVED_COMMENTS",
        threads: { ...makeReport().threads, actionable: [threadNoLine] },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const result = await runIterate(makeOpts());
      expect(result.action).toBe("fix_code");
    }
  });

  it("resolves an outdated unlocated other-human thread when the enum is outdated", async () => {
    mockLoadConfig.mockReturnValue({
      ...defaultConfig(),
      iterate: { ...defaultConfig().iterate, resolveOtherHumanThreads: "outdated" },
    });
    const outdated = {
      ...THREAD,
      id: "thread-outdated-human",
      isOutdated: true,
      authorType: "User" as const,
      path: "src/old.mts",
      line: null,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: { ...makeReport().threads, resolutionOnly: [outdated] },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;
    expect(result.fix.resolveCommand.replyThreadIds).toEqual(["thread-outdated-human"]);
    expect(result.fix.resolveCommand.resolveThreadIds).toEqual(["thread-outdated-human"]);
  });
});
