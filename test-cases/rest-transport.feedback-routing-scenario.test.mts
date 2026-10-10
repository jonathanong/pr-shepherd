import { describe, expect, it, vi } from "vitest";
import {
  serve,
  wire,
  pull,
  prefix,
  repo,
  comment,
} from "../test-helpers/github/rest-read.test-support.mts";
import { restIterateRoutes } from "../test-helpers/github/rest-iterate-routes.test-support.mts";
import { runWithGithubTransport } from "../src/github/transport.mts";
import { runIterate } from "../src/commands/iterate/index.mts";
import { formatIterateResult } from "../src/cli/iterate-formatter.mts";
import { projectIterateLean } from "../src/cli/iterate-lean.mts";
import { addPrShepherdMarker } from "../src/comments/marker.mts";

const tick = () =>
  runWithGithubTransport("rest", () =>
    runIterate({
      prNumber: 101,
      targetRepository: repo,
      format: "json",
      readyDelaySeconds: 0,
      stallTimeoutSeconds: 0,
      noAutoMarkReady: true,
    }),
  );

async function feedbackRoutes(stale = false) {
  vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
  const fixture = {
    inline: [{ ...comment(11), pull_request_review_id: 77 }],
    resolved: stale,
  };
  const fallback = restIterateRoutes();
  await serve((request, response) => {
    const path = request.path.split("?")[0];
    if (path === "/user") response.end('{"login":"reviewer"}');
    else if (path === `${prefix}/pulls/101`)
      response.end(JSON.stringify({ ...pull, mergeable_state: stale ? "blocked" : "clean" }));
    else if (path === `${prefix}/pulls/101/comments`) response.end(JSON.stringify(fixture.inline));
    else if (path === `${prefix}/pulls/101/reviews`)
      response.end(
        JSON.stringify(
          stale
            ? [
                {
                  ...comment(77),
                  node_id: "PRR_77",
                  state: "CHANGES_REQUESTED",
                  commit_id: "old-head",
                  submitted_at: "2026-10-09T00:00:00Z",
                },
              ]
            : [],
        ),
      );
    else if (path === `${prefix}/pulls/101/ccr/review_threads`)
      response.end(
        JSON.stringify([
          {
            resolved: fixture.resolved,
            outdated: false,
            path: "src/index.mts",
            line: 5,
            comment_ids: fixture.inline.map(({ id }) => id),
          },
        ]),
      );
    else if (stale && path?.endsWith("/protection"))
      response.end('{"required_pull_request_reviews":{"required_approving_review_count":1}}');
    else void fallback(request, response);
  });
  return fixture;
}

function assertReadOnlyRest() {
  expect(wire.requests.every(({ method, path }) => method === "GET" && path !== "/graphql")).toBe(
    true,
  );
}

describe("REST feedback preserves review ownership and stale routing through polling", () => {
  it("keeps a viewer-owned thread resolveable after a marked reply, then finishes after resolution", async () => {
    const fixture = await feedbackRoutes();
    const first = await tick();
    expect(first.action).toBe("fix_code");
    if (first.action !== "fix_code") throw new Error("expected active review work");
    expect(first.fix.threads[0]).toMatchObject({ viewerDidAuthor: true });
    expect(first.fix.resolveCommand.argv).toContain("--reply-thread-ids");
    expect(first.fix.resolveCommand.argv).toContain("--resolve-thread-ids");
    expect(formatIterateResult(first)).toContain("viewer-authored");
    expect(projectIterateLean(first)).toMatchObject({
      fix: { threads: [{ viewerDidAuthor: true }] },
    });

    fixture.inline.push({
      ...comment(12, 11),
      pull_request_review_id: 77,
      body: addPrShepherdMarker("The feedback is satisfied."),
    });
    const retry = await tick();
    expect(retry.action).toBe("fix_code");
    if (retry.action !== "fix_code") throw new Error("expected pending resolution");
    expect(retry.fix.resolutionOnlyThreads[0]).toMatchObject({ viewerDidAuthor: true });
    const retryCommand = retry.fix.resolveOnlyCommand ?? retry.fix.resolveCommand;
    expect(retryCommand.argv).toContain("--resolve-thread-ids");
    expect(retryCommand.argv).not.toContain("--reply-thread-ids");
    fixture.resolved = true;
    expect(await tick()).toMatchObject({
      action: "cancel",
      status: "READY",
      reason: "ready-delay-elapsed",
    });
    assertReadOnlyRest();
  });

  it("keeps another human's root reply-only even when a viewer authored its latest reply", async () => {
    const fixture = await feedbackRoutes();
    fixture.inline[0]!.user = { login: "another-reviewer", type: "User" };
    fixture.inline.push({ ...comment(12, 11), pull_request_review_id: 77 });
    const result = await tick();
    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") throw new Error("expected active review work");
    const thread = result.fix.threads[0]!;
    expect(thread).not.toHaveProperty("viewerDidAuthor");
    expect(thread.comments?.[1]).toMatchObject({ viewerDidAuthor: true });
    expect(result.fix.resolveCommand.argv).toContain("--reply-thread-ids");
    expect(result.fix.resolveCommand.argv).not.toContain("--resolve-thread-ids");
    assertReadOnlyRest();
  });

  it("shows a stale human review once and preserves the remaining review gate without reopening feedback", async () => {
    await feedbackRoutes(true);
    const first = await tick();
    expect(first.action).toBe("fix_code");
    if (first.action !== "fix_code") throw new Error("expected first-look review context");
    expect(first.fix.changesRequestedReviews).toMatchObject([{ id: "PRR_77", staleReview: true }]);
    expect(first.fix.instructions.join("\n")).toContain("Ask the reviewer to re-review");
    expect(formatIterateResult(first)).toContain("ask reviewer to re-review or dismiss");
    expect(projectIterateLean(first)).toMatchObject({
      fix: { changesRequestedReviews: [{ staleReview: true }] },
    });
    expect(first.fix.resolveCommand.argv).not.toContain("--dismiss-review-ids");
    const next = await tick();
    expect(next).toMatchObject({
      action: "escalate",
      escalate: {
        triggers: ["transport-unsupported"],
        changesRequestedReviews: [],
        suggestion: expect.stringContaining("reviewDecision"),
      },
    });
    assertReadOnlyRest();
  });
});
