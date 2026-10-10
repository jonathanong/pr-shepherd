import { describe, expect, it, vi } from "vitest";
import {
  wire,
  serve,
  repo,
  prefix,
  comment,
} from "../../test-helpers/github/rest-read.test-support.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import { recordRestIdentity } from "../github/rest-identities.mts";
import { applyResolveOptions } from "./resolve.mts";
import { loadSeenMap, markSeen, mutationWasDenied } from "../state/seen-comments.mts";
import { readRestFeedback } from "../github/rest-feedback-read.mts";
import { threadTranscriptBody } from "../threads/transcript.mts";

const key = { owner: repo.owner, repo: repo.name, pr: 101 };
const cases = [403, 404].flatMap((status) =>
  ["reply", "resolve", "dismiss"].map((kind) => ({ status, kind })),
);

describe("definite REST target denials", () => {
  it.each(cases)(
    "suppresses $kind HTTP $status until the displayed body changes",
    async ({ status, kind }) => {
      vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
      const id = kind === "dismiss" ? "PRR_77" : "rest-thread-11";
      let body = "Reviewer request";
      let denied = true;
      await recordRestIdentity(repo, 101, "PRR_77", 77, "review");
      await markSeen(key, id, body);
      await serve((request, response) => {
        const path = request.path.split("?")[0];
        if (request.method !== "GET") {
          if (denied) {
            response.statusCode = status;
            response.end('{"message":"Resource not accessible"}');
          } else
            response.end(
              JSON.stringify(
                path?.endsWith("/replies")
                  ? { id: 99 }
                  : path?.endsWith("/resolve")
                    ? { resolved: true }
                    : { state: "DISMISSED" },
              ),
            );
        } else if (path === "/user") response.end('{"login":"agent"}');
        else if (path === `${prefix}/pulls/101/comments`)
          response.end(JSON.stringify([{ ...comment(11), body }]));
        else if (path?.endsWith("/reviews"))
          response.end(
            JSON.stringify([
              {
                ...comment(77),
                node_id: "PRR_77",
                body,
                state: "CHANGES_REQUESTED",
                commit_id: "aaa111",
                submitted_at: comment(77).created_at,
              },
            ]),
          );
        else if (path?.endsWith("/ccr/review_threads"))
          response.end(
            JSON.stringify([
              {
                resolved: false,
                outdated: false,
                path: "src/index.mts",
                line: 5,
                comment_ids: [11],
              },
            ]),
          );
        else response.end("[]");
      });
      const options =
        kind === "reply"
          ? { replyThreadIds: [id], dismissMessage: "Fixed." }
          : kind === "resolve"
            ? { resolveThreadIds: [id] }
            : { dismissReviewIds: [id], dismissMessage: "Fixed." };
      const apply = () =>
        runWithGithubTransport("rest", () => applyResolveOptions(101, repo, options));
      expect((await apply()).errors).toEqual([expect.stringContaining(String(status))]);
      const seen = await loadSeenMap(key);
      expect(mutationWasDenied(id, body, seen)).toBe(true);
      expect(wire.requests.filter(({ method }) => method !== "GET")).toHaveLength(1);
      body = "Edited reviewer request";
      const feedback = await readRestFeedback(101, repo);
      const edited =
        kind === "dismiss" ? feedback.reviews[0]!.body : threadTranscriptBody(feedback.threads[0]!);
      expect(mutationWasDenied(id, edited, seen)).toBe(false);
      denied = false;
      const result = await apply();
      expect(result.errors).toEqual([]);
      expect(
        kind === "reply"
          ? result.repliedThreads
          : kind === "resolve"
            ? result.resolvedThreads
            : result.dismissedReviews,
      ).toEqual([id]);
      expect(wire.requests.filter(({ method }) => method !== "GET")).toHaveLength(2);
    },
  );

  it("reports a headerless abuse-detection throttle without suppressing the target", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await markSeen(key, "rest-thread-11", "Reviewer request");
    await serve((_request, response) => {
      response.statusCode = 403;
      response.end(
        '{"message":"You have triggered an abuse detection mechanism. Please wait a few minutes before you try again."}',
      );
    });
    const result = await runWithGithubTransport("rest", () =>
      applyResolveOptions(101, repo, { resolveThreadIds: ["rest-thread-11", "rest-thread-12"] }),
    );
    expect(result.rateLimit?.message).toContain("abuse detection");
    expect(result.unresolvedThreads).toEqual(["rest-thread-11", "rest-thread-12"]);
    expect(mutationWasDenied("rest-thread-11", "Reviewer request", await loadSeenMap(key))).toBe(
      false,
    );
    expect(wire.requests).toHaveLength(1);
  });

  it.each(["core quota", "server failure", "lost response"])(
    "does not suppress a $s as a target denial",
    async (failure) => {
      vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
      await markSeen(key, "rest-thread-11", "Reviewer request");
      await serve((_request, response) => {
        if (failure === "lost response") {
          response.destroy();
          return;
        }
        response.statusCode = failure === "core quota" ? 404 : 503;
        if (failure === "core quota") {
          response.setHeader("x-ratelimit-resource", "core");
          response.setHeader("x-ratelimit-remaining", "0");
          response.setHeader("x-ratelimit-limit", "5000");
          response.setHeader("x-ratelimit-reset", "9999999999");
        }
        response.end('{"message":"Unavailable"}');
      });
      const result = await runWithGithubTransport("rest", () =>
        applyResolveOptions(101, repo, { resolveThreadIds: ["rest-thread-11", "rest-thread-12"] }),
      );
      expect(result.unresolvedThreads).toEqual(["rest-thread-11", "rest-thread-12"]);
      expect(mutationWasDenied("rest-thread-11", "Reviewer request", await loadSeenMap(key))).toBe(
        false,
      );
      expect(wire.requests).toHaveLength(1);
    },
  );
});
