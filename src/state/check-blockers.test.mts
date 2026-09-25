import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolvePrStatePath } from "./base.mts";
import {
  clearCheckBlocker,
  readCheckBlockers,
  writeCheckBlocker,
  type CheckBlockerRecord,
} from "./check-blockers.mts";

const key = { owner: "acme", repo: "widgets", pr: 42 };
const pull = { owner: "acme", name: "widgets", number: 9, kind: "pull" as const };
const issue = { owner: "acme", name: "widgets", number: 10, kind: "issue" as const };

let stateDir: string;

beforeEach(async () => {
  stateDir = await mkdtemp(join(tmpdir(), "pr-shepherd-blockers-"));
  process.env["PR_SHEPHERD_STATE_DIR"] = stateDir;
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(stateDir, { recursive: true, force: true });
});

function record(checkName: string, blocker: CheckBlockerRecord["blocker"], recordedAt: number) {
  return { checkName, blocker, recordedAt };
}

describe("check blockers", () => {
  it("stores under owner/repo/pr and replaces the same check name", async () => {
    expect(resolvePrStatePath(key, "check-blockers.json")).toContain(
      "/acme/widgets/42/check-blockers.json",
    );
    expect(resolvePrStatePath(key, "check-blockers.json")).not.toContain("acme-widgets");
    await writeCheckBlocker(key, record("backend-tests (1)", pull, 1700000000));
    await writeCheckBlocker(key, record("lint", issue, 1700000001));
    await writeCheckBlocker(key, record("backend-tests (1)", issue, 1700000002));
    expect(await readCheckBlockers(key)).toEqual([
      record("lint", issue, 1700000001),
      record("backend-tests (1)", issue, 1700000002),
    ]);
  });

  it("clears one record and leaves the other", async () => {
    await writeCheckBlocker(key, record("backend-tests (1)", pull, 1700000000));
    await writeCheckBlocker(key, record("lint", issue, 1700000001));
    expect(await clearCheckBlocker(key, "backend-tests (1)")).toBe(true);
    expect(await readCheckBlockers(key)).toEqual([record("lint", issue, 1700000001)]);
    expect(await clearCheckBlocker(key, "missing")).toBe(true);
  });

  it("ignores a missing file, malformed JSON, and invalid entries", async () => {
    expect(await readCheckBlockers(key)).toEqual([]);
    const dir = join(stateDir, "acme", "widgets", "42");
    await mkdir(dir, { recursive: true });
    const path = join(dir, "check-blockers.json");
    await writeFile(path, "not-json", "utf8");
    expect(await readCheckBlockers(key)).toEqual([]);
    await writeFile(
      path,
      JSON.stringify({
        blockers: [record("lint", issue, 1), { checkName: "", recordedAt: 1 }, null],
      }),
      "utf8",
    );
    expect(await readCheckBlockers(key)).toEqual([record("lint", issue, 1)]);
    expect(await readCheckBlockers({ owner: "acme/widgets", repo: "widgets", pr: 42 })).toEqual([]);
    expect(
      await writeCheckBlocker({ owner: "a/b", repo: "widgets", pr: 1 }, record("lint", issue, 1)),
    ).toBe(false);
  });

  it("returns false when the state directory cannot be created", async () => {
    const blocker = join(stateDir, "not-a-directory");
    await writeFile(blocker, "x", "utf8");
    process.env["PR_SHEPHERD_STATE_DIR"] = blocker;
    expect(await writeCheckBlocker(key, record("lint", issue, 1))).toBe(false);
    await rm(blocker, { force: true });
  });

  it("swallows temp-file cleanup after a failed write", async () => {
    await writeCheckBlocker(key, record("lint", issue, 1));
    const file = resolvePrStatePath(key, "check-blockers.json");
    await chmod(join(file, ".."), 0o555);
    expect(await writeCheckBlocker(key, record("lint", pull, 2))).toBe(false);
    await chmod(join(file, ".."), 0o755);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
      blockers: [record("lint", issue, 1)],
    });
  });
});
