import { describe, expect, it } from "vitest";
import type { ElsewhereRun } from "../types/workflow-elsewhere.mts";
import { normalizeAnnotationMessage, stampSameJob } from "./workflow-elsewhere-parse.mts";

describe("normalizeAnnotationMessage & stampSameJob", () => {
  it("collapses whitespace, truncates long messages, and stamps exact-name job matches", () => {
    expect(normalizeAnnotationMessage("  line1\n\tline2  ")).toBe("line1 line2");
    expect(normalizeAnnotationMessage(null)).toBe("");
    const out = normalizeAnnotationMessage("a".repeat(300));
    expect(out.length).toBe(240);
    expect(out.endsWith("…")).toBe(true);
    const runs: ElsewhereRun[] = [
      {
        source: "default-branch",
        branch: "main",
        headSha: "1111111",
        runId: "1",
        conclusion: "FAILURE",
        completedAt: "2024-05-15T14:00:00Z",
        failedJobs: [
          { name: "test (3/4)", conclusion: "FAILURE", annotations: [] },
          { name: "test (1/4)", conclusion: "TIMED_OUT", annotations: [] },
        ],
      },
    ];
    expect(stampSameJob(runs, "test (3/4)")[0]!.failedJobs[0]!.sameJob).toBe(true);
    expect(runs[0]!.failedJobs[0]!.sameJob).toBeUndefined();
  });
});
