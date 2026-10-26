import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { updateReadyDelay } from "./ready-delay.mts";

const OWNER = "test-owner";
const REPO = "test-repo";
const PR = 42;
const DELAY = 600;
const HEAD = { headSha: "head-a" };
const SUMMARY = { headSha: "head-a", summary: true };

let stateDir: string;

beforeEach(async () => {
  stateDir = await mkdtemp(join(tmpdir(), "shepherd-summary-delay-"));
  process.env["PR_SHEPHERD_STATE_DIR"] = stateDir;
  await mkdir(join(stateDir, OWNER, REPO, String(PR)), { recursive: true });
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(stateDir, { recursive: true, force: true });
});

const path = (name: string): string => join(stateDir, OWNER, REPO, String(PR), name);
const secondsAgo = (seconds: number): number => Math.floor(Date.now() / 1000) - seconds;

describe("updateReadyDelay — summary marker isolation", () => {
  it("a not-ready summary tick leaves the one-PR marker intact (auto-resolve rule, BLOCKED)", async () => {
    await writeFile(path("ready-since.txt"), `${secondsAgo(300)} head-a`, "utf8");
    await updateReadyDelay(PR, false, DELAY, OWNER, REPO, SUMMARY);
    expect(await readFile(path("ready-since.txt"), "utf8")).toMatch(/ head-a$/);
  });

  it("a ready summary tick never creates the one-PR marker", async () => {
    const state = await updateReadyDelay(PR, true, DELAY, OWNER, REPO, SUMMARY);
    expect(state.shouldCancel).toBe(false);
    await expect(access(path("ready-since.txt"))).rejects.toThrow();
    expect(await readFile(path("ready-since-summary.txt"), "utf8")).toMatch(/ head-a$/);
  });

  it("an elapsed summary marker does not elapse the one-PR delay", async () => {
    await writeFile(path("ready-since-summary.txt"), `${secondsAgo(DELAY + 5)} head-a`, "utf8");
    expect((await updateReadyDelay(PR, true, DELAY, OWNER, REPO, SUMMARY)).shouldCancel).toBe(true);
    expect((await updateReadyDelay(PR, true, DELAY, OWNER, REPO, HEAD)).shouldCancel).toBe(false);
  });

  it("resets the summary marker on a head change and when not ready", async () => {
    await writeFile(path("ready-since-summary.txt"), `${secondsAgo(DELAY + 5)} head-a`, "utf8");
    const moved = { headSha: "head-b", summary: true };
    expect((await updateReadyDelay(PR, true, DELAY, OWNER, REPO, moved)).shouldCancel).toBe(false);
    await updateReadyDelay(PR, false, DELAY, OWNER, REPO, SUMMARY);
    await expect(access(path("ready-since-summary.txt"))).rejects.toThrow();
  });
});
