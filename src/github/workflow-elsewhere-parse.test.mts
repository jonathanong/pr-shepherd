import { describe, expect, it } from "vitest";
import { parseDefaultBranchRuns } from "./workflow-elsewhere-parse.mts";

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
  branch: { name: "main" },
  workflowRun: {
    databaseId: id,
    event,
    updatedAt,
    file: { path: ".github/workflows/ci.yml" },
    workflow: { databaseId: wf, name: "CI" },
  },
  checkRuns: {
    nodes: [
      {
        name: `job-${id}`,
        conclusion: "FAILURE",
        annotations: {
          totalCount: 5,
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

const historyResp = (nodes: unknown[], pageInfo?: { hasNextPage: boolean }) => ({
  repository: {
    defaultBranchRef: {
      name: "main",
      target: { history: { ...(pageInfo && { pageInfo }), nodes } },
    },
  },
});

describe("parseDefaultBranchRuns", () => {
  it("filters by workflow ID, branch, event, completion, window, deduplicates, sorts newest first, caps at 3", () => {
    const res = parseDefaultBranchRuns(
      historyResp([
        {
          oid: "1111111aaaa",
          committedDate: "2024-05-15T13:00:00Z",
          checkSuites: {
            nodes: [
              suite(10, "2024-05-15T13:00:00Z", "FAILURE", 9999),
              suite(11, "2024-05-15T13:00:00Z", "FAILURE", 7001, "pull_request"),
              { ...suite(18, "2024-05-15T15:30:00Z"), branch: { name: "release" } },
              {
                status: "IN_PROGRESS",
                conclusion: null,
                workflowRun: { databaseId: 12, event: "push", workflow: { databaseId: 7001 } },
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
      ]) as never,
      "7001",
      WINDOW_START,
    );
    expect(res.incomplete).toBe(false);
    expect([
      res.commitsRead,
      res.matched,
      res.matchedComplete,
      res.workflowName,
      res.workflowPath,
    ]).toEqual([1, 4, true, "CI", ".github/workflows/ci.yml"]);
    const cappedWithMore = parseDefaultBranchRuns(
      historyResp(
        [
          {
            oid: "1111111aaaa",
            committedDate: "2024-05-15T13:00:00Z",
            checkSuites: {
              nodes: [
                suite(14, "2024-05-15T14:00:00Z", "SUCCESS"),
                suite(15, "2024-05-15T15:00:00Z"),
                suite(16, "2024-05-15T15:00:00Z"),
              ],
            },
          },
        ],
        { hasNextPage: true },
      ) as never,
      "7001",
      WINDOW_START,
    );
    expect([cappedWithMore.matched, cappedWithMore.matchedComplete]).toEqual([3, false]);
    expect(res.runs.map((r) => r.runId)).toEqual(["16", "15", "14"]);
    expect([res.runs[0]!.headSha, res.runs[0]!.branch, res.runs[0]!.failedJobs.length]).toEqual([
      "1111111",
      "main",
      1,
    ]);
    expect(res.runs[0]!.failedJobs[0]!.moreAnnotations).toBe(2);
    expect(res.runs[0]!.failedJobs[0]!.annotations).toEqual([
      { path: "a.ts", line: 10, message: "boom" },
      { path: "b.ts", line: null, message: "no line" },
      { path: "c.ts", line: null, message: "three" },
    ]);
  });

  it("reports unavailable on missing/truncated history and incomplete on null nodes or annotations", () => {
    const parse = (d: unknown) => parseDefaultBranchRuns(d as never, "7001", WINDOW_START);
    expect(parse({ repository: null }).unavailable).toBe("default branch history unavailable");
    const nullAnn = historyResp([
      {
        oid: "abc1234",
        committedDate: "2024-05-15T13:00:00Z",
        checkSuites: {
          nodes: [
            {
              status: "COMPLETED",
              conclusion: "FAILURE",
              workflowRun: { databaseId: 1, event: "push", workflow: { databaseId: 7001 } },
              checkRuns: {
                nodes: [{ name: "t", conclusion: "FAILURE", annotations: { nodes: [null] } }],
              },
            },
          ],
        },
      },
    ]);
    expect([
      parse(nullAnn).incomplete,
      parse(
        historyResp([
          { oid: "a", committedDate: "2024-05-15T13:00:00Z", checkSuites: { nodes: [null] } },
        ]),
      ).incomplete,
    ]).toEqual([true, true]);
    const truncSuite = (committedDate: string, nodes: unknown[] = []) =>
      historyResp([
        { oid: "abc1234", committedDate, checkSuites: { pageInfo: { hasNextPage: true }, nodes } },
      ]);
    const truncMsg = "default branch workflow history truncated";
    expect(parse(truncSuite("2024-05-15T13:00:00Z")).unavailable).toBe(truncMsg);
    expect(
      parse(
        truncSuite("2024-05-14T00:00:00Z", [suite(99, "2024-05-15T13:30:00Z", "SUCCESS", 9999)]),
      ).unavailable,
    ).toBe(truncMsg);
    const rebased = historyResp([
      {
        oid: "rebased1",
        committedDate: "2024-05-14T00:00:00Z",
        checkSuites: { nodes: [suite(88, "2024-05-15T14:00:00Z")] },
      },
    ]);
    expect(parse(rebased).runs.map((r) => r.runId)).toEqual(["88"]);
    expect(parse(truncSuite("2024-05-14T00:00:00Z"))).toMatchObject({
      runs: [],
      incomplete: false,
      commitsRead: 1,
      matched: 0,
    });
    const oldInWin = historyResp(
      [
        {
          oid: "old1234",
          committedDate: "2024-05-14T00:00:00Z",
          checkSuites: { nodes: [suite(99, "2024-05-15T13:30:00Z", "SUCCESS", 9999)] },
        },
      ],
      { hasNextPage: true },
    );
    expect(parse(oldInWin).unavailable).toBe(truncMsg);
  });
});
