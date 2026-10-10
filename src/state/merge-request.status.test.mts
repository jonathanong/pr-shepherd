import * as fs from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { directory, key, input } from "../../test-helpers/github/merge-boundary-support.mts";
import {
  claimMergeRequest,
  readMergeRequest,
  replaceFailedMergeRequest,
  writeMergeRequestStatus,
  type MergeRequestRecord,
} from "./merge-request.mts";

vi.mock("node:fs/promises", { spy: true });
const record = (): MergeRequestRecord => ({
  version: 1,
  options: input,
  startedAtUnix: 1,
  response: { status: "pending", details: {} },
});
const parent = () => join(directory, key.owner, key.repo, String(key.pr));
const statusPath = async () =>
  join(
    parent(),
    (await fs.readdir(parent())).find((file) => file.startsWith("merge-async-status-"))!,
  );

describe("intent-bound asynchronous merge status", () => {
  it("reads the status of its own intent without changing the immutable main receipt", async () => {
    const original = record();
    await claimMergeRequest(key, original);
    const outcome = { ...original, response: { status: "enqueued" as const, details: {} } };
    await writeMergeRequestStatus(key, outcome);
    expect(await readMergeRequest(key)).toEqual(outcome);
    expect(JSON.parse(await fs.readFile(join(parent(), "merge-async.json"), "utf8"))).toEqual(
      original,
    );
  });

  it("rejects a status record belonging to different guarded options", async () => {
    await claimMergeRequest(key, record());
    await writeMergeRequestStatus(key, record());
    await fs.writeFile(
      await statusPath(),
      JSON.stringify({ ...record(), options: { ...input, requireSha: "b".repeat(40) } }),
    );
    await expect(readMergeRequest(key)).rejects.toThrow("does not match");
  });

  it("propagates an unreadable status rather than falling back to an obsolete main receipt", async () => {
    await claimMergeRequest(key, record());
    await writeMergeRequestStatus(key, record());
    const destination = await statusPath();
    await fs.unlink(destination);
    await fs.mkdir(destination);
    await expect(readMergeRequest(key)).rejects.toMatchObject({ code: "EISDIR" });
  });

  it("retains the last valid status when its atomic update fails", async () => {
    await claimMergeRequest(key, record());
    await writeMergeRequestStatus(key, record());
    vi.mocked(fs.rename).mockRejectedValueOnce(
      Object.assign(new Error("disk full"), { code: "ENOSPC" }),
    );
    await expect(
      writeMergeRequestStatus(key, { ...record(), response: { status: "failed", details: {} } }),
    ).rejects.toMatchObject({ code: "ENOSPC" });
    expect(await readMergeRequest(key)).toEqual(record());
  });

  it.each([
    record(),
    { ...record(), response: { status: "enqueued" as const, details: {} } },
    { ...record(), response: { status: "failed" as const, details: {} }, uncertain: true as const },
  ])("never creates a successor for ineligible receipt %j", async (previous) => {
    expect(await replaceFailedMergeRequest(key, previous, record())).toBe(false);
    expect(await readMergeRequest(key)).toBeNull();
  });

  it("propagates a publication failure while leaving the previous receipt recoverable", async () => {
    const previous = { ...record(), response: { status: "failed" as const, details: {} } };
    await claimMergeRequest(key, previous);
    vi.mocked(fs.link).mockRejectedValueOnce(
      Object.assign(new Error("storage unavailable"), { code: "EIO" }),
    );
    await expect(replaceFailedMergeRequest(key, previous, record())).rejects.toMatchObject({
      code: "EIO",
    });
    expect(await readMergeRequest(key)).toEqual(previous);
    expect(await replaceFailedMergeRequest(key, previous, record())).toBe(true);
  });
});
