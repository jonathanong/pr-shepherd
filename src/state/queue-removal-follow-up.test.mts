import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  queueRemovalSignature,
  readQueueRemovalFollowUp,
  writeQueueRemovalFollowUp,
} from "./queue-removal-follow-up.mts";
import { resolvePrStatePath } from "./base.mts";

const key = { owner: "acme", repo: "widgets", pr: 12 };

describe("queue removal follow-up marker", () => {
  let dir: string;
  let previous: string | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pr-shepherd-queue-removal-"));
    previous = process.env["PR_SHEPHERD_STATE_DIR"];
    process.env["PR_SHEPHERD_STATE_DIR"] = dir;
  });

  afterEach(async () => {
    if (previous === undefined) delete process.env["PR_SHEPHERD_STATE_DIR"];
    else process.env["PR_SHEPHERD_STATE_DIR"] = previous;
    await rm(dir, { recursive: true, force: true });
  });

  it("keys the removal by head, time, and queue commit", () => {
    const a = queueRemovalSignature({ headSha: "abc", createdAtUnix: 5, beforeCommitOid: "q1" });
    expect(a).toBe("abc#5#q1");
    expect(queueRemovalSignature({ headSha: "abc", createdAtUnix: 5 })).toBe("abc#5#");
  });

  it("matches only the stored signature", async () => {
    expect(await readQueueRemovalFollowUp(key, "abc#5#q1")).toBe(false);
    await writeQueueRemovalFollowUp(key, "abc#5#q1");
    expect(await readQueueRemovalFollowUp(key, "abc#5#q1")).toBe(true);
    expect(await readQueueRemovalFollowUp(key, "def#5#q1")).toBe(false);
  });

  it("treats malformed markers as not investigated", async () => {
    const path = resolvePrStatePath(key, "queue-removal-follow-up.json");
    await writeQueueRemovalFollowUp(key, "x");
    await writeFile(path, "not json");
    expect(await readQueueRemovalFollowUp(key, "x")).toBe(false);
    await writeFile(path, "null");
    expect(await readQueueRemovalFollowUp(key, "x")).toBe(false);
  });

  it("does not throw when the state directory cannot be written", async () => {
    await writeFile(join(dir, "file"), "x");
    process.env["PR_SHEPHERD_STATE_DIR"] = join(dir, "file");
    await expect(writeQueueRemovalFollowUp(key, "x")).resolves.toBeUndefined();
  });
});
