import { describe, expect, it } from "vitest";
import {
  apply,
  harness,
  input,
  key,
  submissions,
} from "../../test-helpers/github/merge-boundary-support.mts";
import { pendingMerge } from "../../test-helpers/github/merge-wire.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import { readMergeRequest } from "../state/merge-request.mts";
import { runApplyMerge } from "./apply-merge.mts";

describe("malformed asynchronous merge responses over HTTP", () => {
  it.each([400, 409])(
    "records an HTTP %s error envelope as a definite failure and permits one guarded successor",
    async (status) => {
      const message = "Pull request is not ready to merge.";
      harness.fixture.submitStatus = status;
      harness.fixture.submitBody = { message } as unknown as typeof harness.fixture.submitBody;
      await expect(apply()).rejects.toMatchObject({
        status,
        responseMessage: expect.stringContaining(message),
      });
      const failure = await readMergeRequest(key);
      expect(failure).toMatchObject({
        response: { status: "failed", details: { message: expect.stringContaining(message) } },
      });
      expect(failure?.uncertain).toBeUndefined();
      expect(failure?.uuid).toBeUndefined();
      await expect(apply()).resolves.toMatchObject({ status: "failed" });
      expect(submissions()).toHaveLength(1);

      const nextHead = "c".repeat(40);
      harness.fixture.snapshot.head.sha = nextHead;
      harness.fixture.submitStatus = 202;
      harness.fixture.submitBody = pendingMerge();
      harness.fixture.submitBody.details.expected_head_sha = nextHead;
      const next = () =>
        runWithGithubTransport("rest", () => runApplyMerge({ ...input, requireSha: nextHead }));
      const outcomes = await Promise.all([next(), next()]);
      expect(outcomes.some(({ status }) => status === "pending")).toBe(true);
      expect(submissions()).toHaveLength(2);
      expect(submissions()[1]?.body["sha"]).toBe(nextHead);
      expect(await readMergeRequest(key)).toMatchObject({
        options: { requireSha: nextHead },
        response: { status: "pending" },
      });
    },
  );

  it.each([200, 202])(
    "keeps an HTTP %s malformed acknowledgement uncertain even after a head update",
    async (status) => {
      harness.fixture.submitStatus = status;
      harness.fixture.submitBody = {
        message: "Acknowledgement missing state",
      } as unknown as typeof harness.fixture.submitBody;
      await expect(apply()).resolves.toMatchObject({ status: "failed", uncertain: true });
      const intent = await readMergeRequest(key);
      expect(intent?.uuid).toBeUndefined();
      expect(intent?.response).toBeUndefined();
      await expect(apply()).resolves.toMatchObject({ status: "failed", uncertain: true });

      const nextHead = "c".repeat(40);
      harness.fixture.snapshot.head.sha = nextHead;
      harness.fixture.submitBody = pendingMerge();
      harness.fixture.submitBody.details.expected_head_sha = nextHead;
      await expect(
        runWithGithubTransport("rest", () => runApplyMerge({ ...input, requireSha: nextHead })),
      ).resolves.toMatchObject({ status: "failed", uncertain: true });
      expect(submissions()).toHaveLength(1);
      expect((await readMergeRequest(key))?.options.requireSha).toBe(input.requireSha);
    },
  );
});
