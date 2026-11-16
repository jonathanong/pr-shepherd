import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkFollowUpKeys,
  readCheckFollowUp,
  readShownRunFailures,
  sameCheckFollowUp,
  writeCheckFollowUp,
  writeShownRunFailures,
} from "./check-follow-up.mts";
import { resolvePrStatePath } from "./base.mts";

const key = { owner: "acme", repo: "widgets", pr: 12 };

describe("check follow-up marker", () => {
  let dir: string;
  let previous: string | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pr-shepherd-check-follow-up-"));
    previous = process.env["PR_SHEPHERD_STATE_DIR"];
    process.env["PR_SHEPHERD_STATE_DIR"] = dir;
  });

  afterEach(async () => {
    if (previous === undefined) delete process.env["PR_SHEPHERD_STATE_DIR"];
    else process.env["PR_SHEPHERD_STATE_DIR"] = previous;
    await rm(dir, { recursive: true, force: true });
  });

  it("builds order-independent keys from name, run, and attempt", () => {
    const a = { name: "a", runId: "1", runAttempt: 2 };
    const b = { name: "b", runId: null };
    expect(checkFollowUpKeys([a, b])).toEqual(checkFollowUpKeys([b, a]));
    expect(checkFollowUpKeys([b])).toEqual(["b##"]);
  });

  it("distinguishes queue commits and external details URLs", () => {
    const status = { name: "s", runId: null, detailsUrl: "https://x/1" };
    expect(checkFollowUpKeys([status])).not.toEqual(
      checkFollowUpKeys([{ ...status, detailsUrl: "https://x/2" }]),
    );
    expect(checkFollowUpKeys([{ ...status, commitOid: "q1" }])).not.toEqual(
      checkFollowUpKeys([{ ...status, commitOid: "q2" }]),
    );
    expect(checkFollowUpKeys([{ name: "a", runId: "1", detailsUrl: "https://x/1" }])).toEqual([
      "a#1#",
    ]);
  });

  it("matches the same head and check set regardless of order", async () => {
    await writeCheckFollowUp(key, { headSha: "abc", checks: ["t#1#1", "b#2#1"] });
    const stored = await readCheckFollowUp(key);
    expect(sameCheckFollowUp(stored, "abc", ["b#2#1", "t#1#1"])).toBe(true);
    expect(sameCheckFollowUp(stored, "def", ["b#2#1", "t#1#1"])).toBe(false);
    expect(sameCheckFollowUp(stored, "abc", ["b#2#1"])).toBe(false);
    expect(sameCheckFollowUp(stored, "abc", ["b#2#1", "x#3#1"])).toBe(false);
    expect(sameCheckFollowUp(undefined, "abc", [])).toBe(false);
  });

  it("treats a missing or malformed marker as not investigated", async () => {
    expect(await readCheckFollowUp(key)).toBeUndefined();
    const path = resolvePrStatePath(key, "check-follow-up.json");
    await mkdir(dirname(path), { recursive: true });
    for (const bad of [
      "not json",
      "null",
      '{"headSha":1,"checks":[]}',
      '{"headSha":"a","checks":[1]}',
    ]) {
      await writeFile(path, bad);
      expect(await readCheckFollowUp(key)).toBeUndefined();
    }
  });

  it("keeps shown running-run failures apart from the investigation marker", async () => {
    await writeShownRunFailures(key, { headSha: "abc", checks: ["t#1#1"] });
    expect(await readShownRunFailures(key)).toEqual({ headSha: "abc", checks: ["t#1#1"] });
    expect(await readCheckFollowUp(key)).toBeUndefined();
  });

  it("never throws when the marker cannot be written", async () => {
    await writeFile(join(dir, "acme"), "a file where a directory is needed");
    await expect(writeCheckFollowUp(key, { headSha: "abc", checks: [] })).resolves.toBeUndefined();
  });
});
