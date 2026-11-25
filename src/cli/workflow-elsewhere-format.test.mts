import { describe, expect, it } from "vitest";
import { renderWorkflowElsewhereLines } from "./workflow-elsewhere-format.mts";
import type { AgentCheck } from "../types.mts";

const baseCheck = (): AgentCheck => ({
  name: "test (3/4)",
  runId: "45390112233",
  detailsUrl: "https://github.com/owner/repo/actions/runs/45390112233",
  conclusion: "FAILURE",
  scope: "merge_group",
  commitOid: "q1",
});

describe("renderWorkflowElsewhereLines", () => {
  it("returns empty when neither elsewhere nor elsewhereUnread is set", () => {
    expect(renderWorkflowElsewhereLines(baseCheck())).toEqual([]);
  });

  it("renders the unread state", () => {
    expect(
      renderWorkflowElsewhereLines({ ...baseCheck(), elsewhereUnread: "HTTP 502\nretry" }),
    ).toEqual(["  Same workflow elsewhere: not read (HTTP 502 retry)"]);
  });

  it("renders the no-runs-in-window state", () => {
    expect(
      renderWorkflowElsewhereLines({
        ...baseCheck(),
        elsewhere: [],
        elsewhereSince: "2024-05-15T09:10:00Z",
      }),
    ).toEqual(["  Same workflow elsewhere: no other runs since 09:10Z"]);
  });

  it("renders default-branch and merge-queue runs, failed jobs, sameJob, and 0/1/multi annotations", () => {
    const lines = renderWorkflowElsewhereLines({
      ...baseCheck(),
      elsewhereSince: "2024-05-15T09:10:00Z",
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
            },
            {
              name: "test (3/4)",
              conclusion: "TIMED_OUT",
              sameJob: true,
              annotations: [],
            },
            {
              name: "test (4/4)",
              conclusion: "FAILURE",
              annotations: [
                { path: "a.ts", line: null, message: "first" },
                { path: "", line: null, message: "second only" },
              ],
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
      "  Same workflow elsewhere (since 09:10Z, newest first):",
      "  - `main` `a1b2c3d` run `45390004411` [conclusion: FAILURE]",
      "    - test (2/4): `src/queue/retry.test.mts:88` — expected 3 retries, got 2",
      "    - test (3/4) [conclusion: TIMED_OUT] ← same job",
      "    - test (4/4):",
      "      - `a.ts` — first",
      "      - second only",
      "  - `default branch` `9f8e7d6` run `45389870021` [conclusion: SUCCESS]",
      "  - merge queue #812 `f00ba12` run `45390098877` [conclusion: FAILURE]",
      "  - merge queue `0001112` run `45390090000` [conclusion: SUCCESS]",
    ]);
  });

  it("handles missing or non-ISO timestamps gracefully", () => {
    expect(renderWorkflowElsewhereLines({ ...baseCheck(), elsewhere: [] })).toEqual([
      "  Same workflow elsewhere: no other runs since unknown",
    ]);
    expect(
      renderWorkflowElsewhereLines({ ...baseCheck(), elsewhere: [], elsewhereSince: "custom" }),
    ).toEqual(["  Same workflow elsewhere: no other runs since custom"]);
  });
});
