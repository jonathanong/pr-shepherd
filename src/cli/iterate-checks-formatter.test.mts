import { describe, expect, it } from "vitest";
import { formatRelevantChecks } from "./iterate-checks-formatter.mts";
import type { RelevantCheck } from "../types.mts";

describe("formatRelevantChecks — annotations", () => {
  it("omits the annotations sub-list when every annotation is a bare exit-code message", () => {
    const checks: RelevantCheck[] = [
      {
        name: "build",
        conclusion: "FAILURE",
        runId: "1",
        detailsUrl: null,
        annotations: [
          {
            id: "check_annotation_a",
            path: ".github",
            startLine: 18,
            endLine: 18,
            level: "FAILURE",
            message: "Process completed with exit code 1.",
          },
        ],
      },
    ];

    const output = formatRelevantChecks(checks);

    expect(output).not.toContain("- annotations:");
  });

  it("suppresses an annotation body that duplicates the check's own log excerpt", () => {
    const checks: RelevantCheck[] = [
      {
        name: "tests",
        conclusion: "FAILURE",
        runId: "1",
        detailsUrl: null,
        logExcerpt: "AssertionError: expected undefined to be defined",
        annotations: [
          {
            id: "check_annotation_dup",
            path: "src/foo.test.mts",
            startLine: 102,
            endLine: 102,
            level: "FAILURE",
            message: "AssertionError: expected undefined to be defined",
          },
        ],
      },
    ];

    const output = formatRelevantChecks(checks);

    expect(output).toContain("check_annotation_dup");
    expect(output?.split("AssertionError").length).toBe(2);
  });
});
