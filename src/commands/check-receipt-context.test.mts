import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCheckExecutionContext } from "./check-execution-context.mts";
import { readyDelayElapsed } from "./ready-delay.mts";
import { writeReadyReceipt } from "../state/ready-receipts.mts";
import type { RawSummaryPr } from "../github/poll-summary-raw.mts";

const repo = { owner: "acme", name: "widgets" };
const key = { owner: repo.owner, repo: repo.name, pr: 42 };
const now = 1_800_000_000;
let stateDir: string;

beforeEach(async () => {
  stateDir = await mkdtemp(join(tmpdir(), "shepherd-receipt-context-"));
  vi.stubEnv("PR_SHEPHERD_STATE_DIR", stateDir);
  vi.spyOn(Date, "now").mockReturnValue(now * 1000);
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(stateDir, { recursive: true, force: true });
});

function markerPath() {
  return join(stateDir, repo.owner, repo.name, String(key.pr), "ready-since.txt");
}

async function writeMarker(content: string) {
  await mkdir(join(stateDir, repo.owner, repo.name, String(key.pr)), { recursive: true });
  await writeFile(markerPath(), content);
}

describe("receipt evidence query gating", () => {
  it("keeps the ordinary query when no durable evidence needs checking", async () => {
    const context = createCheckExecutionContext(600);
    expect(await context.wantsReceiptSummary(key.pr, repo)).toBe(false);
    await writeMarker(`${now - 599} head-a`);
    expect(await context.wantsReceiptSummary(key.pr, repo)).toBe(false);
    expect(await readFile(markerPath(), "utf8")).toBe(`${now - 599} head-a`);
  });

  it("requests evidence at the elapsed boundary without consuming the marker", async () => {
    await writeMarker(`${now - 600} head-a`);
    expect(await createCheckExecutionContext(600).wantsReceiptSummary(key.pr, repo)).toBe(true);
    expect(await readFile(markerPath(), "utf8")).toBe(`${now - 600} head-a`);
  });

  it("requests evidence for a persisted v1 receipt before any countdown elapses", async () => {
    await writeReadyReceipt({
      version: 1,
      ...key,
      headRefOid: "head-a",
      baseRefOid: "base-a",
      status: "READY",
      isDraft: false,
      readinessFingerprint: "existing-fingerprint",
      recordedAtUnix: now - 1,
    });
    expect(await createCheckExecutionContext(600).wantsReceiptSummary(key.pr, repo)).toBe(true);
    // Standalone checks have no receipt consumer and keep the ordinary query.
    expect(await createCheckExecutionContext().wantsReceiptSummary(key.pr, repo)).toBe(false);
    expect(await createCheckExecutionContext(600).wantsReceiptSummary(43, repo)).toBe(false);
  });

  it.each([
    "not-a-timestamp head-a",
    `${now + 1} head-a`,
    `${now - 600}`,
    `${now - 600}.5 head-a`,
    "",
  ])("ignores unusable elapsed-marker hints: %s", async (content) => {
    await writeMarker(content);
    expect(await readyDelayElapsed(key.pr, repo.owner, repo.name, 600)).toBe(false);
  });

  it("does not revive stale same-tick evidence after a mutation attempt", () => {
    const snapshot = { number: key.pr } as RawSummaryPr;
    const context = createCheckExecutionContext(600);
    context.setReceiptSummary(snapshot);
    expect(context.getReceiptSummary()).toBe(snapshot);
    context.invalidateReceiptSummary();
    expect(context.getReceiptSummary()).toBeNull();
    context.setReceiptSummary(snapshot);
    expect(context.getReceiptSummary()).toBeNull();
    const nextTick = createCheckExecutionContext(600);
    expect(nextTick.getReceiptSummary()).toBeNull();
    nextTick.setReceiptSummary(snapshot);
    expect(nextTick.getReceiptSummary()).toBe(snapshot);
  });
});
