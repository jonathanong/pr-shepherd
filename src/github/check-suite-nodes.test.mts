import { describe, expect, it } from "vitest";
import { makeRawPr } from "../../test-helpers/github/batch-fixtures.mts";
import { parseCheckSuitesComplete } from "./batch-parse-suites.mts";
import { requireRawPr } from "./batch-response.mts";
import type { RawBatchResponse } from "./batch-raw-types.mts";
import { dropUnreadableSuites } from "./check-suite-nodes.mts";
import { fingerprintFromRaw } from "./fingerprint.mts";

const repo = { owner: "owner", name: "repo" };
const queued = (id: string) => ({
  id,
  status: "QUEUED",
  conclusion: null,
  app: null,
  workflowRun: null,
});

describe("dropUnreadableSuites", () => {
  it("drops null suites and marks the page as not fully read", () => {
    const commit = {
      checkSuites: { pageInfo: { hasNextPage: false }, nodes: [queued("a"), null, queued("b")] },
    };
    dropUnreadableSuites(commit);
    expect(commit.checkSuites.nodes.map((node) => node?.id)).toEqual(["a", "b"]);
    expect(commit.checkSuites.pageInfo.hasNextPage).toBe(true);
  });

  it("marks a page that carried no page info", () => {
    const commit = { checkSuites: { nodes: [null] } };
    dropUnreadableSuites(commit);
    expect(commit.checkSuites).toEqual({ nodes: [], pageInfo: { hasNextPage: true } });
  });

  it("leaves readable suites and missing data untouched", () => {
    const suites = { pageInfo: { hasNextPage: false }, nodes: [queued("a")] };
    dropUnreadableSuites({ checkSuites: suites });
    expect(suites).toEqual({ pageInfo: { hasNextPage: false }, nodes: [queued("a")] });
    expect(() => dropUnreadableSuites({ checkSuites: null })).not.toThrow();
    expect(() => dropUnreadableSuites({})).not.toThrow();
    expect(() => dropUnreadableSuites(undefined)).not.toThrow();
  });
});

describe("a head commit with null check suites (a PR's first seconds)", () => {
  const response = (): RawBatchResponse =>
    ({
      repository: {
        pullRequest: makeRawPr({
          commits: {
            totalCount: 1,
            nodes: [
              {
                commit: {
                  oid: "abc123",
                  statusCheckRollup: null,
                  checkSuites: {
                    pageInfo: { hasNextPage: false },
                    nodes: [queued("CS_1"), null, null],
                  },
                },
              },
            ],
          },
        }),
      },
    }) as unknown as RawBatchResponse;

  it("fingerprints the readable suites and reports the page incomplete", () => {
    const raw = requireRawPr(response(), 42, repo);
    expect(fingerprintFromRaw(raw)).toMatchObject({
      checkSuiteConclusions: "CS_1:QUEUED:",
      checkSuitesComplete: false,
    });
    expect(parseCheckSuitesComplete(raw)).toBe(false);
  });
});
