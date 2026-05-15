// @ts-nocheck
import { describe, it, expect } from "vitest";
import {
  registerHooks,
  mockRunClean,
  getStdout,
  getStderr,
} from "./cli-parser.clean.test-support.mts";
import { main } from "./cli-parser.mts";

registerHooks();

const OK_RESULT = {
  ok: true,
  variant: "all" as const,
  dryRun: false,
  base: "/state",
  target: "/state",
  deleted: ["/state/owner-repo"],
  skipped: [],
};

const ERROR_RESULT = {
  ok: false,
  variant: "pr" as const,
  dryRun: false,
  base: "/state",
  target: "",
  deleted: [],
  skipped: [],
  error: "No open PR found for current branch",
};

describe("main — clean dispatch", () => {
  it("writes usage to stderr and exits 1 when no variant given", async () => {
    await main(["node", "shepherd", "clean"]);
    expect(getStderr()).toContain("Usage:");
    expect(process.exitCode).toBe(1);
    expect(mockRunClean).not.toHaveBeenCalled();
  });

  it("writes usage to stderr and exits 1 for unknown variant", async () => {
    await main(["node", "shepherd", "clean", "unknown"]);
    expect(getStderr()).toContain("Usage:");
    expect(process.exitCode).toBe(1);
    expect(mockRunClean).not.toHaveBeenCalled();
  });

  it("calls runClean with variant and writes text output on success", async () => {
    mockRunClean.mockResolvedValue(OK_RESULT);
    await main(["node", "shepherd", "clean", "all"]);
    expect(mockRunClean).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "all", dryRun: false }),
    );
    expect(getStdout()).toBeTruthy();
    expect(process.exitCode).toBeUndefined();
  });

  it("writes error to stderr and exits 1 when runClean returns ok=false", async () => {
    mockRunClean.mockResolvedValue(ERROR_RESULT);
    await main(["node", "shepherd", "clean", "pr"]);
    expect(getStderr()).toContain("No open PR found");
    expect(process.exitCode).toBe(1);
  });

  it("outputs JSON when --format=json is passed (combined form)", async () => {
    mockRunClean.mockResolvedValue(OK_RESULT);
    await main(["node", "shepherd", "clean", "all", "--format=json"]);
    const out = getStdout();
    const parsed = JSON.parse(out);
    expect(parsed.ok).toBe(true);
    expect(parsed.variant).toBe("all");
  });

  it("outputs JSON when --format json is passed (two-token form)", async () => {
    mockRunClean.mockResolvedValue(OK_RESULT);
    await main(["node", "shepherd", "clean", "all", "--format", "json"]);
    const out = getStdout();
    const parsed = JSON.parse(out);
    expect(parsed.ok).toBe(true);
  });

  it("does not treat 'json' as the positional value when --format json is used", async () => {
    mockRunClean.mockResolvedValue(OK_RESULT);
    await main(["node", "shepherd", "clean", "all", "--format", "json"]);
    expect(mockRunClean).toHaveBeenCalledWith(expect.objectContaining({ value: undefined }));
  });

  it("passes --dry-run flag to runClean", async () => {
    mockRunClean.mockResolvedValue({ ...OK_RESULT, dryRun: true });
    await main(["node", "shepherd", "clean", "all", "--dry-run"]);
    expect(mockRunClean).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }));
  });

  it("passes positional value for pr variant", async () => {
    mockRunClean.mockResolvedValue({ ...OK_RESULT, variant: "pr" });
    await main(["node", "shepherd", "clean", "pr", "42"]);
    expect(mockRunClean).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "pr", value: "42" }),
    );
  });
});
