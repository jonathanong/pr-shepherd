import { expect, it, vi } from "vitest";
import {
  apply,
  harness,
  input,
  key,
  submissions,
} from "../../test-helpers/github/merge-boundary-support.mts";
import { mergeUuid, pendingMerge } from "../../test-helpers/github/merge-wire.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import { readMergeRequest } from "../state/merge-request.mts";
import { runApplyMerge } from "./apply-merge.mts";

it("a delayed old UUID poll cannot overwrite or replay the next guarded request", async () => {
  await apply();
  harness.fixture.pollBody = { status: "enqueued", details: { message: "Delayed outcome" } };
  const paused = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  let delay = true;
  vi.stubGlobal("fetch", async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const response = await harness.wire.fetch(url, init);
    if (String(url).endsWith(`/merge-async/${mergeUuid}`) && delay) {
      delay = false;
      paused.resolve();
      await resume.promise;
    }
    return response;
  });
  const stalePoll = apply();
  await paused.promise;
  harness.fixture.pollBody = { status: "enqueued", details: { message: "First outcome" } };
  await expect(apply()).resolves.toMatchObject({ status: "enqueued" });
  const newHead = "c".repeat(40);
  harness.fixture.snapshot.head.sha = newHead;
  harness.fixture.submitBody = pendingMerge();
  harness.fixture.submitBody.details.expected_head_sha = newHead;
  const applyNext = () =>
    runWithGithubTransport("rest", () => runApplyMerge({ ...input, requireSha: newHead }));
  await expect(applyNext()).resolves.toMatchObject({ status: "pending" });
  resume.resolve();
  await expect(stalePoll).resolves.toMatchObject({
    status: "enqueued",
    details: { message: "Delayed outcome" },
  });
  expect(await readMergeRequest(key)).toMatchObject({
    options: { requireSha: newHead },
    response: { status: "pending" },
  });
  harness.fixture.pollBody = harness.fixture.submitBody;
  await expect(applyNext()).resolves.toMatchObject({ status: "pending" });
  expect(submissions()).toHaveLength(2);
});
