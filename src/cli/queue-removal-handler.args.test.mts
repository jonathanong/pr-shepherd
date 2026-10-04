import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXIT } from "../exit-codes.mts";

const { apply } = vi.hoisted(() => ({ apply: vi.fn() }));
vi.mock("../commands/apply-queue-removal.mts", () => ({ applyQueueRemovalAck: apply }));
import { handleQueueRemoval } from "./queue-removal-handler.mts";

const head = "a".repeat(40);
const queue = "b".repeat(40);
const valid = ["42", "--require-sha", head, "--queue-commit", queue, "--removed-at", "1700000000"];
let stdout: ReturnType<typeof vi.spyOn>;
let stderr: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.exitCode = undefined;
  apply.mockReset();
  stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});
afterEach(() => {
  process.exitCode = undefined;
  stdout.mockRestore();
  stderr.mockRestore();
});

describe("queue-removal input validation", () => {
  it.each([
    ["unknown flag", [...valid, "--unexpected"], EXIT.USAGE],
    ["extra positional", [...valid, "extra"], EXIT.USAGE],
    ["missing value", [...valid, "--queue-commit"], EXIT.USAGE],
    ["empty equals value", [...valid, "--queue-commit="], EXIT.USAGE],
    ["invalid head", ["42", "--require-sha", "short", ...valid.slice(3)], EXIT.DATAERR],
    ["invalid queue commit", [...valid.slice(0, 4), "SHORT", ...valid.slice(5)], EXIT.DATAERR],
    ["invalid timestamp", [...valid.slice(0, 6), "-1"], EXIT.DATAERR],
    ["unsafe timestamp", [...valid.slice(0, 6), "9007199254740992"], EXIT.DATAERR],
  ])("rejects %s before invoking the mutation", async (_name, args, code) => {
    await handleQueueRemoval(args as string[]);
    expect(process.exitCode).toBe(code);
    expect(apply).not.toHaveBeenCalled();
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining("pr-shepherd: apply queue-removal:"),
    );
    if (code === EXIT.USAGE)
      expect(stderr).toHaveBeenCalledWith(expect.stringContaining("--queue-commit <commit>"));
  });

  it("accepts equals syntax while preserving every evidence field", async () => {
    apply.mockResolvedValue({
      pr: 42,
      repo: "acme/widgets",
      acknowledgment: { headSha: head, queueCommitOid: queue, removedAtUnix: 1700000000 },
    });
    await handleQueueRemoval([
      "42",
      `--require-sha=${head}`,
      `--queue-commit=${queue}`,
      "--removed-at=1700000000",
    ]);
    expect(process.exitCode).toBeUndefined();
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({
        prNumber: 42,
        headSha: head,
        queueCommitOid: queue,
        removedAtUnix: 1700000000,
      }),
    );
  });
});
