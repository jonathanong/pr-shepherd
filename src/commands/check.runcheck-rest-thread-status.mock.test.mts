import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  mockFetchPrBatch,
  makeThread,
} from "../../test-helpers/commands/check.test-support.mts";
import { EMPTY_BRANCH_RULES } from "../github/batch-parsers-rules.mts";
import { runCheck } from "./check.mts";
import { runWithGithubTransport } from "../github/transport.mts";

registerHooks();

const unknownStatusBatch = (
  mergeStateStatus: "CLEAN" | "BLOCKED",
  requiresConversationResolution: boolean,
) =>
  makeBatchData({
    transport: "rest",
    mergeStateStatus,
    branchRules: { ...EMPTY_BRANCH_RULES, requiresConversationResolution },
    transportUnavailable: [
      { field: "reviewThreads.status", reason: "CCR status route unavailable" },
    ],
    reviewThreads: [
      makeThread({
        id: "rest-thread-100",
        isResolved: undefined,
        isOutdated: undefined,
        viewerCanReply: undefined,
        viewerCanResolve: undefined,
        comments: [],
      }),
    ],
  });
const check = () => runWithGithubTransport("rest", () => runCheck(BASE_OPTS));

describe("runCheck — REST thread status unknown", () => {
  it("stays READY when CLEAN proves required conversation resolution, still surfacing the thread", async () => {
    mockFetchPrBatch.mockResolvedValue({ data: unknownStatusBatch("CLEAN", true) });
    const report = await check();
    expect(report.status).toBe("READY");
    expect(report.threads.firstLook).toMatchObject([
      { id: "rest-thread-100", firstLookStatus: "unknown" },
    ]);
  });

  it("is UNKNOWN when conversation resolution is not required", async () => {
    mockFetchPrBatch.mockResolvedValue({ data: unknownStatusBatch("CLEAN", false) });
    expect((await check()).status).toBe("UNKNOWN");
  });

  it("is never READY when GitHub does not report CLEAN", async () => {
    mockFetchPrBatch.mockResolvedValue({ data: unknownStatusBatch("BLOCKED", true) });
    expect((await check()).status).not.toBe("READY");
  });
});
