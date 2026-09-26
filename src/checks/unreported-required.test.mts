import { describe, expect, it } from "vitest";
import {
  actionsWorkflowInProgress,
  reportedCheckNames,
  selectMergeTargetContexts,
  unreportedRequiredContexts,
} from "./unreported-required.mts";

describe("unreportedRequiredContexts", () => {
  it("keeps required names that have no check or status, in ruleset order", () => {
    const reported = reportedCheckNames([
      { name: "gitleaks" },
      { name: " gitleaks " },
      { name: "Label PRs" },
    ]);
    expect(
      unreportedRequiredContexts(["tests", "build", "gitleaks", "tests", " "], reported),
    ).toEqual(["tests", "build"]);
  });

  it("treats a cancelled run of the same name as reported", () => {
    expect(
      unreportedRequiredContexts(["gitleaks"], reportedCheckNames([{ name: "gitleaks" }])),
    ).toEqual([]);
  });
});

describe("actionsWorkflowInProgress", () => {
  const events = new Set(["pull_request", "pull_request_target"]);

  it("ignores a queued suite that has no workflow run", () => {
    expect(
      actionsWorkflowInProgress(
        [{ status: "QUEUED", conclusion: null, workflowRun: null }],
        events,
      ),
    ).toBe(false);
  });

  it("treats an unfinished relevant workflow as running", () => {
    expect(
      actionsWorkflowInProgress(
        [{ status: "IN_PROGRESS", conclusion: null, workflowRun: { event: "pull_request" } }],
        events,
      ),
    ).toBe(true);
    expect(
      actionsWorkflowInProgress(
        [{ status: "QUEUED", conclusion: null, workflowRun: { event: null } }],
        events,
      ),
    ).toBe(true);
  });

  it("ignores a completed workflow and an unrelated event", () => {
    expect(
      actionsWorkflowInProgress(
        [
          { status: "COMPLETED", conclusion: "SUCCESS", workflowRun: { event: "pull_request" } },
          { status: "IN_PROGRESS", conclusion: null, workflowRun: { event: "push" } },
          { status: null, conclusion: "SUCCESS", workflowRun: { event: "" } },
        ],
        events,
      ),
    ).toBe(false);
  });

  it("treats a suite with no status and no conclusion as running", () => {
    expect(
      actionsWorkflowInProgress(
        [{ status: null, conclusion: null, workflowRun: { event: "pull_request" } }],
        events,
      ),
    ).toBe(true);
  });
});

describe("selectMergeTargetContexts", () => {
  it("uses trunk contexts when the PR base is not the stack trunk", () => {
    expect(
      selectMergeTargetContexts({
        localContexts: [],
        trunkContexts: ["tests", "build"],
        baseRefName: "feature-parent",
        trunkRefName: "main",
      }),
    ).toEqual(["tests", "build"]);
  });

  it("keeps the PR base contexts when that base is the trunk", () => {
    expect(
      selectMergeTargetContexts({
        localContexts: ["tests", "build"],
        trunkContexts: ["other"],
        baseRefName: "main",
        trunkRefName: "main",
      }),
    ).toEqual(["tests", "build"]);
  });
});
