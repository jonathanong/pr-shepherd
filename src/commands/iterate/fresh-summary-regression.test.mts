import { describe, expect, it } from "vitest";
import type { RawSummaryPr } from "../../github/poll-summary-raw.mts";
import { summarizePollSummaryChecks } from "../../github/poll-summary-checks.mts";
import { applyPendingWorkflowSuites } from "../../github/poll-summary-unreported.mts";
import { freshSummaryRegression } from "./fresh-summary-regression.mts";

const raw = (mergeStateStatus: string) => ({ mergeStateStatus }) as RawSummaryPr;

/** The compact summary exactly as the real reader shapes it, with the real check projection. */
function summaryRaw(mergeStateStatus: string, rollup: unknown, suites: unknown[]): RawSummaryPr {
  return {
    mergeStateStatus,
    commits: {
      nodes: [
        {
          commit: {
            oid: "head-1",
            statusCheckRollup: rollup,
            checkSuites: { pageInfo: { hasNextPage: false }, nodes: suites },
          },
        },
      ],
    },
  } as unknown as RawSummaryPr;
}

const queuedRun = (name: string) => ({
  __typename: "CheckRun",
  id: `CR_${name}`,
  name,
  status: "QUEUED",
  conclusion: null,
  detailsUrl: "",
  checkSuite: {
    status: "QUEUED",
    workflowRun: { event: "pull_request", databaseId: 9, workflow: { name: "CI" } },
  },
});
const thirdParty = (slug: string) => ({
  id: `CS_${slug}`,
  status: "QUEUED",
  conclusion: null,
  app: { slug },
  workflowRun: null,
});

describe("freshSummaryRegression", () => {
  it("is undefined when nothing contradicts the report", () => {
    expect(freshSummaryRegression(raw("CLEAN"), { passing: 2 }, "CLEAN")).toBeUndefined();
    // UNSTABLE that the report already saw (ignored checks) is not a change.
    expect(freshSummaryRegression(raw("UNSTABLE"), {}, "UNSTABLE")).toBeUndefined();
    // A change to BLOCKED or a transient UNKNOWN is left to the next full check.
    expect(freshSummaryRegression(raw("BLOCKED"), {}, "CLEAN")).toBeUndefined();
    expect(freshSummaryRegression(raw("UNKNOWN"), {}, "CLEAN")).toBeUndefined();
  });

  it("leaves failing and unreported checks to the next full check", () => {
    expect(freshSummaryRegression(raw("CLEAN"), { failing: 1 }, "CLEAN")).toBeUndefined();
    expect(
      freshSummaryRegression(raw("CLEAN"), { unreportedRequired: ["ci"] }, "CLEAN"),
    ).toBeUndefined();
  });

  it("names each kind of contradicting evidence", () => {
    expect(freshSummaryRegression(raw("CLEAN"), { inProgress: 1 }, "CLEAN")).toMatch(/queued/);
    expect(
      freshSummaryRegression(raw("CLEAN"), { actionsWorkflowInProgress: true }, "CLEAN"),
    ).toMatch(/Actions workflow/);
    expect(freshSummaryRegression(raw("DIRTY"), {}, "CLEAN")).toMatch(/changed to DIRTY/);
    expect(freshSummaryRegression(raw("BEHIND"), {}, "CLEAN")).toMatch(/changed to BEHIND/);
  });

  it("ignores a running Actions suite once a relevant check exists", () => {
    expect(
      freshSummaryRegression(
        raw("CLEAN"),
        { actionsWorkflowInProgress: true, passing: 1 },
        "CLEAN",
      ),
    ).toBeUndefined();
  });
});

describe("freshSummaryRegression on issue 815 data through the real summary projection", () => {
  it("PR 54: UNSTABLE with two QUEUED pull_request check runs", () => {
    const pr = summaryRaw(
      "UNSTABLE",
      {
        state: "PENDING",
        contexts: {
          pageInfo: { hasPreviousPage: false },
          nodes: [queuedRun("ci"), queuedRun("lint")],
        },
      },
      [{ id: "CS_ci", status: "QUEUED", conclusion: null, app: { slug: "github-actions" } }],
    );
    const checks = summarizePollSummaryChecks(pr);
    expect(checks.inProgress).toBe(2);
    expect(freshSummaryRegression(pr, checks, "CLEAN")).toMatch(/queued or in progress/);
  });

  it("PR 53: a null rollup with only queued third-party suites stays unflagged here", () => {
    const pr = summaryRaw("CLEAN", null, [thirdParty("codecov"), thirdParty("coderabbitai")]);
    const checks = summarizePollSummaryChecks(pr);
    applyPendingWorkflowSuites(pr, checks);
    expect(freshSummaryRegression(pr, checks, "CLEAN")).toBeUndefined();
  });

  it("a queued Actions suite with no run and no check run counts as running", () => {
    const pr = summaryRaw("CLEAN", null, [
      thirdParty("codecov"),
      { ...thirdParty("github-actions") },
    ]);
    const checks = summarizePollSummaryChecks(pr);
    applyPendingWorkflowSuites(pr, checks);
    expect(freshSummaryRegression(pr, checks, "CLEAN")).toMatch(/Actions workflow/);
  });
});
