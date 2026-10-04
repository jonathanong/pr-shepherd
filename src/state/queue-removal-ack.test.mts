import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePrStatePath } from "./base.mts";

const { mockRename } = vi.hoisted(() => ({ mockRename: vi.fn() }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  mockRename.mockImplementation((...args: Parameters<typeof actual.rename>) =>
    actual.rename(...args),
  );
  return { ...actual, rename: mockRename };
});

import {
  matchesQueueRemovalAcknowledgment,
  readQueueRemovalAcknowledgment,
  writeQueueRemovalAcknowledgment,
  type QueueRemovalAcknowledgment,
} from "./queue-removal-ack.mts";

const key = { owner: "acme", repo: "widgets", pr: 42 };
const record: QueueRemovalAcknowledgment = {
  headSha: "a".repeat(40),
  queueCommitOid: "b".repeat(40),
  removedAtUnix: 1_700_000_000,
};
let stateDir: string;

beforeEach(async () => {
  stateDir = await mkdtemp(join(tmpdir(), "pr-shepherd-queue-removal-state-"));
  process.env["PR_SHEPHERD_STATE_DIR"] = stateDir;
  vi.clearAllMocks();
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(stateDir, { recursive: true, force: true });
});

describe("queue-removal acknowledgment state", () => {
  it("atomically writes and reads the exact acknowledgment", async () => {
    expect(await writeQueueRemovalAcknowledgment(key, record)).toBe(true);
    expect(await readQueueRemovalAcknowledgment(key)).toEqual(record);

    const path = resolvePrStatePath(key, "queue-removal-ack.json");
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(record);
    expect(await readdir(dirname(path))).toEqual(["queue-removal-ack.json"]);
    expect(
      matchesQueueRemovalAcknowledgment(await readQueueRemovalAcknowledgment(key), record),
    ).toBe(true);
  });

  it("treats missing, unreadable, corrupt, and structurally invalid records as absent", async () => {
    const path = resolvePrStatePath(key, "queue-removal-ack.json");
    expect(await readQueueRemovalAcknowledgment(key)).toBeNull();

    await mkdir(path, { recursive: true });
    expect(await readQueueRemovalAcknowledgment(key)).toBeNull();
    await rm(path, { recursive: true });

    await writeFile(path, "not-json", "utf8");
    expect(await readQueueRemovalAcknowledgment(key)).toBeNull();
    await writeFile(path, JSON.stringify({ ...record, queueCommitOid: "short" }), "utf8");
    expect(await readQueueRemovalAcknowledgment(key)).toBeNull();
  });

  it("rejects invalid records without writing them", async () => {
    expect(
      await writeQueueRemovalAcknowledgment(key, {
        ...record,
        removedAtUnix: 0,
      }),
    ).toBe(false);
    expect(await readQueueRemovalAcknowledgment(key)).toBeNull();
  });

  it("cleans up a temporary file and preserves the old record when replacement fails", async () => {
    expect(await writeQueueRemovalAcknowledgment(key, record)).toBe(true);
    const path = resolvePrStatePath(key, "queue-removal-ack.json");
    const replacement = { ...record, queueCommitOid: "c".repeat(40) };
    mockRename.mockRejectedValueOnce(new Error("rename denied"));

    expect(await writeQueueRemovalAcknowledgment(key, replacement)).toBe(false);
    expect(await readQueueRemovalAcknowledgment(key)).toEqual(record);
    expect(await readdir(dirname(path))).toEqual(["queue-removal-ack.json"]);
  });
});
