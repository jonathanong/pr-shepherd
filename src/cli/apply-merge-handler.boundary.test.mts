import { describe, expect, it, vi } from "vitest";
import {
  apply,
  harness,
  input,
  submissions,
} from "../../test-helpers/github/merge-boundary-support.mts";
import { handleApplyMerge, formatApplyMergeResult } from "./apply-merge-handler.mts";
import { runWithGithubTransport } from "../github/transport.mts";

const flags = ["owner/repo#1", "--require-sha", input.requireSha, "--merge-action", "direct_merge"];
describe("apply merge CLI boundary", () => {
  it.each([["--unknown"], ["--require-sha"], []])(
    "rejects missing or unknown arguments %j without HTTP",
    async (...args) => {
      const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      await handleApplyMerge(args);
      expect(process.exitCode).toBe(64);
      expect(stderr).toHaveBeenCalled();
      expect(harness.wire.requests).toEqual([]);
    },
  );

  it("renders a known failure in text with unavailable exit status", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    harness.fixture.snapshot.draft = true;
    await runWithGithubTransport("rest", () => handleApplyMerge(flags));
    expect(process.exitCode).toBe(69);
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("status: failed"));
    expect(submissions()).toEqual([]);
  });

  it("renders ambiguity and recorded enqueued outcomes without claiming current queue membership", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    harness.fixture.failMutation = true;
    await runWithGithubTransport("rest", () => handleApplyMerge(flags));
    expect(process.exitCode).toBe(75);
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("uncertain: true"));
    expect(
      formatApplyMergeResult({
        pr: 1,
        repo: "owner/repo",
        status: "enqueued",
        note: "current merge-queue membership is not confirmed",
        details: { bypass_rules: false, omitted: undefined },
      }),
    ).toContain("note: current merge-queue membership is not confirmed");
  });

  it("discloses a persisted enqueued result in text without resubmitting", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    harness.fixture.submitBody = { status: "enqueued", details: { message: "Added to queue" } };
    await apply();
    await runWithGithubTransport("rest", () => handleApplyMerge([...flags, "--method", "squash"]));
    expect(process.exitCode).toBe(0);
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining("current merge-queue membership is not confirmed"),
    );
    expect(submissions()).toHaveLength(1);
  });
});
