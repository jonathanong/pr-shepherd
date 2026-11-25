import { describe, expect, it } from "vitest";
import type { ElsewhereRun } from "../types/workflow-elsewhere.mts";
import {
  normalizeAnnotationMessage,
  parseDefaultBranchRuns,
  stampSameJob,
} from "./workflow-elsewhere-parse.mts";

const WINDOW_START = Date.parse("2024-05-15T12:00:00Z");

const suite = (
  id: number,
  updatedAt: string,
  conclusion = "FAILURE",
  wf = 7001,
  event = "push",
) => ({
  status: "COMPLETED",
  conclusion,
  updatedAt,
  workflowRun: { databaseId: id, event, updatedAt, workflow: { databaseId: wf } },
  checkRuns: {
    nodes: [
      {
        name: `job-${id}`,
        conclusion: "FAILURE",
        annotations: {
          nodes: [
            { path: "a.ts", location: { start: { line: 10 } }, message: "boom" },
            { path: "b.ts", location: { start: { line: 0 } }, message: "no line" },
            { path: "c.ts", location: null, message: "three" },
            { path: "d.ts", location: { start: { line: 4 } }, message: "dropped 4th" },
          ],
        },
      },
      { name: "passing", conclusion: "SUCCESS", annotations: { nodes: [] } },
    ],
  },
});

describe("normalizeAnnotationMessage & stampSameJob", () => {
  it("collapses whitespace and truncates long annotation messages", () => {
    expect(normalizeAnnotationMessage("  line1\n\tline2  ")).toBe("line1 line2");
    expect(normalizeAnnotationMessage(null)).toBe("");
    const out = normalizeAnnotationMessage("a".repeat(300));
    expect(out.length).toBe(240);
    expect(out.endsWith("…")).toBe(true);
  });

  it("stamps exact-name job matches without mutating input", () => {
    const runs: ElsewhereRun[] = [
      {
        source: "default-branch" as const,
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
    const stamped = stampSameJob(runs, "test (3/4)");
    expect(stamped[0]!.failedJobs).toEqual([
      { name: "test (3/4)", conclusion: "FAILURE", sameJob: true, annotations: [] },
      { name: "test (1/4)", conclusion: "TIMED_OUT", annotations: [] },
    ]);
    expect(runs[0]!.failedJobs[0]!.sameJob).toBeUndefined();
  });
});

describe("parseDefaultBranchRuns", () => {
  it("filters by workflow ID, event, completion, window, deduplicates, sorts newest first, caps at 3", () => {
    const res = parseDefaultBranchRuns(
      {
        repository: {
          defaultBranchRef: {
            name: "main",
            target: {
              history: {
                nodes: [
                  {
                    oid: "1111111aaaa",
                    committedDate: "2024-05-15T13:00:00Z",
                    checkSuites: {
                      nodes: [
                        suite(10, "2024-05-15T13:00:00Z", "FAILURE", 9999),
                        suite(11, "2024-05-15T13:00:00Z", "FAILURE", 7001, "pull_request"),
                        {
                          status: "IN_PROGRESS",
                          conclusion: null,
                          workflowRun: {
                            databaseId: 12,
                            event: "push",
                            workflow: { databaseId: 7001 },
                          },
                        },
                        suite(13, "2024-05-15T11:59:59Z"),
                        suite(14, "2024-05-15T14:00:00Z", "SUCCESS"),
                        suite(14, "2024-05-15T14:00:00Z", "SUCCESS"),
                        suite(15, "2024-05-15T15:00:00Z"),
                        suite(16, "2024-05-15T15:00:00Z"),
                        suite(17, "2024-05-15T12:30:00Z"),
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
      "7001",
      WINDOW_START,
    );
    expect(res.incomplete).toBe(false);
    expect(res.runs.map((r) => r.runId)).toEqual(["16", "15", "14"]);
    expect(res.runs[0]!.headSha).toBe("1111111");
    expect(res.runs[0]!.branch).toBe("main");
    expect(res.runs[0]!.failedJobs).toHaveLength(1);
    expect(res.runs[0]!.failedJobs[0]!.annotations).toEqual([
      { path: "a.ts", line: 10, message: "boom" },
      { path: "b.ts", line: null, message: "no line" },
      { path: "c.ts", line: null, message: "three" },
    ]);
  });

  it("reports unavailable when defaultBranchRef is missing and incomplete on null nodes or null annotations", () => {
    expect(parseDefaultBranchRuns({ repository: null }, "7001", WINDOW_START).unavailable).toBe(
      "default branch history unavailable",
    );
    const nullSuite = parseDefaultBranchRuns(
      {
        repository: {
          defaultBranchRef: {
            name: "main",
            target: {
              history: {
                nodes: [
                  {
                    oid: "abc1234",
                    committedDate: "2024-05-15T13:00:00Z",
                    checkSuites: { nodes: [null] },
                  },
                ],
              },
            },
          },
        },
      },
      "7001",
      WINDOW_START,
    );
    expect(nullSuite.incomplete).toBe(true);

    const nullAnn = parseDefaultBranchRuns(
      {
        repository: {
          defaultBranchRef: {
            name: "main",
            target: {
              history: {
                nodes: [
                  {
                    oid: "abc1234",
                    committedDate: "2024-05-15T13:00:00Z",
                    checkSuites: {
                      nodes: [
                        {
                          status: "COMPLETED",
                          conclusion: "FAILURE",
                          workflowRun: {
                            databaseId: 1,
                            event: "push",
                            workflow: { databaseId: 7001 },
                          },
                          checkRuns: {
                            nodes: [
                              { name: "t", conclusion: "FAILURE", annotations: { nodes: [null] } },
                            ],
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
      "7001",
      WINDOW_START,
    );
    expect(nullAnn.incomplete).toBe(true);
  });
});
