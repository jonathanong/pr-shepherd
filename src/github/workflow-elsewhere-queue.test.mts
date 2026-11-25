import { describe, expect, it } from "vitest";
import {
  buildQueueCommitsQuery,
  mergeQueueCommitDetails,
  selectDefaultBranchRestRuns,
  selectOtherQueueRestRuns,
} from "./workflow-elsewhere-queue.mts";

const WINDOW_START = Date.parse("2024-05-15T12:00:00Z");

describe("selectOtherQueueRestRuns & selectDefaultBranchRestRuns", () => {
  it("parses PR numbers from standard and slashed queue branches, excludes current PR/run/commit, and caps at 3", () => {
    const out = selectOtherQueueRestRuns(
      [
        {
          id: 1,
          head_sha: "q-cur",
          head_branch: "gh-readonly-queue/main/pr-99-aaa",
          status: "completed",
          conclusion: "failure",
          created_at: "2024-05-15T13:00:00Z",
          updated_at: "2024-05-15T13:00:00Z",
        },
        {
          id: 2,
          head_sha: "s2",
          head_branch: "gh-readonly-queue/release/v2/pr-42-deadbeef",
          status: "completed",
          conclusion: "failure",
          created_at: "2024-05-15T13:00:00Z",
        },
        {
          id: 3,
          head_sha: "s3",
          head_branch: "gh-readonly-queue/main/pr-80-ccc",
          status: "in_progress",
          conclusion: null,
          created_at: "2024-05-15T13:00:00Z",
        },
        {
          id: 4,
          head_sha: "s4",
          head_branch: "gh-readonly-queue/main/pr-81-ddd",
          status: "completed",
          conclusion: "failure",
          created_at: "2024-05-15T11:00:00Z",
        },
        {
          id: 5,
          head_sha: "s5555555",
          head_branch: "gh-readonly-queue/release/v2/pr-82-eee",
          status: "completed",
          conclusion: "failure",
          created_at: "2024-05-15T13:10:00Z",
        },
        {
          id: 6,
          head_sha: "s6666666",
          head_branch: "gh-readonly-queue/main/pr-0-abc1234",
          status: "completed",
          conclusion: "success",
          created_at: "2024-05-15T14:00:00Z",
        },
        {
          id: 7,
          head_sha: "s7777777",
          head_branch: null,
          status: "completed",
          conclusion: "failure",
          created_at: "2024-05-15T14:10:00Z",
        },
      ],
      { prNumber: 42, currentRunId: "999", currentCommitOid: "q-cur", windowStartMs: WINDOW_START },
    );
    expect(out.map((r) => [r.runId, r.pr])).toEqual([
      ["7", undefined],
      ["6", undefined],
      ["5", 82],
    ]);

    const def = selectDefaultBranchRestRuns(
      [
        {
          id: 1,
          head_sha: "a",
          event: "pull_request",
          status: "completed",
          conclusion: "failure",
          created_at: "2024-05-15T13:00:00Z",
        },
        {
          id: 2,
          head_sha: "b",
          event: "push",
          status: "completed",
          conclusion: "success",
          created_at: "2024-05-15T13:00:00Z",
        },
        {
          id: 3,
          head_sha: "c",
          event: "push",
          status: "in_progress",
          conclusion: null,
          created_at: "2024-05-15T13:00:00Z",
        },
        {
          id: 4,
          head_sha: "d",
          event: "push",
          status: "completed",
          conclusion: "failure",
          created_at: "2024-05-15T11:00:00Z",
        },
      ],
      "main",
      WINDOW_START,
    );
    expect(def.map((r) => r.runId)).toEqual(["2"]);
  });
});

describe("buildQueueCommitsQuery & mergeQueueCommitDetails", () => {
  it("builds aliased commit queries, merges details, and detects null nodes", () => {
    const built = buildQueueCommitsQuery("o", "r", ["aaa", "bbb"]);
    expect(built.query).toContain("c0: object(expression: $oid0)");
    expect(built.query).toContain("c1: object(expression: $oid1)");
    expect(built.variables).toEqual({ owner: "o", repo: "r", oid0: "aaa", oid1: "bbb" });

    const candidates = [
      {
        runId: "10",
        headSha: "aaaaaaa11",
        pr: 812,
        conclusion: "FAILURE",
        completedAt: "2024-05-15T14:00:00Z",
      },
      {
        runId: "11",
        headSha: "bbbbbbb22",
        pr: 813,
        conclusion: "SUCCESS",
        completedAt: "2024-05-15T13:00:00Z",
      },
    ];
    const merged = mergeQueueCommitDetails(candidates, new Map([["aaaaaaa11", "c0"]]), {
      repository: {
        c0: {
          oid: "aaaaaaa11",
          checkSuites: {
            nodes: [
              {
                workflowRun: { databaseId: 10 },
                checkRuns: {
                  nodes: [
                    { name: "test (3/4)", conclusion: "FAILURE", annotations: { nodes: [] } },
                    { name: "test (1/4)", conclusion: "TIMED_OUT", annotations: { nodes: [] } },
                  ],
                },
              },
            ],
          },
        },
      },
    });
    expect(merged.incomplete).toBe(false);
    expect(merged.runs[0]!.failedJobs).toHaveLength(2);
    expect(merged.runs[1]!.failedJobs).toEqual([]);

    const withNull = mergeQueueCommitDetails(candidates, new Map([["aaaaaaa11", "c0"]]), {
      repository: { c0: { oid: "aaaaaaa11", checkSuites: { nodes: [null] } } },
    });
    expect(withNull.incomplete).toBe(true);

    const withNullAnn = mergeQueueCommitDetails(candidates, new Map([["aaaaaaa11", "c0"]]), {
      repository: {
        c0: {
          oid: "aaaaaaa11",
          checkSuites: {
            nodes: [
              {
                workflowRun: { databaseId: 10 },
                checkRuns: {
                  nodes: [{ name: "t", conclusion: "FAILURE", annotations: { nodes: [null] } }],
                },
              },
            ],
          },
        },
      },
    });
    expect(withNullAnn.incomplete).toBe(true);
  });
});
