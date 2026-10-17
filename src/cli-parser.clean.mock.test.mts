import { describe, it, expect, vi, afterEach } from "vitest";
import {
  registerHooks,
  mockRunClean,
  getStdout,
  getStderr,
} from "../test-helpers/cli-parser.clean.test-support.mts";
import { main } from "./cli-parser.mts";
import { EXIT } from "./exit-codes.mts";
import { durableStateRequested } from "./state/durable-state.mts";

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
  it("writes usage to stderr and exits EX_USAGE when no variant given", async () => {
    await main(["node", "shepherd", "admin", "clean"]);
    expect(getStderr()).toContain("Usage:");
    expect(process.exitCode).toBe(EXIT.USAGE);
    expect(mockRunClean).not.toHaveBeenCalled();
  });

  it("writes usage to stderr and exits EX_USAGE for unknown variant", async () => {
    await main(["node", "shepherd", "admin", "clean", "unknown"]);
    expect(getStderr()).toContain("Usage:");
    expect(process.exitCode).toBe(EXIT.USAGE);
    expect(mockRunClean).not.toHaveBeenCalled();
  });

  it("calls runClean with variant and writes text output on success", async () => {
    mockRunClean.mockResolvedValue(OK_RESULT);
    await main(["node", "shepherd", "admin", "clean", "all"]);
    expect(mockRunClean).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "all", dryRun: false }),
    );
    expect(getStdout()).toBeTruthy();
    expect(process.exitCode).toBeUndefined();
  });

  it("routes the canonical admin clean command", async () => {
    mockRunClean.mockResolvedValue(OK_RESULT);

    await main(["node", "shepherd", "admin", "clean", "all"]);

    expect(mockRunClean).toHaveBeenCalledWith(expect.objectContaining({ variant: "all" }));
  });

  it("writes error to stderr and exits EX_SOFTWARE when runClean returns ok=false", async () => {
    mockRunClean.mockResolvedValue(ERROR_RESULT);
    await main(["node", "shepherd", "admin", "clean", "pr"]);
    expect(getStderr()).toContain("No open PR found");
    expect(process.exitCode).toBe(EXIT.SOFTWARE);
  });

  it("outputs JSON when --format=json is passed (combined form)", async () => {
    mockRunClean.mockResolvedValue(OK_RESULT);
    await main(["node", "shepherd", "admin", "clean", "all", "--format=json"]);
    const out = getStdout();
    const parsed = JSON.parse(out);
    expect(parsed.ok).toBe(true);
    expect(parsed.variant).toBe("all");
  });

  it("outputs JSON when --format json is passed (two-token form)", async () => {
    mockRunClean.mockResolvedValue(OK_RESULT);
    await main(["node", "shepherd", "admin", "clean", "all", "--format", "json"]);
    const out = getStdout();
    const parsed = JSON.parse(out);
    expect(parsed.ok).toBe(true);
  });

  it("does not treat 'json' as the positional value when --format json is used", async () => {
    mockRunClean.mockResolvedValue(OK_RESULT);
    await main(["node", "shepherd", "admin", "clean", "all", "--format", "json"]);
    expect(mockRunClean).toHaveBeenCalledWith(expect.objectContaining({ value: undefined }));
  });

  it("passes --dry-run flag to runClean", async () => {
    mockRunClean.mockResolvedValue({ ...OK_RESULT, dryRun: true });
    await main(["node", "shepherd", "admin", "clean", "all", "--dry-run"]);
    expect(mockRunClean).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }));
  });

  it("writes error to stderr and exits EX_USAGE for extra positional arguments", async () => {
    await main(["node", "shepherd", "admin", "clean", "pr", "42", "99"]);
    expect(getStderr()).toContain("too many positional");
    expect(process.exitCode).toBe(EXIT.USAGE);
    expect(mockRunClean).not.toHaveBeenCalled();
  });

  it("passes positional value for pr variant", async () => {
    mockRunClean.mockResolvedValue({ ...OK_RESULT, variant: "pr" });
    await main(["node", "shepherd", "admin", "clean", "pr", "42"]);
    expect(mockRunClean).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "pr", value: "42" }),
    );
  });

  it("writes error to stderr and exits EX_USAGE for unknown flag", async () => {
    await main(["node", "shepherd", "admin", "clean", "all", "--dryrun"]);
    expect(getStderr()).toContain("unknown flag");
    expect(process.exitCode).toBe(EXIT.USAGE);
    expect(mockRunClean).not.toHaveBeenCalled();
  });

  it("writes error to stderr and exits EX_USAGE for invalid --format value", async () => {
    await main(["node", "shepherd", "admin", "clean", "all", "--format", "xml"]);
    expect(getStderr()).toContain("invalid --format value");
    expect(process.exitCode).toBe(EXIT.USAGE);
    expect(mockRunClean).not.toHaveBeenCalled();
  });
});

describe("main — clean durable state scope", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("cleans inside the durable state scope only in a cloud session", async () => {
    const durable: boolean[] = [];
    mockRunClean.mockImplementation(async () => {
      durable.push(durableStateRequested());
      return { ...OK_RESULT, variant: "pr" };
    });
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await main(["node", "shepherd", "admin", "clean", "pr", "42"]);
    vi.stubEnv("CLAUDE_CODE_REMOTE", "");
    await main(["node", "shepherd", "admin", "clean", "all"]);
    expect(durable).toEqual([true, false]);
    expect(process.exitCode).toBeUndefined();
  });

  it("rejects the removed --poll-mode flag", async () => {
    await main(["node", "shepherd", "admin", "clean", "all", "--poll-mode", "event"]);
    expect(getStderr()).toContain('pr-shepherd: admin clean: unknown flag: "--poll-mode"');
    expect(process.exitCode).toBe(EXIT.USAGE);
    expect(mockRunClean).not.toHaveBeenCalled();
  });
});
