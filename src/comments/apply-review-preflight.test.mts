import { describe, expect, it } from "vitest";
import {
  HEAD,
  applyReview,
  comment,
  harness,
  key,
  message,
  operations,
  wire,
} from "../../test-helpers/comments/apply-review-preflight.test-support.mts";
import { repo } from "../../test-helpers/github/rest-read.test-support.mts";
import { readApplyReviewPreflight } from "../github/apply-review-preflight.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import { addPrShepherdMarker } from "./marker.mts";
import { readSeenMarker, hashBody } from "../state/seen-comments.mts";
import { threadTranscriptBodies } from "../threads/transcript.mts";

describe("apply review preflight", () => {
  it("reads the head, transcript and recovery evidence in one request", async () => {
    await harness();

    const result = await applyReview(["PRRT_a"], HEAD);

    expect(result).toMatchObject({ repliedThreads: ["PRRT_a"], errors: [] });
    expect(operations()).toEqual(["ApplyReviewPreflight", "BulkApply"]);
    expect(await readSeenMarker(key, "PRRT_a")).toMatchObject({
      bodyHash: hashBody(threadTranscriptBodies([comment(1).body, addPrShepherdMarker(message)])),
    });
  });

  it("polls the head and re-reads evidence when the preflight saw an older head", async () => {
    await harness({ head: "b".repeat(40), polledHead: HEAD });

    await applyReview(["PRRT_a"], HEAD);

    expect(operations()).toEqual([
      "ApplyReviewPreflight",
      "GetPrHeadSha",
      "ReplyRecoveryEvidence",
      "BulkApply",
    ]);
  });

  it("still refuses to mutate when the required head never arrives", async () => {
    await harness({ head: "b".repeat(40) });
    const { loadConfig } = await import("../config/load.mts");
    const config = loadConfig();
    const poll = config.resolve.shaPoll;
    Object.assign(poll, { intervalMs: 0, maxAttempts: 2 });

    await expect(applyReview(["PRRT_a"], HEAD)).rejects.toThrow("head SHA has not updated");
    expect(operations()).not.toContain("BulkApply");
  });

  it("pages long threads through the standalone reads", async () => {
    await harness({ threads: { PRRT_a: 1, PRRT_long: 150 } });

    const result = await applyReview(["PRRT_a", "PRRT_long"]);

    expect(result).toMatchObject({ repliedThreads: ["PRRT_a", "PRRT_long"] });
    expect(operations()).toEqual([
      "ApplyReviewPreflight",
      // The long thread's evidence pages from the preflight's first page.
      "ReplyRecoveryEvidence",
      "ReplyThreadTranscripts",
      "ReplyThreadComments",
      "BulkApply",
    ]);
    const bodies = Array.from({ length: 150 }, (_, index) => comment(index + 1).body);
    expect(await readSeenMarker(key, "PRRT_long")).toMatchObject({
      bodyHash: hashBody(threadTranscriptBodies([...bodies, addPrShepherdMarker(message)])),
    });
  });

  it("falls back to the standalone reads when the preflight fails", async () => {
    await harness({ failPreflight: true });

    const result = await applyReview(["PRRT_a"], HEAD);

    expect(result).toMatchObject({ repliedThreads: ["PRRT_a"] });
    expect(operations()).toEqual([
      "ApplyReviewPreflight",
      "ReplyThreadTranscripts",
      "GetPrHeadSha",
      "ReplyRecoveryEvidence",
      "BulkApply",
    ]);
  });

  it("re-reads evidence for a thread the preflight could not verify", async () => {
    await harness();

    await applyReview(["PRRT_a", "PRRT_missing"]);

    expect(operations()).toEqual([
      "ApplyReviewPreflight",
      "ReplyThreadTranscripts",
      "ReplyRecoveryEvidence",
      "BulkApply",
    ]);
  });

  it("records an uncertain reply from preflight evidence and adopts it on retry", async () => {
    const fixture = await harness({ failMutation: true });

    const first = await applyReview(["PRRT_a"]);
    expect(first).toMatchObject({ repliedThreads: [], unrepliedThreads: ["PRRT_a"] });
    expect(operations()).toEqual(["ApplyReviewPreflight", "BulkApply"]);

    fixture.failMutation = false;
    const retry = await applyReview(["PRRT_a"]);
    expect(retry).toMatchObject({ repliedThreads: ["PRRT_a"], errors: [] });
    expect(operations().filter((name) => name === "BulkApply")).toHaveLength(1);
  });

  it("skips the preflight for REST thread handles and more than 20 threads", async () => {
    await harness();

    await applyReview(["rest-thread-1"]).catch(() => undefined);
    expect(operations()).not.toContain("ApplyReviewPreflight");

    wire.requests.length = 0;
    const many = Array.from({ length: 21 }, (_, index) => `PRRT_${index}`);
    await applyReview(many);
    expect(operations()).not.toContain("ApplyReviewPreflight");
  });

  it("adopts an existing reply from preflight evidence without another read", async () => {
    await harness({ replied: true });

    const result = await applyReview(["PRRT_a"], HEAD, true);

    expect(result).toMatchObject({ repliedThreads: ["PRRT_a"], errors: [] });
    // ReplyThreadTranscripts reads the adopted thread's post-reply transcript for its marker.
    expect(operations()).toEqual(["ApplyReviewPreflight", "ReplyThreadTranscripts"]);
  });

  it("re-reads adoption evidence when the preflight saw an older head", async () => {
    await harness({ head: "b".repeat(40), polledHead: HEAD });

    await applyReview(["PRRT_a"], HEAD, true);

    expect(operations()).toEqual([
      "ApplyReviewPreflight",
      "GetPrHeadSha",
      "ReplyRecoveryEvidence",
      "ReplyRecoveryEvidence",
      "BulkApply",
    ]);
  });

  it("leaves the REST transport on its standalone reads", async () => {
    await harness();

    const preflight = await runWithGithubTransport("rest", () =>
      readApplyReviewPreflight(101, repo, ["PRRT_a"]),
    );

    expect(preflight).toBeNull();
    expect(operations()).toEqual([]);
  });
});
