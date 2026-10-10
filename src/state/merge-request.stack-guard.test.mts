import { createHash, randomUUID } from "node:crypto";
import { writeFile, link, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { directory, key, input } from "../../test-helpers/github/merge-boundary-support.mts";
import {
  claimMergeRequest,
  readMergeRequest,
  writeMergeRequestStatus,
  replaceFailedMergeRequest,
  type MergeRequestRecord,
} from "./merge-request.mts";
import type { RestMergeStackGuard } from "../github/rest-merge.mts";

const guard: RestMergeStackGuard = {
  number: 42,
  baseRefName: "main",
  prefix: [{ pr: 1, headRefName: "feature", headRefOid: input.requireSha, baseRefName: "main" }],
};
const record = (expectedStack?: RestMergeStackGuard): MergeRequestRecord => ({
  version: 1,
  options: { ...input, ...(expectedStack && { expectedStack }) },
  startedAtUnix: 1,
});
const parent = () => join(directory, key.owner, key.repo, String(key.pr));
const legacyGeneration = (value: MergeRequestRecord) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        value.options.requireSha,
        value.options.mergeAction,
        value.options.mergeMethod,
        value.startedAtUnix,
        value.replacementToken,
      ]),
    )
    .digest("hex")
    .slice(0, 24);

describe("native-stack guards in durable asynchronous merge state", () => {
  it("still reads legacy unguarded status sidecars", async () => {
    const original = record();
    await claimMergeRequest(key, original);
    const outcome = { ...original, response: { status: "enqueued" as const, details: {} } };
    await writeFile(
      join(parent(), `merge-async-status-${legacyGeneration(original)}.json`),
      JSON.stringify(outcome),
    );
    expect(await readMergeRequest(key)).toEqual(outcome);
  });

  it("isolates status for different expected native stacks", async () => {
    const original = record(guard);
    await claimMergeRequest(key, original);
    await writeMergeRequestStatus(key, {
      ...record({ ...guard, number: 43 }),
      response: { status: "enqueued", details: {} },
    });
    expect(await readMergeRequest(key)).toEqual(original);
  });

  it("uses equivalent guard fields regardless of JSON property order", async () => {
    const original = record(guard);
    await claimMergeRequest(key, original);
    const reordered = {
      prefix: guard.prefix.map(({ pr, headRefName, headRefOid, baseRefName }) => ({
        baseRefName,
        headRefOid,
        headRefName,
        pr,
      })),
      baseRefName: guard.baseRefName,
      number: guard.number,
    };
    const outcome = {
      ...record(reordered),
      response: { status: "enqueued" as const, details: {} },
    };
    await writeMergeRequestStatus(key, outcome);
    expect(await readMergeRequest(key)).toEqual(outcome);
  });

  it.each([
    { ...guard, prefix: [] },
    { ...guard, prefix: [{ ...guard.prefix[0]!, headRefOid: "b".repeat(40) }] },
  ])("fails closed when a persisted guard is malformed or mismatches the head", async (invalid) => {
    await claimMergeRequest(key, record(invalid));
    await expect(readMergeRequest(key)).rejects.toThrow();
  });

  it("recovers a legacy failed intent's guarded successor only with its original expected stack", async () => {
    const previous = { ...record(), response: { status: "failed" as const, details: {} } };
    await claimMergeRequest(key, previous);
    const candidate = { ...record(guard), startedAtUnix: 2, replacementToken: randomUUID() };
    const stem = join(parent(), `merge-async-successor-${legacyGeneration(previous)}`);
    const source = `${stem}-${candidate.replacementToken}.json`;
    await writeFile(source, JSON.stringify(candidate));
    await link(source, `${stem}.json`);
    expect(await replaceFailedMergeRequest(key, previous, record({ ...guard, number: 43 }))).toBe(
      false,
    );
    expect(await readMergeRequest(key)).toEqual(previous);
    expect(await readFile(source, "utf8")).toContain(candidate.replacementToken);
    expect(await replaceFailedMergeRequest(key, previous, record(guard))).toBe(true);
    expect(await readMergeRequest(key)).toEqual(candidate);
    expect(await replaceFailedMergeRequest(key, previous, record(guard))).toBe(false);
  });
});
