import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { updateReadyDelay } from "./ready-delay.mts";

const OWNER = "test-owner";
const REPO = "test-repo";
const PR = 42;
const DELAY = 600; // 10 minutes

let cacheDir: string;

beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), "shepherd-watch-test-"));
  process.env["PR_SHEPHERD_CACHE_DIR"] = cacheDir;
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_CACHE_DIR"];
  await rm(cacheDir, { recursive: true, force: true });
});

describe("updateReadyDelay", () => {
  it("returns isReady:false and resets remainingSeconds when not ready", async () => {
    const state = await updateReadyDelay(PR, false, DELAY, OWNER, REPO);
    expect(state.isReady).toBe(false);
    expect(state.shouldCancel).toBe(false);
    expect(state.remainingSeconds).toBe(DELAY);
  });

  it("starts a fresh countdown on first READY call", async () => {
    const state = await updateReadyDelay(PR, true, DELAY, OWNER, REPO);
    expect(state.isReady).toBe(true);
    expect(state.shouldCancel).toBe(false);
    expect(state.remainingSeconds).toBeGreaterThan(0);
    expect(state.remainingSeconds).toBeLessThanOrEqual(DELAY);
  });

  it("fires shouldCancel when delay has elapsed", async () => {
    // Write a marker from the past (delay + 5 seconds ago)
    const past = Math.floor(Date.now() / 1000) - DELAY - 5;
    const markerPath = join(cacheDir, `${OWNER}-${REPO}`, String(PR), "ready-since.txt");
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(join(cacheDir, `${OWNER}-${REPO}`, String(PR)), { recursive: true });
    await writeFile(markerPath, String(past), "utf8");

    const state = await updateReadyDelay(PR, true, DELAY, OWNER, REPO);
    expect(state.isReady).toBe(true);
    expect(state.shouldCancel).toBe(true);
    expect(state.remainingSeconds).toBe(0);
  });

  it("keeps the marker file after shouldCancel fires so subsequent calls also return shouldCancel:true", async () => {
    // Write a past marker
    const past = Math.floor(Date.now() / 1000) - DELAY - 5;
    const markerPath = join(cacheDir, `${OWNER}-${REPO}`, String(PR), "ready-since.txt");
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(join(cacheDir, `${OWNER}-${REPO}`, String(PR)), { recursive: true });
    await writeFile(markerPath, String(past), "utf8");

    // First call fires shouldCancel
    const first = await updateReadyDelay(PR, true, DELAY, OWNER, REPO);
    expect(first.shouldCancel).toBe(true);

    // Marker file must still exist
    const contents = await readFile(markerPath, "utf8");
    expect(contents).toBe(String(past));

    // Second call (simulating next cron tick) also returns shouldCancel:true
    const second = await updateReadyDelay(PR, true, DELAY, OWNER, REPO);
    expect(second.shouldCancel).toBe(true);
  });

  it("resets the countdown when ready-since.txt contains a future timestamp (clock skew)", async () => {
    // Write a marker far in the future (simulating clock skew or manual corruption).
    const future = Math.floor(Date.now() / 1000) + 9999;
    const markerPath = join(cacheDir, `${OWNER}-${REPO}`, String(PR), "ready-since.txt");
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(join(cacheDir, `${OWNER}-${REPO}`, String(PR)), { recursive: true });
    await writeFile(markerPath, String(future), "utf8");

    const state = await updateReadyDelay(PR, true, DELAY, OWNER, REPO);
    // Future timestamp must be reset to "now" — remaining should be ~DELAY.
    expect(state.isReady).toBe(true);
    expect(state.shouldCancel).toBe(false);
    expect(state.remainingSeconds).toBeGreaterThan(0);
    expect(state.remainingSeconds).toBeLessThanOrEqual(DELAY);
  });

  it("resets the timer when PR drops out of READY state after shouldCancel", async () => {
    const past = Math.floor(Date.now() / 1000) - DELAY - 5;
    const markerPath = join(cacheDir, `${OWNER}-${REPO}`, String(PR), "ready-since.txt");
    const { mkdir, writeFile, access } = await import("node:fs/promises");
    await mkdir(join(cacheDir, `${OWNER}-${REPO}`, String(PR)), { recursive: true });
    await writeFile(markerPath, String(past), "utf8");

    // shouldCancel fires
    await updateReadyDelay(PR, true, DELAY, OWNER, REPO);

    // PR becomes not-ready (e.g. new review comment) — timer must reset
    const reset = await updateReadyDelay(PR, false, DELAY, OWNER, REPO);
    expect(reset.isReady).toBe(false);
    expect(reset.shouldCancel).toBe(false);

    // Marker file must be gone
    await expect(access(markerPath)).rejects.toThrow();
  });

  it("rejects when owner contains an invalid path segment character", async () => {
    // owner contains '/' which is not in the allowed SAFE_SEGMENT charset.
    await expect(updateReadyDelay(PR, true, DELAY, "owner/bad", "repo")).rejects.toThrow(
      "Invalid path segment",
    );
  });
});
