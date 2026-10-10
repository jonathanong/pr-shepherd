import { describe, expect, it, vi } from "vitest";
import { wire, serve, repo, prefix } from "../../test-helpers/github/rest-read.test-support.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import { applyResolveOptions, autoResolveThreads } from "./resolve.mts";
import { loadSeenMap, markSeen, mutationWasDenied } from "../state/seen-comments.mts";
import { EXIT } from "../exit-codes.mts";
import { recordRestIdentity } from "../github/rest-identities.mts";

const key = { owner: repo.owner, repo: repo.name, pr: 101 };
const refusals = [
  {
    message:
      'GitHub access to this repository is not enabled for this session. Use add_repo to request access. If add_repo answers that read access is already available and you need GitHub API or write access, call add_repo again with access:"push" ...',
    documentation_url: "https://docs.anthropic.com/en/docs/claude-code/github-actions",
  },
  {
    message:
      "This GitHub API path is not available: sessions are bound to their configured repositories. ...",
    documentation_url: "https://docs.anthropic.com/...",
  },
  {
    message: `Request refused by the cloud proxy. ${"Repository access must be configured. ".repeat(8)}`,
    documentation_url: "https://docs.anthropic.com/en/docs/claude-code/github-actions",
  },
];

describe("REST review session refusals", () => {
  it.each(
    refusals.flatMap((refusal) =>
      ["reply", "resolve", "dismiss"].map((kind) => ({ refusal, kind })),
    ),
  )(
    "stops $kind without marking a target denied after $refusal.message",
    async ({ refusal, kind }) => {
      vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
      const ids = kind === "dismiss" ? ["77", "78"] : ["rest-thread-11", "rest-thread-12"];
      await markSeen(key, ids[0]!, "Reviewer request");
      let refused = true;
      await serve((request, response) => {
        if (request.method !== "GET") {
          if (refused) {
            response.statusCode = 403;
            response.end(JSON.stringify(refusal));
          } else
            response.end(
              JSON.stringify(
                kind === "reply"
                  ? { id: 99 }
                  : kind === "resolve"
                    ? { resolved: true }
                    : { state: "DISMISSED" },
              ),
            );
        } else if (request.path === "/user") response.end('{"login":"agent"}');
        else response.end("[]");
      });
      const opts =
        kind === "reply"
          ? { replyThreadIds: ids, dismissMessage: "Fixed." }
          : kind === "resolve"
            ? { resolveThreadIds: ids }
            : { dismissReviewIds: ids, dismissMessage: "Fixed." };
      const apply = () =>
        runWithGithubTransport("rest", () => applyResolveOptions(101, repo, opts));
      const first = await apply();
      const pendingIds =
        kind === "reply"
          ? first.unrepliedThreads
          : kind === "resolve"
            ? first.unresolvedThreads
            : first.undismissedReviews;
      expect(first).toMatchObject({
        sessionRefusal: expect.stringContaining(JSON.stringify(refusal)),
        instructions: [
          "Restore GitHub access for this session using the proxy instructions above.",
          "Retry only the pending IDs listed above.",
        ],
        ...(kind === "reply" && { unrepliedThreads: ids }),
        ...(kind === "resolve" && { unresolvedThreads: ids }),
        ...(kind === "dismiss" && { undismissedReviews: ids }),
      });
      expect(wire.requests.filter(({ method }) => method !== "GET")).toHaveLength(1);
      expect(mutationWasDenied(ids[0]!, "Reviewer request", await loadSeenMap(key))).toBe(false);
      refused = false;
      const retryOptions =
        kind === "reply"
          ? { replyThreadIds: pendingIds, dismissMessage: "Fixed." }
          : kind === "resolve"
            ? { resolveThreadIds: pendingIds }
            : { dismissReviewIds: pendingIds, dismissMessage: "Fixed." };
      const result = await runWithGithubTransport("rest", () =>
        applyResolveOptions(101, repo, retryOptions),
      );
      expect(result.errors).toEqual([]);
      expect(
        kind === "reply"
          ? result.repliedThreads
          : kind === "resolve"
            ? result.resolvedThreads
            : result.dismissedReviews,
      ).toEqual(ids);
      expect(wire.requests.filter(({ method }) => method !== "GET")).toHaveLength(3);
    },
  );

  it("does not swallow a proxy refusal while identifying the reply author", async () => {
    await serve((request, response) => {
      expect(request.path).toBe("/user");
      response.statusCode = 403;
      response.end(JSON.stringify(refusals[0]));
    });
    const result = await runWithGithubTransport("rest", () =>
      applyResolveOptions(101, repo, {
        replyThreadIds: ["rest-thread-11"],
        dismissMessage: "Fixed.",
      }),
    );
    expect(result).toMatchObject({
      sessionRefusal: expect.stringContaining("not enabled for this session"),
      unrepliedThreads: ["rest-thread-11"],
    });
    expect(wire.requests).toHaveLength(1);
    expect(wire.requests.some(({ path }) => path.startsWith(prefix))).toBe(false);
  });

  it("keeps a successful reply out of the pending IDs when a later reply is refused", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    let writes = 0;
    await serve((request, response) => {
      if (request.path === "/user") response.end('{"login":"agent"}');
      else if (request.method === "POST") {
        writes++;
        if (writes === 2) {
          response.statusCode = 403;
          response.end(JSON.stringify(refusals[0]));
        } else response.end('{"id":99}');
      } else response.end("[]");
    });

    const first = await runWithGithubTransport("rest", () =>
      applyResolveOptions(101, repo, {
        replyThreadIds: ["rest-thread-11", "rest-thread-12"],
        dismissMessage: "Fixed.",
      }),
    );
    expect(first).toMatchObject({
      repliedThreads: ["rest-thread-11"],
      unrepliedThreads: ["rest-thread-12"],
      sessionRefusal: expect.stringContaining("not enabled for this session"),
    });

    const retry = await runWithGithubTransport("rest", () =>
      applyResolveOptions(101, repo, {
        replyThreadIds: first.unrepliedThreads,
        dismissMessage: "Fixed.",
      }),
    );
    expect(retry).toMatchObject({ repliedThreads: ["rest-thread-12"], errors: [] });
    expect(wire.requests.filter(({ method }) => method === "POST").map(({ path }) => path)).toEqual(
      [
        `${prefix}/pulls/101/comments/11/replies`,
        `${prefix}/pulls/101/comments/12/replies`,
        `${prefix}/pulls/101/comments/12/replies`,
      ],
    );
  });

  it("aborts automatic resolution with NOPERM after a session refusal", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await recordRestIdentity(repo, 101, "PRRT_opaque", 11, "thread");
    await serve((_request, response) => {
      response.statusCode = 403;
      response.end(JSON.stringify(refusals[0]));
    });

    await expect(
      runWithGithubTransport("rest", () => autoResolveThreads(["PRRT_opaque"])),
    ).rejects.toMatchObject({ exitCode: EXIT.NOPERM });
    expect(wire.requests.filter(({ method }) => method === "POST")).toHaveLength(1);
  });
});
