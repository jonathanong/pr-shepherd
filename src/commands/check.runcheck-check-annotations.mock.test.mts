import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeCheck,
  annotationBatch,
  mockFetchCheckRunAnnotationsBatch,
  mockFetchPrBatch,
  mockLoadSeenMap,
  mockMarkSeen,
} from "../../test-helpers/commands/check.test-support.mts";
import { runCheck } from "./check.mts";
import type { CheckAnnotation, ClassifiedCheck } from "../types.mts";

registerHooks();

const cacheOpts = {
  stateKey: { owner: "owner", repo: "repo", pr: 42 },
  headSha: "abc123",
};

function batchWith(check: Partial<ClassifiedCheck>) {
  mockFetchPrBatch.mockResolvedValue({
    data: makeBatchData({ checks: [makeCheck(check)] }),
  });
}

function note(id: string, extra: Partial<CheckAnnotation> = {}): CheckAnnotation {
  return {
    id,
    path: "src/a.mts",
    startLine: 1,
    endLine: 1,
    level: "WARNING",
    message: "note",
    ...extra,
  };
}

describe("runCheck — check annotations", () => {
  it("surfaces unseen annotations on failing checks without marking them seen before output projection", async () => {
    batchWith({
      id: "CR_fail",
      name: "SonarCloud Code Analysis",
      conclusion: "FAILURE",
      category: "failing",
      hasAnnotations: true,
    });
    mockLoadSeenMap.mockResolvedValue(new Map());
    mockFetchCheckRunAnnotationsBatch.mockResolvedValue(
      annotationBatch("CR_fail", [
        note("check_annotation_123", {
          path: "src/cli/default-poll.mts",
          startLine: 36,
          endLine: 36,
          title: "This assertion is unnecessary",
          message: "Remove the assertion.",
          blobUrl: "https://github.example/blob",
        }),
      ]),
    );

    const report = await runCheck(BASE_OPTS);

    expect(report.checks.failing[0]?.annotations).toEqual([
      expect.objectContaining({ id: "check_annotation_123" }),
    ]);
    expect(mockFetchCheckRunAnnotationsBatch).toHaveBeenCalledWith(["CR_fail"], cacheOpts);
    expect(mockMarkSeen).not.toHaveBeenCalledWith(
      expect.any(Object),
      "check_annotation_123",
      expect.anything(),
    );
  });

  it("suppresses already-seen annotations", async () => {
    batchWith({
      id: "CR_fail",
      conclusion: "FAILURE",
      category: "failing",
      hasAnnotations: true,
    });
    mockLoadSeenMap.mockResolvedValue(new Map([["check_annotation_123", { seenAt: 1000 }]]));
    mockFetchCheckRunAnnotationsBatch.mockResolvedValue(
      annotationBatch("CR_fail", [note("check_annotation_123", { message: "Already seen." })]),
    );

    const report = await runCheck(BASE_OPTS);

    expect(report.checks.failing[0]?.annotations).toBeUndefined();
    expect(mockMarkSeen).not.toHaveBeenCalledWith(
      expect.any(Object),
      "check_annotation_123",
      expect.anything(),
    );
  });

  it("does not fetch annotations for passing checks without a probe hit", async () => {
    batchWith({ id: "CR_pass", conclusion: "SUCCESS", category: "passed" });

    await runCheck(BASE_OPTS);

    expect(mockFetchCheckRunAnnotationsBatch).not.toHaveBeenCalled();
  });

  it("surfaces unseen annotations on passing checks with a probe hit", async () => {
    batchWith({
      id: "CR_pass",
      name: "SonarCloud Code Analysis",
      conclusion: "SUCCESS",
      category: "passed",
      hasAnnotations: true,
    });
    mockFetchCheckRunAnnotationsBatch.mockResolvedValue(
      annotationBatch("CR_pass", [
        note("check_annotation_lua", {
          path: "scripts/instrument-lua.cjs",
          startLine: 30,
          endLine: 30,
          title: 'Remove this assignment of "i".',
          message: "See more on https://sonarcloud.io",
        }),
      ]),
    );

    const report = await runCheck(BASE_OPTS);

    expect(report.checks.passing[0]?.annotations).toEqual([
      expect.objectContaining({ id: "check_annotation_lua", path: "scripts/instrument-lua.cjs" }),
    ]);
    expect(mockFetchCheckRunAnnotationsBatch).toHaveBeenCalledWith(["CR_pass"], cacheOpts);
    expect(mockMarkSeen).toHaveBeenCalledWith(
      expect.any(Object),
      "check_annotation_lua",
      expect.any(String),
    );
  });

  it("surfaces unseen annotations on skipped checks with a probe hit", async () => {
    batchWith({
      id: "CR_skip",
      conclusion: "NEUTRAL",
      category: "skipped",
      hasAnnotations: true,
    });
    mockFetchCheckRunAnnotationsBatch.mockResolvedValue(
      annotationBatch("CR_skip", [note("check_annotation_skip", { level: "NOTICE" })]),
    );

    const report = await runCheck(BASE_OPTS);

    expect(report.checks.skipped[0]?.annotations?.[0]?.id).toBe("check_annotation_skip");
  });

  it("keeps the failing check when annotation fetch fails", async () => {
    batchWith({
      id: "CR_fail",
      conclusion: "FAILURE",
      category: "failing",
      hasAnnotations: true,
    });
    mockFetchCheckRunAnnotationsBatch.mockRejectedValueOnce(new Error("secondary rate limit"));

    const report = await runCheck(BASE_OPTS);

    expect(report.checks.failing).toHaveLength(1);
    expect(report.checks.failing[0]?.annotations).toBeUndefined();
  });
});
