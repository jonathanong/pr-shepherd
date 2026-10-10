import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import * as fs from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { directory, key, input } from "../../test-helpers/github/merge-boundary-support.mts";
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
  response: { status: "failed", details: { message: "Definitive refusal" } },
});
const next = (): MergeRequestRecord => ({
  version: 1,
  options: { ...input, requireSha: "b".repeat(40) },
  startedAtUnix: 2,
});
const successorPath = (record: MergeRequestRecord) =>
  join(
    directory,
    key.owner,
    key.repo,
    String(key.pr),
    `merge-async-successor-${createHash("sha256")
      .update(
        JSON.stringify([
          record.options.requireSha,
          record.options.mergeAction,
          record.options.mergeMethod,
          record.startedAtUnix,
          record.replacementToken,
        ]),
      )
      .digest("hex")
      .slice(0, 24)}.json`,
  );
async function crashBeforeReplacement(candidate = next()) {
  const record = previous();
  expect(await claimMergeRequest(key, record)).toBe(true);
  const marker = successorPath(record);
  const replacementToken = randomUUID();
  const source = `${marker.slice(0, -5)}-${replacementToken}.json`;
  await fs.writeFile(source, JSON.stringify({ ...candidate, replacementToken }));
  await fs.link(source, marker);
  return record;
}

describe("merge successor crash recovery", () => {
  it("recovers a fully persisted successor despite a later retry timestamp", async () => {
    const record = await crashBeforeReplacement();
    expect(await replaceFailedMergeRequest(key, record, { ...next(), startedAtUnix: 3 })).toBe(
      true,
    );
    expect(await readMergeRequest(key)).toMatchObject(next());
  });

  it("grants only one concurrent recovery permission to submit", async () => {
    const record = await crashBeforeReplacement();
    const claims = await Promise.all(
      Array.from({ length: 8 }, () => replaceFailedMergeRequest(key, record, next())),
    );
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await readMergeRequest(key)).toMatchObject(next());
  });

  it("recovers a failed atomic replacement without leaving a permanent successor lock", async () => {
    const record = previous();
    await claimMergeRequest(key, record);
    vi.mocked(fs.rename).mockRejectedValueOnce(
      Object.assign(new Error("storage unavailable"), { code: "EIO" }),
    );
    await expect(replaceFailedMergeRequest(key, record, next())).rejects.toMatchObject({
      code: "EIO",
    });
    expect(await readMergeRequest(key)).toEqual(record);
    expect(await replaceFailedMergeRequest(key, record, next())).toBe(true);
    expect(await readMergeRequest(key)).toMatchObject(next());
  });

  it("blocks replay when replacement happened but its acknowledgement was lost", async () => {
    const record = previous();
    await claimMergeRequest(key, record);
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(fs.rename).mockImplementationOnce(async (source, destination) => {
      await actual.rename(source, destination);
      throw Object.assign(new Error("lost acknowledgement"), { code: "EIO" });
    });
    await expect(replaceFailedMergeRequest(key, record, next())).rejects.toMatchObject({
      code: "EIO",
    });
    expect(await readMergeRequest(key)).toMatchObject(next());
    expect(await replaceFailedMergeRequest(key, record, next())).toBe(false);
  });

  it("does not recover a successor with different guarded options", async () => {
    const record = await crashBeforeReplacement();
    expect(
      await replaceFailedMergeRequest(key, record, {
        ...next(),
        options: { ...next().options, mergeMethod: "rebase" },
      }),
    ).toBe(false);
    expect(await readMergeRequest(key)).toEqual(record);
  });

  it("fails clearly on a malformed legacy successor without replacing the known receipt", async () => {
    const record = await crashBeforeReplacement();
    await fs.writeFile(successorPath(record), "corrupt");
    await expect(replaceFailedMergeRequest(key, record, next())).rejects.toThrow();
    expect(await readMergeRequest(key)).toEqual(record);
  });

  it("keeps the permanent marker immutable when the main receipt is updated", async () => {
    const record = await crashBeforeReplacement();
    const original = await fs.readFile(successorPath(record), "utf8");
    expect(await replaceFailedMergeRequest(key, record, next())).toBe(true);
    await writeMergeRequest(key, { ...next(), response: { status: "failed", details: {} } });
    expect(await fs.readFile(successorPath(record), "utf8")).toBe(original);
    expect(await replaceFailedMergeRequest(key, record, next())).toBe(false);
  });

  it.each([
    { replacementToken: undefined },
    { replacementToken: "../merge-async" },
    { version: 2 },
  ])("fails safely for an unrecoverable successor %j", async (invalid) => {
    const record = await crashBeforeReplacement();
    await fs.writeFile(successorPath(record), JSON.stringify({ ...next(), ...invalid }));
    await expect(replaceFailedMergeRequest(key, record, next())).rejects.toThrow();
    expect(await readMergeRequest(key)).toEqual(record);
  });
});
