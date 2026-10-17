import { afterEach, describe, expect, it, vi } from "vitest";
import { EXIT } from "../exit-codes.mts";
import { rejectUnknownFlags } from "./unknown-flags.mts";

const KNOWN = ["--resolve-thread-ids", "--message", "--adopt-existing-replies"];

describe("rejectUnknownFlags", () => {
  afterEach(() => {
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it("rejects a removed flag before it can swallow the PR number", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    expect(
      rejectUnknownFlags(["--fetch", "42", "--resolve-thread-ids", "A"], "apply review", KNOWN),
    ).toBe(true);
    expect(process.exitCode).toBe(EXIT.USAGE);
    expect(stderr.mock.calls.map((call) => call[0]).join("")).toContain(
      'pr-shepherd: apply review: unknown flag "--fetch".',
    );
  });

  it("rejects unknown inline flags", () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    expect(rejectUnknownFlags(["42", "--no-auto-cancel-actionable=1"], "iterate", [])).toBe(true);
  });

  it("accepts known, global, and inline flags plus dash-leading values", () => {
    expect(
      rejectUnknownFlags(
        ["42", "--message", "-1 from me", "--format=json", "--verbose", "--adopt-existing-replies"],
        "apply review",
        KNOWN,
      ),
    ).toBe(false);
    expect(process.exitCode).toBeUndefined();
  });
});
