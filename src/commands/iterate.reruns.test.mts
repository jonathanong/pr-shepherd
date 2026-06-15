import { describe, expect, it } from "vitest";
import { makeReport } from "../../test-helpers/commands/iterate-test-support.mts";
import type { ClassifiedCheck, TriagedCheck } from "../types.mts";
import {
  buildAutoCancelRunIdsWithOptions,
  buildInProgressRunIds,
  buildRunProtection,
} from "./iterate/helpers.mts";

function failingCheck(overrides: Partial<TriagedCheck>): TriagedCheck {
  return {
    name: "tests",
    status: "COMPLETED",
    conclusion: "FAILURE",
    detailsUrl: "https://example.test/checks/1",
    event: "pull_request",
    runId: "run-tests",
    category: "failing",
    ...overrides,
  };
}

function inProgressCheck(overrides: Partial<ClassifiedCheck>): ClassifiedCheck {
  return {
    name: "tests",
    status: "IN_PROGRESS",
    conclusion: null,
    detailsUrl: "https://example.test/checks/2",
    event: "pull_request",
    runId: "run-tests",
    category: "in_progress",
    ...overrides,
  };
}

describe("buildRunProtection", () => {
  it("deduplicates a protected run while preserving check names and workflow name", () => {
    const protection = buildRunProtection(
      [
        failingCheck({
          name: "typecheck",
          runId: "run-ci",
        }),
        failingCheck({
          name: "lint",
          runId: "run-ci",
          workflowName: "CI",
        }),
        failingCheck({
          name: "lint",
          runId: "run-ci",
          workflowName: "CI",
        }),
      ],
      ["lint", "typecheck"],
    );

    expect([...protection.protectedRunIds]).toEqual(["run-ci"]);
    expect(protection.protectedRuns).toEqual([
      {
        runId: "run-ci",
        matchedPattern: "typecheck",
        checkNames: ["typecheck", "lint"],
        workflowName: "CI",
      },
    ]);
  });

  it("matches workflow, job, and check names case-insensitively", () => {
    const protection = buildRunProtection(
      [
        failingCheck({
          name: "style",
          runId: "run-workflow",
          workflowName: "Final Code Review",
        }),
        failingCheck({
          name: "reviewdog",
          runId: "run-job",
          jobName: "Final Code Review job",
        }),
        failingCheck({
          name: "FINAL CODE REVIEW",
          runId: "run-check",
        }),
      ],
      ["*final code review*"],
    );

    expect([...protection.protectedRunIds]).toEqual(["run-workflow", "run-job", "run-check"]);
  });

  it("ignores null run ids, blank candidates, and non-matching checks", () => {
    const protection = buildRunProtection(
      [
        failingCheck({
          name: "tests",
          runId: null,
          workflowName: "Final Code Review",
        }),
        failingCheck({
          name: "tests",
          runId: "run-tests",
          workflowName: "   ",
          jobName: "",
        }),
      ],
      ["final code review"],
    );

    expect(protection.protectedRuns).toEqual([]);
    expect([...protection.protectedRunIds]).toEqual([]);
  });
});

describe("protected run filtering", () => {
  it("excludes protected runs from automatic cancellation and in-progress instructions", () => {
    const protectedRunIds = new Set(["run-final-review"]);
    const baseReport = makeReport();
    const shepherdReport = makeReport({
      checks: {
        ...baseReport.checks,
        passing: [],
        failing: [
          failingCheck({ name: "unit", runId: "run-unit" }),
          failingCheck({ name: "Final Code Review", runId: "run-final-review" }),
        ],
        inProgress: [
          inProgressCheck({ name: "integration", runId: "run-integration" }),
          inProgressCheck({ name: "Final Code Review", runId: "run-final-review" }),
        ],
      },
    });

    expect(buildAutoCancelRunIdsWithOptions(shepherdReport, { protectedRunIds })).toEqual([
      "run-unit",
    ]);
    expect(buildInProgressRunIds(shepherdReport, new Set(), { protectedRunIds })).toEqual([
      "run-integration",
    ]);
  });
});
