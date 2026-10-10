import * as fs from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { key, input } from "../../test-helpers/github/merge-boundary-support.mts";
import {
  claimMergeRequest,
  readMergeRequest,
  replaceFailedMergeRequest,
  writeMergeRequest,
  type MergeRequestRecord,
} from "./merge-request.mts";

vi.mock("node:fs/promises", { spy: true });
const previous = (): MergeRequestRecord => ({
  version: 1,
  options: input,
  startedAtUnix: 1,
  response: { status: "failed", details: { message: "Refused" } },
});
const next = (): MergeRequestRecord => ({
  version: 1,
  options: { ...input, requireSha: "b".repeat(40) },
  startedAtUnix: 2,
});
const deferred = () => Promise.withResolvers<void>();
const ioError = () => Object.assign(new Error("storage unavailable"), { code: "EIO" });

describe("single-use merge successors under delayed callers", () => {
  it("does not let a stale publisher recreate a consumed source after an ABA receipt change", async () => {
    const record = previous();
    await claimMergeRequest(key, record);
    const actual = await vi.importActual<typeof fs>("node:fs/promises");
    const paused = deferred();
    const resume = deferred();
    vi.mocked(fs.link).mockImplementationOnce(async (source, destination) => {
      paused.resolve();
      await resume.promise;
      return actual.link(source, destination);
    });
    const stalePublisher = replaceFailedMergeRequest(key, record, next());
    await paused.promise;
    expect(await replaceFailedMergeRequest(key, record, next())).toBe(true);
    // The same failed receipt can recur; its consumed successor must remain non-replayable.
    await writeMergeRequest(key, record);
    resume.resolve();
    expect(await stalePublisher).toBe(false);
    expect(await readMergeRequest(key)).toEqual(record);
    expect(await replaceFailedMergeRequest(key, record, next())).toBe(false);
    expect(await readMergeRequest(key)).toEqual(record);
    const changedDetails = {
      ...record,
      response: { status: "failed" as const, details: { message: "A later description" } },
    };
    await writeMergeRequest(key, changedDetails);
    expect(await replaceFailedMergeRequest(key, changedDetails, next())).toBe(false);
    expect(await readMergeRequest(key)).toEqual(changedDetails);
  });

  it("prevents a delayed recovery from overwriting the following generation", async () => {
    const record = previous();
    await claimMergeRequest(key, record);
    vi.mocked(fs.rename).mockRejectedValueOnce(ioError());
    await expect(replaceFailedMergeRequest(key, record, next())).rejects.toMatchObject({
      code: "EIO",
    });
    const actual = await vi.importActual<typeof fs>("node:fs/promises");
    const paused = deferred();
    const resume = deferred();
    vi.mocked(fs.rename).mockImplementationOnce(async (source, destination) => {
      paused.resolve();
      await resume.promise;
      return actual.rename(source, destination);
    });
    const staleRecovery = replaceFailedMergeRequest(key, record, next());
    await paused.promise;
    expect(await replaceFailedMergeRequest(key, record, next())).toBe(true);
    const failedNext = { ...(await readMergeRequest(key))!, response: record.response };
    await writeMergeRequest(key, failedNext);
    const following = {
      ...next(),
      options: { ...input, requireSha: "c".repeat(40) },
      startedAtUnix: 3,
    };
    expect(await replaceFailedMergeRequest(key, failedNext, following)).toBe(true);
    resume.resolve();
    expect(await staleRecovery).toBe(false);
    expect(await readMergeRequest(key)).toMatchObject(following);
  });

  it("retains the newer main receipt if it changes after successor publication", async () => {
    const record = previous();
    await claimMergeRequest(key, record);
    const actual = await vi.importActual<typeof fs>("node:fs/promises");
    const current = { ...next(), response: { status: "enqueued" as const, details: {} } };
    vi.mocked(fs.link).mockImplementationOnce(async (source, destination) => {
      await actual.link(source, destination);
      await writeMergeRequest(key, current);
    });
    expect(await replaceFailedMergeRequest(key, record, next())).toBe(false);
    expect(await readMergeRequest(key)).toEqual(current);
  });
});
