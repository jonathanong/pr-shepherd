import { describe, it, expect } from "vitest";
import { parseCheckSuitesComplete, parseSuiteStartupFailures } from "./batch-parse-suites.mts";
import type { RawPr } from "./batch-raw-types.mts";
import { makeRawPr } from "../../test-helpers/github/batch-fixtures.mts";

function withSuites(suites: NonNullable<RawPr["commits"]["nodes"][0]["commit"]["checkSuites"]>) {
  return makeRawPr({
    commits: {
      totalCount: 1,
      nodes: [{ commit: { committedDate: "2024-01-01T00:00:00Z", checkSuites: suites } }],
    },
  }) as unknown as RawPr;
}

describe("parseCheckSuitesComplete", () => {
  it("is false when checkSuites is missing", () => {
    expect(parseCheckSuitesComplete(makeRawPr() as unknown as RawPr)).toBe(false);
  });

  it("is true when the first page is complete", () => {
    expect(
      parseCheckSuitesComplete(withSuites({ pageInfo: { hasNextPage: false }, nodes: [] })),
    ).toBe(true);
  });

  it("is false when more suite pages remain", () => {
    expect(
      parseCheckSuitesComplete(withSuites({ pageInfo: { hasNextPage: true }, nodes: [] })),
    ).toBe(false);
  });
});

describe("parseSuiteStartupFailures", () => {
  it("maps STARTUP_FAILURE suites with a workflow run", () => {
    const raw = withSuites({
      pageInfo: { hasNextPage: false },
      nodes: [
        {
          conclusion: "STARTUP_FAILURE",
          workflowRun: {
            databaseId: 99,
            event: "pull_request",
            url: "https://github.com/o/r/actions/runs/99",
            workflow: { name: "CI" },
          },
        },
        { conclusion: "SUCCESS", workflowRun: null },
      ],
    });
    expect(parseSuiteStartupFailures(raw)).toEqual([
      {
        name: "CI",
        status: "COMPLETED",
        conclusion: "STARTUP_FAILURE",
        source: "startup_failure",
        detailsUrl: "https://github.com/o/r/actions/runs/99",
        event: "pull_request",
        runId: "99",
      },
    ]);
  });

  it("falls back when workflow name and databaseId are missing", () => {
    const raw = withSuites({
      pageInfo: { hasNextPage: false },
      nodes: [
        {
          conclusion: "STARTUP_FAILURE",
          workflowRun: {
            databaseId: null,
            event: "pull_request",
            url: null,
            workflow: { name: null },
          },
        },
      ],
    });
    expect(parseSuiteStartupFailures(raw)[0]).toMatchObject({
      name: "workflow run",
      runId: null,
      detailsUrl: "",
    });
  });

  it("names unnamed suites from the workflow run id", () => {
    const raw = withSuites({
      pageInfo: { hasNextPage: false },
      nodes: [
        {
          conclusion: "STARTUP_FAILURE",
          workflowRun: {
            databaseId: 7,
            event: "pull_request",
            url: "",
            workflow: { name: "  " },
          },
        },
      ],
    });
    expect(parseSuiteStartupFailures(raw)[0]!.name).toBe("workflow run 7");
  });
});
