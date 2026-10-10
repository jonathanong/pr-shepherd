import { pull, prefix } from "./rest-read.test-support.mts";

export function restIterateRoutes(
  options: {
    draft?: boolean;
    pending?: boolean;
    comments?: unknown[];
    quotaHeaders?: boolean;
  } = {},
) {
  return async (request: { method: string; path: string }, response: any) => {
    const path = request.path.split("?")[0]!;
    if (path === "/graphql") {
      if (options.quotaHeaders) {
        response.setHeader("x-ratelimit-remaining", "0");
        response.setHeader("x-ratelimit-limit", "5000");
        response.setHeader("x-ratelimit-reset", "2000000000");
        response.setHeader("x-ratelimit-resource", "graphql");
      }
      response.end(
        JSON.stringify({
          data: null,
          errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }],
        }),
      );
    } else if (path === "/rate_limit") {
      response.end(
        JSON.stringify({
          resources: { graphql: { remaining: 0, limit: 5000, reset: 2000000000 } },
        }),
      );
    } else if (path === `${prefix}/pulls/101`) {
      response.end(JSON.stringify({ ...pull, draft: options.draft ?? false }));
    } else if (path === `${prefix}/pulls/101/comments`) {
      response.end(JSON.stringify(options.comments ?? []));
    } else if (path === `${prefix}/issues/101/comments` || path === `${prefix}/pulls/101/reviews`) {
      response.end("[]");
    } else if (path === `${prefix}/pulls/101/ccr/review_threads`) {
      const inline = options.comments ?? [];
      const root = inline[0] as { id?: number } | undefined;
      response.end(
        JSON.stringify(
          root
            ? [
                {
                  resolved: true,
                  outdated: false,
                  path: "src/index.mts",
                  line: 5,
                  comment_ids: [root.id],
                },
              ]
            : [],
        ),
      );
    } else if (path === `${prefix}/pulls/101/ccr/ready_for_review` && request.method === "POST") {
      response.end('{"draft":false}');
    } else if (path.includes("/check-runs")) {
      response.end(
        JSON.stringify({
          total_count: options.pending ? 1 : 0,
          check_runs: options.pending
            ? [
                {
                  id: 1,
                  node_id: "CR_1",
                  name: "CI",
                  status: "in_progress",
                  conclusion: null,
                  details_url: "https://github.com/octocat/hello-world/actions/runs/1",
                  started_at: "2026-10-09T00:00:00Z",
                  completed_at: null,
                  check_suite: null,
                  output: { title: null, summary: null, annotations_count: 0 },
                },
              ]
            : [],
        }),
      );
    } else if (path.includes("/check-suites")) {
      response.end('{"total_count":0,"check_suites":[]}');
    } else if (path.includes("/statuses")) {
      response.end("[]");
    } else if (path.includes("/actions/runs")) {
      response.end('{"total_count":0,"workflow_runs":[]}');
    } else if (path.endsWith("/protection")) {
      response.statusCode = 404;
      response.end('{"message":"Not Found"}');
    } else if (path.includes("/rules/branches/")) {
      response.end("[]");
    } else if (path === `${prefix}/stacks`) {
      response.end("[]");
    } else if (path === prefix) {
      response.end(
        '{"allow_merge_commit":true,"allow_squash_merge":true,"allow_rebase_merge":true}',
      );
    } else {
      response.statusCode = 404;
      response.end('{"message":"Not Found"}');
    }
  };
}
