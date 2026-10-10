import { describe, expect, it, vi } from "vitest";
import {
  apply,
  harness,
  input,
  key,
  submissions,
} from "../../test-helpers/github/merge-boundary-support.mts";
import { pendingMerge } from "../../test-helpers/github/merge-wire.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import { readMergeRequest, writeMergeRequest } from "../state/merge-request.mts";
import { runApplyMerge } from "./apply-merge.mts";

const nextHead = "c".repeat(40);
const applyNext = () =>
  runWithGithubTransport("rest", () => runApplyMerge({ ...input, requireSha: nextHead }));
function moveHead() {
  harness.fixture.snapshot.head.sha = nextHead;
  harness.fixture.submitBody = pendingMerge();
  harness.fixture.submitBody.details.expected_head_sha = nextHead;
}
describe("new guarded merge after an old enqueue", () => {
  it("resumes repeated same-head queue commands as a recorded outcome without a fresh submission", async () => {
    const queue = () =>
      runWithGithubTransport("rest", () =>
        runApplyMerge({ ...input, mergeAction: "merge_queue", mergeMethod: undefined }),
      );
    harness.fixture.submitBody = { status: "enqueued", details: { message: "Enqueued SHA" } };
    await expect(queue()).resolves.toMatchObject({ status: "enqueued" });
    harness.fixture.submitBody = pendingMerge();
    const results = await Promise.all(Array.from({ length: 8 }, queue));
    for (const result of results)
      expect(result).toMatchObject({
        status: "enqueued",
        note: expect.stringContaining("current merge-queue membership is not confirmed"),
      });
    expect(submissions()).toHaveLength(1);
    expect(submissions()[0]?.body).toEqual({
      sha: input.requireSha,
      merge_action: "merge_queue",
      bypass_rules: false,
    });
    expect(await readMergeRequest(key)).toMatchObject({
      options: { requireSha: input.requireSha, mergeAction: "merge_queue" },
      response: { status: "enqueued" },
    });
  });

  it("allows only one fresh request for a verified new head after the old enqueue completed", async () => {
    harness.fixture.submitBody = { status: "enqueued", details: { message: "Enqueued old SHA" } };
    await apply();
    moveHead();
    const results = await Promise.all([applyNext(), applyNext()]);
    expect(results.some(({ status }) => status === "pending")).toBe(true);
    expect(submissions()).toHaveLength(2);
    expect(submissions()[1]?.body["sha"]).toBe(nextHead);
    expect(await readMergeRequest(key)).toMatchObject({
      options: { requireSha: nextHead },
      response: { status: "pending" },
    });
  });

  it("does not retire the enqueue merely because the requested SHA differs from the current head", async () => {
    harness.fixture.submitBody = { status: "enqueued", details: {} };
    await apply();
    await expect(applyNext()).resolves.toMatchObject({ status: "failed" });
    expect((await readMergeRequest(key))?.options.requireSha).toBe(input.requireSha);
    expect(submissions()).toHaveLength(1);
  });

  it("keeps same-head option changes blocked rather than re-enqueueing", async () => {
    harness.fixture.submitBody = { status: "enqueued", details: {} };
    await apply();
    await expect(
      runWithGithubTransport("rest", () => runApplyMerge({ ...input, mergeMethod: "rebase" })),
    ).resolves.toMatchObject({ status: "failed", uncertain: true });
    expect(submissions()).toHaveLength(1);
  });

  it.each(["pending", "uncertain"])(
    "never retires an old %s submission on head advancement",
    async (kind) => {
      if (kind === "uncertain") harness.fixture.failMutation = true;
      await apply();
      harness.fixture.failMutation = false;
      moveHead();
      await expect(applyNext()).resolves.toMatchObject({ status: "failed", uncertain: true });
      expect(submissions()).toHaveLength(1);
    },
  );

  it("does not retire even a terminal enqueue if the record remains uncertain", async () => {
    await writeMergeRequest(key, {
      version: 1,
      options: input,
      startedAtUnix: 1,
      response: { status: "enqueued", details: {} },
      uncertain: true,
    }).catch(async () => {
      // Create the state directory through the normal initial request path.
      await apply();
      await writeMergeRequest(key, {
        version: 1,
        options: input,
        startedAtUnix: 1,
        response: { status: "enqueued", details: {} },
        uncertain: true,
      });
    });
    moveHead();
    await expect(applyNext()).resolves.toMatchObject({ status: "failed", uncertain: true });
    expect(submissions()).toHaveLength(1);
  });

  it("keeps distinct generations when failed options recur in the same second", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    harness.fixture.submitBody = { status: "failed", details: { message: "Refused" } };
    const rebase = () =>
      runWithGithubTransport("rest", () => runApplyMerge({ ...input, mergeMethod: "rebase" }));
    for (const request of [apply, rebase, apply, rebase])
      await expect(request()).resolves.toMatchObject({ status: "failed" });
    expect(submissions()).toHaveLength(4);
    expect(await readMergeRequest(key)).toMatchObject({
      options: { mergeMethod: "rebase" },
      replacementToken: expect.any(String),
    });
  });
});
