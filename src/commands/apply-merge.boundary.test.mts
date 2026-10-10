import { describe, expect, it, vi } from "vitest";
import {
  apply,
  harness,
  input,
  key,
  submissions,
} from "../../test-helpers/github/merge-boundary-support.mts";
import * as client from "../github/client.mts";
import { mergeUuid } from "../../test-helpers/github/merge-wire.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import { GitHubRequestError } from "../github/errors.mts";
import { readMergeRequest } from "../state/merge-request.mts";
import { runApplyMerge } from "./apply-merge.mts";
import { validateApplyMergeOptions } from "./apply-merge-options.mts";

describe("asynchronous merge reconciliation boundaries", () => {
  it("uses the resolved current PR number when no explicit PR is supplied", async () => {
    const lookup = vi.spyOn(client, "getCurrentPrNumber").mockResolvedValue(1);
    const repository = vi.spyOn(client, "getRepoInfo").mockResolvedValue(input.targetRepository);
    await expect(
      runWithGithubTransport("rest", () =>
        runApplyMerge({ ...input, prNumber: undefined, targetRepository: undefined }),
      ),
    ).resolves.toMatchObject({ pr: 1, status: "pending" });
    expect(lookup).toHaveBeenCalledOnce();
    expect(repository).toHaveBeenCalledOnce();
    expect(submissions()).toHaveLength(1);
  });

  it("fails before HTTP when the current branch has no open PR", async () => {
    const lookup = vi.spyOn(client, "getCurrentPrNumber").mockResolvedValue(null);
    await expect(
      runWithGithubTransport("rest", () => runApplyMerge({ ...input, prNumber: undefined })),
    ).rejects.toMatchObject({ message: expect.stringContaining("No open PR"), exitCode: 69 });
    expect(lookup).toHaveBeenCalledOnce();
    expect(harness.wire.requests).toEqual([]);
  });

  it("reconciles an already merged PR without submitting or adopting a UUID", async () => {
    harness.fixture.snapshot.merged = true;
    await expect(apply()).resolves.toMatchObject({
      status: "merged",
      details: { sha: harness.fixture.snapshot.merge_commit_sha },
    });
    expect(submissions()).toEqual([]);
    expect(await readMergeRequest(key)).toBeNull();
  });

  it.each(["closed", "draft"])("rejects a %s PR before persisting intent", async (state) => {
    if (state === "closed") harness.fixture.snapshot.state = "closed";
    else harness.fixture.snapshot.draft = true;
    await expect(apply()).resolves.toMatchObject({
      status: "failed",
      details: { message: expect.stringContaining("open and ready") },
    });
    expect(submissions()).toEqual([]);
    expect(await readMergeRequest(key)).toBeNull();
  });

  it("refuses a resumed pending status with a different UUID without overwriting its receipt", async () => {
    await apply();
    harness.fixture.pollBody.details.uuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    await expect(apply()).resolves.toMatchObject({ status: "failed", uncertain: true });
    expect((await readMergeRequest(key))?.uuid).toBe(mergeUuid);
    expect(submissions()).toHaveLength(1);
  });

  it("propagates polling permission failures and retains the UUID for a later safe retry", async () => {
    await apply();
    harness.fixture.pollStatus = 403;
    await expect(apply()).rejects.toMatchObject({ status: 403 });
    expect((await readMergeRequest(key))?.uuid).toBe(mergeUuid);
    harness.fixture.pollStatus = 200;
    await expect(apply()).resolves.toMatchObject({ status: "pending" });
    expect(submissions()).toHaveLength(1);
  });

  it("persists a definitive mutation refusal and propagates its HTTP error", async () => {
    harness.fixture.submitStatus = 422;
    await expect(apply()).rejects.toBeInstanceOf(GitHubRequestError);
    expect(await readMergeRequest(key)).toMatchObject({
      response: { status: "failed", details: { message: expect.stringContaining("pending") } },
    });
    await expect(apply()).resolves.toMatchObject({ status: "failed" });
    expect(submissions()).toHaveLength(1);
  });

  it.each([
    { mergeAction: "invalid", expected: "merge-action" },
    { mergeMethod: "invalid", expected: "method" },
  ])("rejects invalid request options %j before HTTP", ({ expected, ...invalid }) => {
    expect(() => validateApplyMergeOptions({ ...input, ...invalid } as typeof input)).toThrow(
      expected,
    );
    expect(harness.wire.requests).toEqual([]);
  });
});
