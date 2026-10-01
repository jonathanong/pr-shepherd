import { describe, expect, it } from "vitest";
import { renderRelatedJobLines } from "./related-jobs-format.mts";
import { formatIterateResult } from "./iterate-formatter.mts";
import { formatRelevantChecks } from "./iterate-checks-formatter.mts";
import { buildEscalateHumanMessage } from "../commands/iterate/escalate.mts";
import { makeIterateResult } from "../../fixtures/cli-parser.iterate-fixtures.mts";
import type { RelatedFailedJob } from "../types/check-classification.mts";
import type { IterateResult } from "../types.mts";

const related: RelatedFailedJob[] = [
  { name: "test-a", conclusion: "FAILURE", failedStep: "Run tests", logExcerpt: "boom\nbang" },
  { name: "test-b", conclusion: "TIMED_OUT" },
];

describe("renderRelatedJobLines", () => {
  it("renders nothing without related jobs", () => {
    expect(renderRelatedJobLines(undefined)).toEqual([]);
    expect(renderRelatedJobLines([])).toEqual([]);
  });

  it("renders name, conclusion, failed step and log tail", () => {
    expect(renderRelatedJobLines(related)).toEqual([
      "  Other failed jobs in this run:",
      "  - `test-a` [conclusion: FAILURE]",
      "    > failed step: Run tests",
      "    > boom",
      "    > bang",
      "  - `test-b` [conclusion: TIMED_OUT]",
    ]);
  });
});

describe("related jobs in check renderers", () => {
  it("renders under a fix_code failing check", () => {
    const result: IterateResult = { ...makeIterateResult("fix_code") };
    if (result.action !== "fix_code") throw new Error("expected fix_code fixture");
    result.fix.checks = [
      {
        name: "gate",
        runId: "9",
        detailsUrl: "https://github.com/owner/repo/actions/runs/9",
        conclusion: "FAILURE",
        relatedJobs: related,
      },
    ];
    const output = formatIterateResult(result);
    expect(output).toContain(
      "  Other failed jobs in this run:\n  - `test-a` [conclusion: FAILURE]",
    );
    expect(output).toContain("    > boom");
  });

  it("renders under a relevant check", () => {
    const output = formatRelevantChecks([
      { name: "gate", conclusion: "FAILURE", runId: "9", detailsUrl: null, relatedJobs: related },
    ]);
    expect(output).toContain("  - `test-b` [conclusion: TIMED_OUT]");
  });

  it("renders under an escalate check", () => {
    const message = buildEscalateHumanMessage(
      {
        triggers: ["ci-failure"] as never,
        suggestion: "s",
        unresolvedThreads: [],
        ambiguousComments: [],
        changesRequestedReviews: [],
        checks: [
          {
            name: "gate",
            runId: "9",
            detailsUrl: null,
            conclusion: "FAILURE",
            relatedJobs: related,
          },
        ],
      },
      1,
    );
    expect(message).toContain("Other failed jobs in this run:");
    expect(message).toContain("> failed step: Run tests");
  });
});
