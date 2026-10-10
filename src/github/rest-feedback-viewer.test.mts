import { describe, expect, it, vi } from "vitest";
import { wire, repo } from "../../test-helpers/github/rest-read.test-support.mts";
import {
  serveViewerFeedback,
  authoredComment,
} from "../../test-helpers/github/rest-viewer-feedback.test-support.mts";
import { readRestFeedback } from "./rest-feedback-read.mts";
import { readRestRawThread } from "./rest-thread-read.mts";
import { fetchRestRawSummaryPr } from "./rest-batch-read.mts";
import { runWithGithubTransport } from "./transport.mts";
import { classifyThreadVisibility } from "../comments/thread-visibility.mts";
import { threadTranscriptBody } from "../threads/transcript.mts";
import { hashBody } from "../state/seen-comments.mts";
import { addPrShepherdMarker } from "../comments/marker.mts";
import { buildThreadMutationRouting } from "../commands/iterate/thread-mutation-routing.mts";
import { buildResolveCommand } from "../commands/iterate/classify.mts";

describe("authenticated REST thread authorship", () => {
  it("matches the actual viewer case-insensitively on roots and each reply without claiming other humans or bots", async () => {
    const fixture = await serveViewerFeedback();
    fixture.issue = [authoredComment(41, "ALICE")];
    const feedback = await readRestFeedback(101, repo);
    expect(feedback.viewerLogin).toBe("aLiCe");
    expect(feedback.threads[0]).toMatchObject({
      viewerDidAuthor: true,
      comments: [{ viewerDidAuthor: true }, { viewerDidAuthor: true }],
    });
    expect(feedback.threads[1]).not.toHaveProperty("viewerDidAuthor");
    expect(feedback.threads[1]?.comments?.[1]?.viewerDidAuthor).toBe(true);
    expect(feedback.threads[2]).not.toHaveProperty("viewerDidAuthor");
    expect(feedback.threads[2]?.comments?.[1]).not.toHaveProperty("viewerDidAuthor");
    expect(feedback.comments[0]).not.toHaveProperty("viewerDidAuthor");
  });

  it.each(["ALICE", null])(
    "reuses the tick-local known principal %s without another user lookup",
    async (viewer) => {
      await serveViewerFeedback();
      const feedback = await readRestFeedback(101, repo, viewer);
      if (viewer) expect(feedback.threads[0]?.viewerDidAuthor).toBe(true);
      else expect(feedback.threads[0]).not.toHaveProperty("viewerDidAuthor");
      expect(wire.requests.some(({ path }) => path === "/user")).toBe(false);
    },
  );

  it.each([null, {}, { login: 123 }])(
    "leaves a missing or malformed author principal unknown: %j",
    async (user) => {
      const fixture = await serveViewerFeedback();
      fixture.inline = [
        { ...authoredComment(11, "ALICE"), user } as unknown as (typeof fixture.inline)[number],
      ];
      const feedback = await readRestFeedback(101, repo);
      expect(feedback.threads[0]).toMatchObject({ author: "unknown" });
      expect(feedback.threads[0]).not.toHaveProperty("viewerDidAuthor");
    },
  );

  it("retains viewer authorship in hydrated raw transcripts and aggregate raw summaries", async () => {
    await serveViewerFeedback();
    const raw = await readRestRawThread("rest-thread-11", repo, 101);
    expect(raw.comments.nodes[0]?.viewerDidAuthor).toBe(true);
    expect(raw.comments.nodes[1]?.viewerDidAuthor).toBe(true);
    const summary = await fetchRestRawSummaryPr(101, repo);
    expect(summary.reviewThreads.nodes[0]?.comments.nodes[0]?.viewerDidAuthor).toBe(true);
    expect(summary.reviewThreads.nodes[1]?.comments.nodes[0]).not.toHaveProperty("viewerDidAuthor");
  });

  it("keeps a seen viewer-authored unresolved thread repeatable and eligible for paired reply and resolve", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await serveViewerFeedback();
    const { threads } = await readRestFeedback(101, repo);
    const seen = new Map(
      threads.map((thread) => [
        thread.id,
        { seenAt: 1, bodyHash: hashBody(threadTranscriptBody(thread)) },
      ]),
    );
    const visible = classifyThreadVisibility(threads, seen);
    expect(visible.activeThreads.map(({ id }) => id)).toEqual(["rest-thread-11", "rest-thread-31"]);
    const routed = buildThreadMutationRouting(visible.activeThreads, new Set(), []);
    expect(routed.pairedResolveThreadIds).toContain("rest-thread-11");
    expect(routed.pairedResolveThreadIds).not.toContain("rest-thread-21");
  });

  it("emits only a resolve command for a marker-ended viewer thread, even after its transcript was seen", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    const fixture = await serveViewerFeedback();
    fixture.inline = [
      authoredComment(11, "ALICE"),
      { ...authoredComment(12, "alice", 11), body: addPrShepherdMarker("Addressed.") },
    ];
    await runWithGithubTransport("rest", async () => {
      const { threads } = await readRestFeedback(101, repo);
      const seen = new Map(
        threads.map((thread) => [
          thread.id,
          { seenAt: 1, bodyHash: hashBody(threadTranscriptBody(thread)) },
        ]),
      );
      const visible = classifyThreadVisibility(threads, seen);
      expect(visible.activeThreads).toEqual([]);
      expect(visible.resolutionOnlyThreads.map(({ id }) => id)).toEqual(["rest-thread-11"]);
      const { resolveCommand } = buildResolveCommand(
        [],
        visible.resolutionOnlyThreads,
        [],
        [],
        [],
        "octocat/hello-world#101",
        new Set(),
        [],
        undefined,
        threads,
      );
      expect(resolveCommand.resolveThreadIds).toEqual(["rest-thread-11"]);
      expect(resolveCommand.replyThreadIds).toBeUndefined();
      expect(resolveCommand.argv).toContain("--resolve-thread-ids");
    });
  });
});
