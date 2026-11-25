import { describe, expect, it } from "vitest";
import { renderWorkflowElsewhereLines } from "./workflow-elsewhere-format.mts";
import type { AgentCheck, ElsewhereScope } from "../types.mts";

const baseCheck = (): AgentCheck => ({
  name: "test (3/4)",
  runId: "45390112233",
  detailsUrl: "https://github.com/owner/repo/actions/runs/45390112233",
  conclusion: "FAILURE",
  scope: "merge_group",
  commitOid: "q1",
});

const sampleScope = (overrides: Partial<ElsewhereScope> = {}): ElsewhereScope => ({
  workflowName: "CI",
  workflowPath: ".github/workflows/ci.yml",
  since: "2024-05-15T09:10:00Z",
  defaultBranch: { branch: "main", commitsRead: 20, matched: 7, shown: 3 },
  mergeQueue: { runsRead: 90, matched: 2, shown: 2 },
  ...overrides,
});

describe("renderWorkflowElsewhereLines", () => {
  it("returns empty when neither elsewhere nor elsewhereUnread is set", () => {
    expect(renderWorkflowElsewhereLines(baseCheck())).toEqual([]);
  });

  it("renders the unread state unchanged", () => {
    expect(
      renderWorkflowElsewhereLines({ ...baseCheck(), elsewhereUnread: "HTTP 502\nretry" }),
    ).toEqual(["  Same workflow elsewhere: not read (HTTP 502 retry)"]);
  });

  it("renders the none-found state with workflow scope and checked counts (GraphQL and REST)", () => {
    expect(
      renderWorkflowElsewhereLines({
        ...baseCheck(),
        elsewhere: [],
        elsewhereScope: sampleScope({
          defaultBranch: { branch: "main", commitsRead: 20, matched: 0, shown: 0 },
          mergeQueue: { runsRead: 1, matched: 0, shown: 0 },
        }),
      }),
    ).toEqual([
      "  Same workflow elsewhere — `CI` (.github/workflows/ci.yml), since 09:10Z: none found",
      "    checked: `main` last 20 commits · merge queue newest 1 run",
    ]);

    expect(
      renderWorkflowElsewhereLines({
        ...baseCheck(),
        elsewhere: [],
        elsewhereScope: sampleScope({
          workflowPath: undefined,
          defaultBranch: { branch: "main", runsRead: 1, matched: 0, shown: 0 },
          mergeQueue: { runsRead: 30, matched: 0, shown: 0 },
        }),
      }),
    ).toEqual([
      "  Same workflow elsewhere — `CI`, since 09:10Z: none found",
      "    checked: `main` newest 1 run · merge queue newest 30 runs",
    ]);

    expect(
      renderWorkflowElsewhereLines({
        ...baseCheck(),
        elsewhere: [],
        elsewhereScope: sampleScope({
          workflowName: undefined,
          defaultBranch: { branch: "main", commitsRead: 1, matched: 0, shown: 0 },
          mergeQueue: { runsRead: 0, matched: 0, shown: 0 },
        }),
      }),
    ).toEqual([
      "  Same workflow elsewhere — (.github/workflows/ci.yml), since 09:10Z: none found",
      "    checked: `main` last 1 commit · merge queue newest 0 runs",
    ]);
  });

  it("renders scope, runs, failed jobs, sameJob, and (+N more annotations) across 0/1/multi annotations", () => {
    const lines = renderWorkflowElsewhereLines({
      ...baseCheck(),
      elsewhereScope: sampleScope(),
      elsewhere: [
        {
          source: "default-branch",
          branch: "main",
          headSha: "a1b2c3d",
          runId: "45390004411",
          conclusion: "FAILURE",
          completedAt: "2024-05-15T14:50:00Z",
          failedJobs: [
            {
              name: "test (2/4)",
              conclusion: "FAILURE",
              annotations: [
                {
                  path: "src/queue/retry.test.mts",
                  line: 88,
                  message: "expected 3 retries, got 2",
                },
              ],
              moreAnnotations: 1,
            },
            {
              name: "test (3/4)",
              conclusion: "TIMED_OUT",
              sameJob: true,
              annotations: [],
              moreAnnotations: 2,
            },
            {
              name: "test (4/4)",
              conclusion: "FAILURE",
              annotations: [
                { path: "a.ts", line: null, message: "first" },
                { path: "", line: null, message: "second only" },
              ],
              moreAnnotations: 4,
            },
          ],
        },
        {
          source: "default-branch",
          headSha: "9f8e7d6",
          runId: "45389870021",
          conclusion: "SUCCESS",
          completedAt: "2024-05-15T14:00:00Z",
          failedJobs: [],
        },
        {
          source: "merge-queue",
          pr: 812,
          headSha: "f00ba12",
          runId: "45390098877",
          conclusion: "FAILURE",
          completedAt: "2024-05-15T14:58:00Z",
          failedJobs: [],
        },
        {
          source: "merge-queue",
          headSha: "0001112",
          runId: "45390090000",
          conclusion: "SUCCESS",
          completedAt: "2024-05-15T14:30:00Z",
          failedJobs: [],
        },
      ],
    });
    expect(lines).toEqual([
      "  Same workflow elsewhere — `CI` (.github/workflows/ci.yml), since 09:10Z:",
      "    checked: `main` last 20 commits · merge queue newest 90 runs",
      "    showing newest 3 of 7 on `main`, 2 of 2 in the merge queue",
      "  - `main` `a1b2c3d` run `45390004411` [conclusion: FAILURE]",
      "    - test (2/4): `src/queue/retry.test.mts:88` — expected 3 retries, got 2 (+1 more annotation)",
      "    - test (3/4) [conclusion: TIMED_OUT] ← same job (+2 more annotations)",
      "    - test (4/4):",
      "      - `a.ts` — first",
      "      - second only",
      "      - (+4 more annotations)",
      "  - `default branch` `9f8e7d6` run `45389870021` [conclusion: SUCCESS]",
      "  - merge queue #812 `f00ba12` run `45390098877` [conclusion: FAILURE]",
      "  - merge queue `0001112` run `45390090000` [conclusion: SUCCESS]",
    ]);
  });

  it("handles missing scope or non-ISO timestamps gracefully", () => {
    expect(renderWorkflowElsewhereLines({ ...baseCheck(), elsewhere: [] })).toEqual([
      "  Same workflow elsewhere, since unknown: none found",
    ]);
    expect(
      renderWorkflowElsewhereLines({
        ...baseCheck(),
        elsewhere: [],
        elsewhereScope: sampleScope({
          workflowName: undefined,
          workflowPath: undefined,
          since: "custom",
          defaultBranch: { branch: "main", matched: 0, shown: 0 },
          mergeQueue: { runsRead: 0, matched: 0, shown: 0 },
        }),
      }),
    ).toEqual([
      "  Same workflow elsewhere, since custom: none found",
      "    checked: `main` newest 0 runs · merge queue newest 0 runs",
    ]);
  });
});
