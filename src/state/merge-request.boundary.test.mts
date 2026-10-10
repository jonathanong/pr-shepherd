import { mkdir, writeFile } from "node:fs/promises";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { directory, key, input } from "../../test-helpers/github/merge-boundary-support.mts";
import {
  claimMergeRequest,
  readMergeRequest,
  replaceFailedMergeRequest,
  type MergeRequestRecord,
} from "./merge-request.mts";

const record = (): MergeRequestRecord => ({ version: 1, options: input, startedAtUnix: 1 });
vi.mock("node:fs/promises", { spy: true });
const parent = () => join(directory, key.owner, key.repo, String(key.pr));
describe("durable merge intent storage boundaries", () => {
  it("propagates a write failure and leaves the intent available for a later claimant", async () => {
    vi.mocked(fs.writeFile).mockRejectedValueOnce(
      Object.assign(new Error("disk full"), { code: "ENOSPC" }),
    );
    await expect(claimMergeRequest(key, record())).rejects.toMatchObject({ code: "ENOSPC" });
    expect(await readMergeRequest(key)).toBeNull();
    expect(await claimMergeRequest(key, record())).toBe(true);
    expect(await readMergeRequest(key)).toEqual(record());
  });

  it("propagates unreadable state instead of treating it as missing", async () => {
    await mkdir(join(parent(), "merge-async.json"), { recursive: true });
    await expect(readMergeRequest(key)).rejects.toMatchObject({ code: "EISDIR" });
  });

  it.each([
    { version: 2 },
    { options: { ...input, requireSha: "invalid" } },
    { options: { ...input, mergeAction: "invalid" } },
    { startedAtUnix: 0.5 },
    { uuid: "invalid" },
  ])("blocks invalid durable state %j", async (invalid) => {
    await mkdir(parent(), { recursive: true });
    await writeFile(
      join(parent(), "merge-async.json"),
      JSON.stringify({ ...record(), ...invalid }),
    );
    await expect(readMergeRequest(key)).rejects.toThrow("outcome must be reconciled");
  });

  it("does not classify a filesystem failure as a concurrent claimant", async () => {
    await mkdir(join(directory, key.owner), { recursive: true });
    await writeFile(join(directory, key.owner, key.repo), "obstructed parent");
    await expect(claimMergeRequest(key, record())).rejects.toMatchObject({ code: "ENOTDIR" });
  });

  it("propagates successor storage failure without changing the definitive failed receipt", async () => {
    const previous = { ...record(), response: { status: "failed" as const, details: {} } };
    await expect(replaceFailedMergeRequest(key, previous, record())).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("retains a newer receipt when a stale caller attempts to replace an old failure", async () => {
    const previous = { ...record(), response: { status: "failed" as const, details: {} } };
    const current = { ...record(), options: { ...input, requireSha: "b".repeat(40) } };
    expect(await claimMergeRequest(key, current)).toBe(true);
    expect(await replaceFailedMergeRequest(key, previous, record())).toBe(false);
    expect(await readMergeRequest(key)).toEqual(current);
  });
});
