import { describe, expect, it, vi } from "vitest";
import {
  harness,
  input,
  key,
  submissions,
} from "../../test-helpers/github/merge-boundary-support.mts";
import { handleApplyMerge } from "./apply-merge-handler.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import { readMergeRequest } from "../state/merge-request.mts";

const guard = {
  number: 42,
  baseRefName: "main",
  prefix: [{ pr: 1, headRefName: "feature", headRefOid: input.requireSha, baseRefName: "main" }],
};
const flags = [
  "owner/repo#1",
  "--require-sha",
  input.requireSha,
  "--merge-action",
  "direct_merge",
  "--expected-stack",
];

describe("apply merge CLI expected-stack validation", () => {
  it.each([
    "{",
    "null",
    JSON.stringify({ number: 42, baseRefName: "main", prefix: [] }),
    JSON.stringify({ ...guard, prefix: [guard.prefix[0], guard.prefix[0]] }),
    JSON.stringify({ ...guard, prefix: [{ ...guard.prefix[0], pr: 2 }] }),
    JSON.stringify({ ...guard, prefix: [{ ...guard.prefix[0], headRefOid: "b".repeat(40) }] }),
  ])("rejects malformed or mismatched guard before all HTTP: %s", async (raw) => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await runWithGithubTransport("rest", () => handleApplyMerge([...flags, raw]));
    expect(process.exitCode).toBe(65);
    expect(harness.wire.requests).toEqual([]);
  });

  it("forwards valid JSON and fails closed when the generated native stack disappeared", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await runWithGithubTransport("rest", () => handleApplyMerge([...flags, JSON.stringify(guard)]));
    expect(process.exitCode).toBe(69);
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining("Expected native stack is no longer present"),
    );
    expect(submissions()).toEqual([]);
    expect(await readMergeRequest(key)).toBeNull();
  });

  it("short-circuits help before malformed guard validation and HTTP", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await handleApplyMerge([...flags, "{", "--help"]);
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("--expected-stack"));
    expect(harness.wire.requests).toEqual([]);
    expect(process.exitCode).toBeUndefined();
  });
});
