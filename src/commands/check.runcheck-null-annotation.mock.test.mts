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
} from "../../test-helpers/commands/check.test-support.mts";
import { NullAnnotationNodeError } from "../github/check-annotation-pages.mts";
import { runCheck } from "./check.mts";
import type { CheckAnnotation } from "../types.mts";

registerHooks();

const note: CheckAnnotation = {
  id: "check_annotation_1",
  path: "src/a.mts",
  startLine: 1,
  endLine: 1,
  level: "WARNING",
  message: "note",
};

function neutralCheckWithAnnotations(): void {
  mockFetchPrBatch.mockResolvedValue({
    data: makeBatchData({
      checks: [
        makeCheck({
          id: "CR_neutral",
          conclusion: "NEUTRAL",
          category: "skipped",
          hasAnnotations: true,
          annotationCount: 1,
        }),
      ],
    }),
  });
}

describe("runCheck — null annotation entry", () => {
  it("holds READY and still surfaces the readable entries, then reaches READY on a clean page", async () => {
    neutralCheckWithAnnotations();
    mockLoadSeenMap.mockResolvedValue(new Map());
    mockFetchCheckRunAnnotationsBatch.mockResolvedValue({
      annotations: new Map(),
      failures: [
        { checkRunId: "CR_neutral", error: new NullAnnotationNodeError("CR_neutral", [note]) },
      ],
    });

    const held = await runCheck(BASE_OPTS);

    expect(held.status).toBe("PENDING");
    expect(held.checks.skipped[0]?.annotations).toEqual([
      expect.objectContaining({ id: "check_annotation_1" }),
    ]);

    // The next tick reads a clean page and the annotation was already seen.
    mockLoadSeenMap.mockResolvedValue(new Map([["check_annotation_1", { seenAt: 1 }]]));
    mockFetchCheckRunAnnotationsBatch.mockResolvedValue(annotationBatch("CR_neutral", [note]));

    const clean = await runCheck(BASE_OPTS);

    expect(clean.status).toBe("READY");
  });

  it("does not hold READY for an ordinary annotation fetch failure", async () => {
    neutralCheckWithAnnotations();
    mockLoadSeenMap.mockResolvedValue(new Map());
    mockFetchCheckRunAnnotationsBatch.mockResolvedValue({
      annotations: new Map(),
      failures: [{ checkRunId: "CR_neutral", error: new Error("boom") }],
    });

    const report = await runCheck(BASE_OPTS);

    expect(report.status).toBe("READY");
  });
});
