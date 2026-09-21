import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  clearReadyReceipt,
  isReadyReceiptCurrent,
  readReadyReceipt,
  writeReadyReceipt,
  type ReadyReceipt,
  type ReadyReceiptCurrentState,
} from "./ready-receipts.mts";

const key = { owner: "acme", repo: "widgets", pr: 42 };
const receipt: ReadyReceipt = {
  version: 1,
  ...key,
  headRefOid: "head-1",
  baseRefOid: "base-1",
  status: "READY",
  isDraft: false,
  readinessFingerprint: "state-1",
  recordedAtUnix: 1_700_000_000,
};

let stateDir: string;

beforeEach(async () => {
  stateDir = await mkdtemp(join(tmpdir(), "shepherd-ready-receipt-"));
  process.env["PR_SHEPHERD_STATE_DIR"] = stateDir;
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(stateDir, { recursive: true, force: true });
});

describe("ready receipts", () => {
  it("round-trips a receipt keyed to the repository and PR", async () => {
    await writeReadyReceipt(receipt);

    await expect(readReadyReceipt(key)).resolves.toEqual(receipt);
  });

  it("returns null for malformed or mismatched receipts", async () => {
    await writeReadyReceipt(receipt);

    await expect(readReadyReceipt({ ...key, pr: 43 })).resolves.toBeNull();
  });

  it.each([
    ["head ref drift", { headRefOid: "head-2" }],
    ["base ref drift", { baseRefOid: "base-2" }],
    ["readiness drift", { readinessFingerprint: "state-2" }],
    ["draft state", { isDraft: true }],
    ["non-ready status", { status: "PENDING" }],
  ] as [string, Partial<ReadyReceiptCurrentState>][])("rejects %s", (_reason, changes) => {
    const current: ReadyReceiptCurrentState = {
      headRefOid: receipt.headRefOid,
      baseRefOid: receipt.baseRefOid,
      readinessFingerprint: receipt.readinessFingerprint,
      status: receipt.status,
      isDraft: receipt.isDraft,
      ...changes,
    };
    expect(isReadyReceiptCurrent(receipt, current)).toBe(false);
  });

  it("accepts only an exact non-draft READY snapshot", () => {
    expect(
      isReadyReceiptCurrent(receipt, {
        headRefOid: receipt.headRefOid,
        baseRefOid: receipt.baseRefOid,
        readinessFingerprint: receipt.readinessFingerprint,
        status: "READY",
        isDraft: false,
      }),
    ).toBe(true);
  });

  it("clears a receipt idempotently", async () => {
    await writeReadyReceipt(receipt);
    await clearReadyReceipt(key);
    await clearReadyReceipt(key);

    await expect(readReadyReceipt(key)).resolves.toBeNull();
  });
});
