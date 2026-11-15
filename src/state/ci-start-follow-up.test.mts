import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ciStartSignature,
  readCiStartFollowUp,
  writeCiStartFollowUp,
} from "./ci-start-follow-up.mts";

const key = { owner: "acme", repo: "widgets", pr: 12 };

describe("CI start follow-up marker", () => {
  let dir: string;
  let previous: string | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pr-shepherd-ci-start-"));
    previous = process.env["PR_SHEPHERD_STATE_DIR"];
    process.env["PR_SHEPHERD_STATE_DIR"] = dir;
  });

  afterEach(async () => {
    if (previous === undefined) delete process.env["PR_SHEPHERD_STATE_DIR"];
    else process.env["PR_SHEPHERD_STATE_DIR"] = previous;
    await rm(dir, { recursive: true, force: true });
  });

  it("keys the stalled set by head and sorted check names", () => {
    expect(ciStartSignature("abc", ["b", "a"])).toBe('["abc","a","b"]');
    expect(ciStartSignature("abc", ["lint,unit"])).not.toBe(
      ciStartSignature("abc", ["lint", "unit"]),
    );
    expect(ciStartSignature("abc", ["a", "b"])).toBe(ciStartSignature("abc", ["b", "a"]));
  });

  it("matches only the same head and checks", async () => {
    const signature = ciStartSignature("abc", ["tests"]);
    expect(await readCiStartFollowUp(key, signature)).toBe(false);
    await writeCiStartFollowUp(key, signature);
    expect(await readCiStartFollowUp(key, signature)).toBe(true);
    expect(await readCiStartFollowUp(key, ciStartSignature("def", ["tests"]))).toBe(false);
    expect(await readCiStartFollowUp(key, ciStartSignature("abc", ["tests", "lint"]))).toBe(false);
  });
});
