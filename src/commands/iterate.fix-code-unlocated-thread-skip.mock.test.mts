import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  NOW,
  makeOpts,
  makeReport,
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
  it("surfaces a thread with no file/line without escalating or recommending a mutation", async () => {
    const threadNoPath = { ...THREAD, id: "thread-noloc", path: null, line: null };
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
    expect(result.fix.resolveCommand.hasMutations).toBe(false);
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
});
