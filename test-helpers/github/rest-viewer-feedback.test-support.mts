import { serve, comment, prefix } from "./rest-read.test-support.mts";
import { restIterateRoutes } from "./rest-iterate-routes.test-support.mts";

export const authoredComment = (id: number, login: string, root?: number, type = "User") => ({
  ...comment(id, root),
  user: { login, type },
});

export async function serveViewerFeedback() {
  const fixture = {
    viewerStatus: 200,
    viewer: { login: "aLiCe" } as unknown,
    viewerHeaders: {} as Record<string, string>,
    inline: [
      authoredComment(11, "ALICE"),
      authoredComment(12, "alice", 11),
      authoredComment(21, "Bob"),
      authoredComment(22, "alice", 21),
      authoredComment(31, "review-bot[bot]", undefined, "Bot"),
      authoredComment(32, "Bob", 31),
    ],
    issue: [] as unknown[],
  };
  const fallback = restIterateRoutes();
  await serve((request, response) => {
    const path = request.path.split("?")[0];
    if (path === "/user") {
      response.statusCode = fixture.viewerStatus;
      for (const [key, value] of Object.entries(fixture.viewerHeaders))
        response.setHeader(key, value);
      response.end(JSON.stringify(fixture.viewer));
    } else if (path === `${prefix}/pulls/101/comments`)
      response.end(JSON.stringify(fixture.inline));
    else if (path === `${prefix}/issues/101/comments`) response.end(JSON.stringify(fixture.issue));
    else if (path === `${prefix}/pulls/101/ccr/review_threads`)
      response.end(
        JSON.stringify(
          fixture.inline
            .filter((comment) => comment.in_reply_to_id == null)
            .map((root) => ({
              resolved: false,
              outdated: false,
              path: root.path,
              line: root.line,
              comment_ids: [
                root.id,
                ...fixture.inline
                  .filter((comment) => comment.in_reply_to_id === root.id)
                  .map((comment) => comment.id),
              ],
            })),
        ),
      );
    else void fallback(request, response);
  });
  return fixture;
}
