import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeCheck,
  mockFetchCheckRunAnnotations,
  mockFetchPrBatch,
  mockLoadSeenMap,
  mockMarkSeen,
} from "../../test-helpers/commands/check.test-support.mts";
import { runCheck } from "./check.mts";

registerHooks();

describe("runCheck — check annotations", () => {
  it("surfaces unseen annotations on failing checks without marking them seen before output projection", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        checks: [
          makeCheck({
            id: "CR_fail",
            name: "SonarCloud Code Analysis",
            conclusion: "FAILURE",
            category: "failing",
            hasAnnotations: true,
          }),
        ],
      }),
    });
    mockLoadSeenMap.mockResolvedValue(new Map());
    mockFetchCheckRunAnnotations.mockResolvedValue([
      {
        id: "check_annotation_123",
        path: "src/cli/default-poll.mts",
        startLine: 36,
        endLine: 36,
        level: "WARNING",
        title: "This assertion is unnecessary",
        message: "Remove the assertion.",
        blobUrl: "https://github.example/blob",
      },
    ]);

    const report = await runCheck(BASE_OPTS);

    expect(report.checks.failing[0]?.annotations).toEqual([
      expect.objectContaining({ id: "check_annotation_123" }),
    ]);
    expect(mockFetchCheckRunAnnotations).toHaveBeenCalledWith("CR_fail");
    expect(mockMarkSeen).not.toHaveBeenCalledWith(
      expect.any(Object),
      "check_annotation_123",
      expect.anything(),
    );
  });

  it("suppresses already-seen annotations", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        checks: [
          makeCheck({
            id: "CR_fail",
            conclusion: "FAILURE",
            category: "failing",
            hasAnnotations: true,
          }),
        ],
      }),
    });
    mockLoadSeenMap.mockResolvedValue(new Map([["check_annotation_123", { seenAt: 1000 }]]));
    mockFetchCheckRunAnnotations.mockResolvedValue([
      {
        id: "check_annotation_123",
        path: "src/foo.mts",
        startLine: 1,
        endLine: 1,
        level: "WARNING",
        message: "Already seen.",
      },
    ]);

    const report = await runCheck(BASE_OPTS);

    expect(report.checks.failing[0]?.annotations).toBeUndefined();
    expect(mockMarkSeen).not.toHaveBeenCalledWith(
      expect.any(Object),
      "check_annotation_123",
      expect.anything(),
    );
  });

  it("does not fetch annotations for passing checks without a probe hit", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        checks: [makeCheck({ id: "CR_pass", conclusion: "SUCCESS", category: "passed" })],
      }),
    });

    await runCheck(BASE_OPTS);

    expect(mockFetchCheckRunAnnotations).not.toHaveBeenCalled();
  });

  it("surfaces unseen annotations on passing checks with a probe hit", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        checks: [
          makeCheck({
            id: "CR_pass",
            name: "SonarCloud Code Analysis",
            conclusion: "SUCCESS",
            category: "passed",
            hasAnnotations: true,
          }),
        ],
      }),
    });
    mockFetchCheckRunAnnotations.mockResolvedValue([
      {
        id: "check_annotation_lua",
        path: "scripts/instrument-lua.cjs",
        startLine: 30,
        endLine: 30,
        level: "WARNING",
        title: 'Remove this assignment of "i".',
        message: "See more on https://sonarcloud.io",
      },
    ]);

    const report = await runCheck(BASE_OPTS);

    expect(report.checks.passing[0]?.annotations).toEqual([
      expect.objectContaining({ id: "check_annotation_lua", path: "scripts/instrument-lua.cjs" }),
    ]);
    expect(mockFetchCheckRunAnnotations).toHaveBeenCalledWith("CR_pass");
  });

  it("surfaces unseen annotations on skipped checks with a probe hit", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        checks: [
          makeCheck({
            id: "CR_skip",
            conclusion: "NEUTRAL",
            category: "skipped",
            hasAnnotations: true,
          }),
        ],
      }),
    });
    mockFetchCheckRunAnnotations.mockResolvedValue([
      {
        id: "check_annotation_skip",
        path: "src/a.mts",
        startLine: 1,
        endLine: 1,
        level: "NOTICE",
        message: "note",
      },
    ]);

    const report = await runCheck(BASE_OPTS);

    expect(report.checks.skipped[0]?.annotations?.[0]?.id).toBe("check_annotation_skip");
  });

  it("keeps the failing check when annotation fetch fails", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        checks: [
          makeCheck({
            id: "CR_fail",
            conclusion: "FAILURE",
            category: "failing",
            hasAnnotations: true,
          }),
        ],
      }),
    });
    mockFetchCheckRunAnnotations.mockRejectedValueOnce(new Error("secondary rate limit"));

    const report = await runCheck(BASE_OPTS);

    expect(report.checks.failing).toHaveLength(1);
    expect(report.checks.failing[0]?.annotations).toBeUndefined();
  });
});
