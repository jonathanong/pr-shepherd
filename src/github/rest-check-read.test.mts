import { describe, expect, it } from "vitest";
import { wire, serve, repo } from "../../test-helpers/github/rest-read.test-support.mts";
import {
  readRestAnnotationCounts,
  readRestCommitChecks,
  readRestBehind,
} from "./rest-check-read.mts";
import { readRestCheckAnnotations } from "./rest-annotation-read.mts";
describe("REST check evidence", () => {
  it("uses the latest rerun for check state and annotation counts", async () => {
    const runs = [
      {
        id: 77,
        node_id: "CR_77",
        name: "build",
        status: "completed",
        conclusion: "failure",
        details_url: null,
        started_at: "2026-10-09T00:00:00Z",
        completed_at: "2026-10-09T00:01:00Z",
        check_suite: null,
        output: { title: "Failed", summary: "failed rerun", annotations_count: 3 },
      },
      {
        id: 78,
        node_id: "CR_78",
        name: "build",
        status: "completed",
        conclusion: "success",
        details_url: null,
        started_at: "2026-10-09T01:00:00Z",
        completed_at: "2026-10-09T01:01:00Z",
        check_suite: null,
        output: { title: "Passed", summary: "successful rerun", annotations_count: 0 },
      },
    ];
    await serve((request, response) => {
      const url = new URL(request.path, "https://api.github.com");
      if (url.pathname.endsWith("check-runs")) {
        expect(url.searchParams.get("filter")).toBe("latest");
        response.end(JSON.stringify({ total_count: 1, check_runs: [runs[1]] }));
      } else if (url.pathname.endsWith("check-suites"))
        response.end('{"total_count":0,"check_suites":[]}');
      else if (url.pathname.endsWith("actions/runs"))
        response.end('{"total_count":0,"workflow_runs":[]}');
      else response.end("[]");
    });

    expect(await readRestCommitChecks("aaa111", repo)).toMatchObject({
      nodes: [
        { id: "CR_78", name: "build", conclusion: "SUCCESS", annotations: { totalCount: 0 } },
      ],
    });
    expect(await readRestAnnotationCounts("aaa111", repo)).toEqual([
      { __typename: "CheckRun", id: "CR_78", annotations: { totalCount: 0 } },
    ]);
    expect(wire.requests.filter((request) => request.path.includes("check-runs"))).toHaveLength(2);
  });

  it("loads check runs, suites, statuses, workflow metadata and annotations without GraphQL", async () => {
    await serve((request, response) => {
      const path = request.path.split("?")[0];
      if (path?.endsWith("check-runs"))
        response.end(
          JSON.stringify({
            total_count: 1,
            check_runs: [
              {
                id: 77,
                node_id: "CR_77",
                name: "build",
                status: "completed",
                conclusion: "success",
                details_url: "https://github.com/octocat/hello-world/actions/runs/88/job/99",
                started_at: "2026-10-09T00:00:00Z",
                completed_at: "2026-10-09T00:01:00Z",
                check_suite: { id: 66 },
                output: { title: "Built", summary: "success", annotations_count: 1 },
              },
            ],
          }),
        );
      else if (path?.endsWith("check-suites"))
        response.end(
          JSON.stringify({
            total_count: 1,
            check_suites: [
              {
                id: 66,
                node_id: "CS_66",
                status: "completed",
                conclusion: "success",
                created_at: "2026-10-09T00:00:00Z",
                updated_at: "2026-10-09T00:01:00Z",
              },
            ],
          }),
        );
      else if (path?.endsWith("statuses"))
        response.end(
          JSON.stringify([
            {
              id: 1,
              context: "legacy",
              state: "pending",
              created_at: "2026-10-09T00:00:00Z",
              target_url: null,
              description: "pending",
            },
            {
              id: 2,
              context: "legacy",
              state: "success",
              created_at: "2026-10-09T00:01:00Z",
              target_url: null,
              description: "passed",
            },
          ]),
        );
      else if (path?.endsWith("actions/runs"))
        response.end(
          JSON.stringify({
            total_count: 1,
            workflow_runs: [
              {
                id: 88,
                check_suite_id: 66,
                event: "pull_request",
                workflow_id: 44,
                name: "CI",
                created_at: "2026-10-09T00:00:00Z",
                updated_at: "2026-10-09T00:01:00Z",
                html_url: "https://github.com/octocat/hello-world/actions/runs/88",
              },
            ],
          }),
        );
      else if (path?.endsWith("annotations"))
        response.end(
          JSON.stringify([
            {
              path: "src/index.mts",
              start_line: 5,
              end_line: 5,
              annotation_level: "warning",
              message: "warning detail",
              title: "warning",
              raw_details: null,
              blob_href: null,
            },
          ]),
        );
      else if (path?.includes("compare")) response.end('{"behind_by":3}');
      else {
        response.statusCode = 500;
        response.end("{}");
      }
    });
    const checks = await readRestCommitChecks("aaa111", repo, 101);
    expect(checks.nodes).toMatchObject([
      {
        __typename: "CheckRun",
        id: "CR_77",
        annotations: { totalCount: 1 },
        checkSuite: { workflowRun: { event: "pull_request", workflow: { databaseId: 44 } } },
      },
      { __typename: "StatusContext", context: "legacy", state: "SUCCESS" },
    ]);
    const annotations = await readRestCheckAnnotations("CR_77");
    expect(annotations).toMatchObject([
      { message: "warning detail", path: "src/index.mts", startLine: 5, level: "WARNING" },
    ]);
    expect(await readRestBehind(repo, "main", "aaa111")).toBe(3);
    expect(wire.requests.some((request) => request.path === "/graphql")).toBe(false);
  });
});
