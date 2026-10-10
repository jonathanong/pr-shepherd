import { describe, expect, it, vi } from "vitest";
import { wire, serve, repo, prefix } from "../../test-helpers/github/rest-read.test-support.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import { recordRestIdentity, recordThreadIdentity } from "../github/rest-identities.mts";
import { applyResolveOptions, autoResolveThreads } from "./resolve.mts";
import { addPrShepherdMarker } from "./marker.mts";
import { runMarkFilesAsViewed } from "../commands/mark-files-as-viewed.mts";

const apply = (opts: Parameters<typeof applyResolveOptions>[2]) =>
  runWithGithubTransport("rest", () => applyResolveOptions(101, repo, opts));
describe("REST user-directed review actions", () => {
  it("uses persisted opaque node identities and forwards replies, CCR resolution and dismissals", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await recordThreadIdentity(repo, 101, "PRRT_opaque", "11");
    await recordRestIdentity(repo, 101, "PRR_opaque", "77", "review");
    await serve((request, response) => {
      if (request.path === "/user") response.end('{"login":"agent"}');
      else if (request.method === "GET") response.end("[]");
      else if (request.path.endsWith("/replies")) response.end('{"id":12}');
      else if (request.path.endsWith("/resolve")) response.end('{"resolved":true}');
      else if (request.path.endsWith("/dismissals")) response.end('{"state":"DISMISSED"}');
      else {
        response.statusCode = 404;
        response.end("{}");
      }
    });
    const result = await apply({
      replyThreadIds: ["PRRT_opaque"],
      resolveThreadIds: ["rest-thread-11"],
      dismissReviewIds: ["PRR_opaque"],
      dismissMessage: "Fixed in the new commit.",
    });
    expect(result).toMatchObject({
      repliedThreads: ["PRRT_opaque"],
      resolvedThreads: ["rest-thread-11"],
      dismissedReviews: ["PRR_opaque"],
      errors: [],
    });
    expect(wire.requests.filter((request) => request.method !== "GET")).toEqual([
      {
        method: "POST",
        path: `${prefix}/pulls/101/comments/11/replies`,
        body: { body: addPrShepherdMarker("Fixed in the new commit.") },
      },
      { method: "POST", path: `${prefix}/pulls/101/ccr/comments/11/resolve`, body: {} },
      {
        method: "PUT",
        path: `${prefix}/pulls/101/reviews/77/dismissals`,
        body: { message: "Fixed in the new commit." },
      },
    ]);
  });
  it("resolves generated opaque threads using the stored repository context", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await recordThreadIdentity(repo, 101, "PRRT_opaque", 11);
    await serve((_request, response) => response.end('{"resolved":true}'));
    expect(await runWithGithubTransport("rest", () => autoResolveThreads(["PRRT_opaque"]))).toEqual(
      { resolved: ["PRRT_opaque"], errors: [] },
    );
    expect(wire.requests).toMatchObject([
      { method: "POST", path: `${prefix}/pulls/101/ccr/comments/11/resolve` },
    ]);
  });
  it("reports unsupported explicit minimization and file-view operations without writes", async () => {
    await serve((_request, response) => response.end("{}"));
    const minimized = await apply({ minimizeCommentIds: ["IC_opaque"] });
    expect(minimized.minimizedComments).toEqual([]);
    expect(minimized.errors).toEqual([
      expect.stringContaining("minimizeComment is unsupported in REST transport"),
    ]);
    await expect(
      runWithGithubTransport("rest", () =>
        runMarkFilesAsViewed({
          prNumber: 101,
          format: "json",
          targetRepository: repo,
          files: ["src/index.mts"],
        }),
      ),
    ).rejects.toThrow("markFileAsViewed is unsupported in REST transport");
    expect(wire.requests).toEqual([]);
  });
  it("stops on a core rate limit with exact successes and remaining pending IDs", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await serve((request, response) => {
      if (request.path.endsWith("/11/resolve")) response.end('{"resolved":true}');
      else {
        response.statusCode = 403;
        response.setHeader("x-ratelimit-resource", "core");
        response.setHeader("x-ratelimit-remaining", "0");
        response.setHeader("x-ratelimit-limit", "5000");
        response.setHeader("x-ratelimit-reset", "9999999999");
        response.end('{"message":"API rate limit exceeded"}');
      }
    });
    const result = await apply({
      resolveThreadIds: ["rest-thread-11", "rest-thread-12", "rest-thread-13"],
    });
    expect(result.resolvedThreads).toEqual(["rest-thread-11"]);
    expect(result.unresolvedThreads).toEqual(["rest-thread-12", "rest-thread-13"]);
    expect(result.rateLimit).toMatchObject({ resource: "core", remaining: 0 });
    expect(wire.requests).toHaveLength(2);
  });
});
