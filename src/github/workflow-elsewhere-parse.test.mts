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
  branch: { name: "main" },
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

const historyResp = (nodes: unknown[], pageInfo?: { hasNextPage: boolean }) => ({
  repository: {
    defaultBranchRef: {
      name: "main",
      target: { history: { ...(pageInfo && { pageInfo }), nodes } },
    },
  },
});

describe("normalizeAnnotationMessage & stampSameJob", () => {
  it("collapses whitespace, truncates long messages, and stamps exact-name job matches", () => {
    expect(normalizeAnnotationMessage("  line1\n\tline2  ")).toBe("line1 line2");
    expect(normalizeAnnotationMessage(null)).toBe("");
    const out = normalizeAnnotationMessage("a".repeat(300));
    expect(out.length).toBe(240);
    expect(out.endsWith("…")).toBe(true);

    const runs: ElsewhereRun[] = [
      {
        source: "default-branch",
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

  it("reports unavailable on missing/truncated history and incomplete on null nodes or annotations", () => {
    const parse = (d: unknown) => parseDefaultBranchRuns(d as never, "7001", WINDOW_START);
    expect(parse({ repository: null }).unavailable).toBe("default branch history unavailable");
    expect(
      parse(
        historyResp([
          { oid: "abc1234", committedDate: "2024-05-15T13:00:00Z", checkSuites: { nodes: [null] } },
        ]),
      ).incomplete,
    ).toBe(true);
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
    expect(parse(nullAnn).incomplete).toBe(true);
    const truncSuite = (committedDate: string, nodes: unknown[] = []) =>
      historyResp([
        { oid: "abc1234", committedDate, checkSuites: { pageInfo: { hasNextPage: true }, nodes } },
      ]);
    expect(parse(truncSuite("2024-05-15T13:00:00Z")).unavailable).toBe(
      "default branch workflow history truncated",
    );
    // Old committedDate (e.g. rebase-merged commit) with an in-window suite still counts as in-window.
    expect(
      parse(
        truncSuite("2024-05-14T00:00:00Z", [suite(99, "2024-05-15T13:30:00Z", "SUCCESS", 9999)]),
      ).unavailable,
    ).toBe("default branch workflow history truncated");
    // Old committedDate with a matching in-window run is kept (window judged by run completion time).
    expect(
      parse(
        historyResp([
          {
            oid: "rebased1",
            committedDate: "2024-05-14T00:00:00Z",
            checkSuites: { nodes: [suite(88, "2024-05-15T14:00:00Z")] },
          },
        ]),
      ).runs.map((r) => r.runId),
    ).toEqual(["88"]);
    // Old committedDate with no in-window suite does not poison truncatedSuites.
    expect(parse(truncSuite("2024-05-14T00:00:00Z"))).toEqual({ runs: [], incomplete: false });
    // Oldest commit with an in-window suite still marks history truncated when hasNextPage is true.
    expect(
      parse(
        historyResp(
          [
            {
              oid: "old1234",
              committedDate: "2024-05-14T00:00:00Z",
              checkSuites: { nodes: [suite(99, "2024-05-15T13:30:00Z", "SUCCESS", 9999)] },
            },
          ],
          { hasNextPage: true },
        ),
      ).unavailable,
    ).toBe("default branch workflow history truncated");
  });
});
