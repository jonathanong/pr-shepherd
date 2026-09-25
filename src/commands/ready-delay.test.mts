import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { clearReadyDelay, updateReadyDelay } from "./ready-delay.mts";

const OWNER = "test-owner";
const REPO = "test-repo";
const PR = 42;
const DELAY = 600; // 10 minutes
const HEAD = { headSha: "head-a" };

let stateDir: string;

beforeEach(async () => {
  stateDir = await mkdtemp(join(tmpdir(), "shepherd-watch-test-"));
  process.env["PR_SHEPHERD_STATE_DIR"] = stateDir;
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(stateDir, { recursive: true, force: true });
});

function markerPath(): string {
  return join(stateDir, OWNER, REPO, String(PR), "ready-since.txt");
}

async function writeMarker(content: string): Promise<void> {
  await mkdir(join(stateDir, OWNER, REPO, String(PR)), { recursive: true });
  await writeFile(markerPath(), content, "utf8");
}

function secondsAgo(seconds: number): number {
  return Math.floor(Date.now() / 1000) - seconds;
}

describe("updateReadyDelay", () => {
  it("returns isReady:false and resets remainingSeconds when not ready", async () => {
    const state = await updateReadyDelay(PR, false, DELAY, OWNER, REPO, HEAD);
    expect(state.isReady).toBe(false);
    expect(state.shouldCancel).toBe(false);
    expect(state.remainingSeconds).toBe(DELAY);
  });

  it("starts a fresh countdown bound to the head on first READY call", async () => {
    const state = await updateReadyDelay(PR, true, DELAY, OWNER, REPO, HEAD);
    expect(state.isReady).toBe(true);
    expect(state.shouldCancel).toBe(false);
    expect(state.remainingSeconds).toBeGreaterThan(0);
    expect(state.remainingSeconds).toBeLessThanOrEqual(DELAY);
    expect((await readFile(markerPath(), "utf8")).split(" ")[1]).toBe("head-a");
  });

  it("fires shouldCancel when delay has elapsed on the same head", async () => {
    await writeMarker(`${secondsAgo(DELAY + 5)} head-a`);

    const state = await updateReadyDelay(PR, true, DELAY, OWNER, REPO, HEAD);
    expect(state.isReady).toBe(true);
    expect(state.shouldCancel).toBe(true);
    expect(state.remainingSeconds).toBe(0);
  });

  it("keeps an elapsed marker until clearReadyDelay consumes it", async () => {
    await writeMarker(`${secondsAgo(DELAY + 5)} head-a`);

    expect(await updateReadyDelay(PR, true, DELAY, OWNER, REPO, HEAD)).toMatchObject({
      shouldCancel: true,
    });
    expect(await updateReadyDelay(PR, true, DELAY, OWNER, REPO, HEAD)).toMatchObject({
      shouldCancel: true,
    });

    await clearReadyDelay(PR, OWNER, REPO);
    await expect(access(markerPath())).rejects.toThrow();

    const restarted = await updateReadyDelay(PR, true, DELAY, OWNER, REPO, HEAD);
    expect(restarted.shouldCancel).toBe(false);
    expect(restarted.remainingSeconds).toBe(DELAY);
  });

  it("restarts the countdown when the head moved since the marker was written", async () => {
    await writeMarker(`${secondsAgo(DELAY + 5)} head-a`);

    const state = await updateReadyDelay(PR, true, DELAY, OWNER, REPO, { headSha: "head-b" });
    expect(state).toEqual({ isReady: true, shouldCancel: false, remainingSeconds: DELAY });
    expect((await readFile(markerPath(), "utf8")).split(" ")[1]).toBe("head-b");
  });

  it("restarts the countdown for a marker that names no head", async () => {
    await writeMarker(String(secondsAgo(DELAY + 5)));

    const state = await updateReadyDelay(PR, true, DELAY, OWNER, REPO, HEAD);
    expect(state).toEqual({ isReady: true, shouldCancel: false, remainingSeconds: DELAY });
  });

  it("cancels without starting a timer when durable evidence proves the delay elapsed", async () => {
    const elapsed = { ...HEAD, alreadyElapsed: true };

    expect(await updateReadyDelay(PR, true, DELAY, OWNER, REPO, elapsed)).toEqual({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });
    await expect(access(markerPath())).rejects.toThrow();
  });

  it("leaves a running marker for the caller to consume when evidence proves the delay elapsed", async () => {
    await updateReadyDelay(PR, true, DELAY, OWNER, REPO, HEAD);

    const state = await updateReadyDelay(PR, true, DELAY, OWNER, REPO, {
      ...HEAD,
      alreadyElapsed: true,
    });
    expect(state.shouldCancel).toBe(true);
    await access(markerPath());
  });

  it("ignores elapsed evidence while the PR is not ready", async () => {
    const state = await updateReadyDelay(PR, false, DELAY, OWNER, REPO, {
      ...HEAD,
      alreadyElapsed: true,
    });
    expect(state).toEqual({ isReady: false, shouldCancel: false, remainingSeconds: DELAY });
  });

  it("resets the countdown when ready-since.txt contains a future timestamp (clock skew)", async () => {
    // A future timestamp (clock skew or manual corruption) must be reset to "now".
    await writeMarker(`${Math.floor(Date.now() / 1000) + 9999} head-a`);

    const state = await updateReadyDelay(PR, true, DELAY, OWNER, REPO, HEAD);
    expect(state.isReady).toBe(true);
    expect(state.shouldCancel).toBe(false);
    expect(state.remainingSeconds).toBeGreaterThan(0);
    expect(state.remainingSeconds).toBeLessThanOrEqual(DELAY);
  });

  it("resets the timer when PR drops out of READY state after shouldCancel", async () => {
    await writeMarker(`${secondsAgo(DELAY + 5)} head-a`);

    // shouldCancel fires
    await updateReadyDelay(PR, true, DELAY, OWNER, REPO, HEAD);

    // PR becomes not-ready (e.g. new review comment) — timer must reset
    const reset = await updateReadyDelay(PR, false, DELAY, OWNER, REPO, HEAD);
    expect(reset.isReady).toBe(false);
    expect(reset.shouldCancel).toBe(false);
    await expect(access(markerPath())).rejects.toThrow();
  });

  it("rejects when owner contains an invalid path segment character", async () => {
    // owner contains '/' which is not in the allowed SAFE_SEGMENT charset.
    await expect(updateReadyDelay(PR, true, DELAY, "owner/bad", "repo", HEAD)).rejects.toThrow(
      "Invalid state key segment",
    );
  });

  it("rejects when pr is not a positive integer", async () => {
    await expect(updateReadyDelay(-1, true, DELAY, OWNER, REPO, HEAD)).rejects.toThrow(
      'Invalid state key segment "pr"',
    );
  });
});
