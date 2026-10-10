import { vi } from "vitest";
import { comment, prefix, pull, serve } from "./rest-read.test-support.mts";
import { restIterateRoutes } from "./rest-iterate-routes.test-support.mts";

export const currentHead = "a".repeat(40);
export const previousHead = "b".repeat(40);
export const review = (id = 1, commit = previousHead, author = "alice") => ({
  id,
  node_id: `PRR_${id}`,
  body: `Changes requested in review ${id}`,
  html_url: `https://github.com/octocat/hello-world/pull/101#pullrequestreview-${id}`,
  user: { login: author, type: "User" },
  author_association: "MEMBER",
  state: "CHANGES_REQUESTED",
  commit_id: commit,
  submitted_at: "2026-10-09T00:01:00Z",
});
export const inline = (id = 11, reviewId?: number) => ({
  ...comment(id),
  user: { login: "alice", type: "User" },
  ...(reviewId !== undefined && { pull_request_review_id: reviewId }),
});
export const thread = (id = 11, resolved = true, outdated = false) => ({
  resolved,
  outdated,
  path: "src/index.mts",
  line: 5,
  comment_ids: [id],
});

export async function serveStaleReviewFixture(
  options: {
    reviews?: ReturnType<typeof review>[];
    comments?: ReturnType<typeof inline>[];
    statuses?: ReturnType<typeof thread>[];
    cloud?: boolean;
    missingCcr?: boolean;
    base?: string;
  } = {},
) {
  vi.stubEnv("CLAUDE_CODE_REMOTE", options.cloud === false ? "" : "true");
  const routes = restIterateRoutes();
  await serve((request, response) => {
    const path = request.path.split("?")[0];
    if (path === "/user") response.end('{"login":"viewer"}');
    else if (path === `${prefix}/pulls/101`)
      response.end(
        JSON.stringify({
          ...pull,
          head: { ...pull.head, sha: currentHead },
          base: { ...pull.base, ref: options.base ?? "main" },
        }),
      );
    else if (path === `${prefix}/pulls/101/reviews`)
      response.end(JSON.stringify(options.reviews ?? [review()]));
    else if (path === `${prefix}/pulls/101/comments`)
      response.end(JSON.stringify(options.comments ?? [inline(11, 1)]));
    else if (path === `${prefix}/pulls/101/ccr/review_threads`) {
      if (options.missingCcr) {
        response.statusCode = 404;
        response.end('{"message":"Not Found"}');
      } else response.end(JSON.stringify(options.statuses ?? [thread()]));
    } else {
      void routes(request, response);
    }
  });
}
