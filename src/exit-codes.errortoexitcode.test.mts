import { describe, it, expect } from "vitest";
import { EXIT, ShepherdError, errorToExitCode } from "./exit-codes.mts";
import { GitHubRequestError } from "./github/errors.mts";

// ---------------------------------------------------------------------------
// errorToExitCode
// ---------------------------------------------------------------------------

describe("errorToExitCode", () => {
  it("returns the carried exit code for a ShepherdError", () => {
    const err = new ShepherdError("bad flag", EXIT.USAGE);
    expect(errorToExitCode(err)).toBe(EXIT.USAGE);
  });

  it("returns EX_SOFTWARE for a plain Error", () => {
    expect(errorToExitCode(new Error("boom"))).toBe(EXIT.SOFTWARE);
  });

  it("returns EX_SOFTWARE for a non-Error throw", () => {
    expect(errorToExitCode("just a string")).toBe(EXIT.SOFTWARE);
    expect(errorToExitCode(null)).toBe(EXIT.SOFTWARE);
    expect(errorToExitCode(undefined)).toBe(EXIT.SOFTWARE);
  });

  it.each([
    [401, EXIT.NOPERM],
    [403, EXIT.NOPERM],
    [429, EXIT.TEMPFAIL],
    [500, EXIT.TEMPFAIL],
    [404, EXIT.UNAVAILABLE],
  ])("classifies GitHubRequestError with status %d as %d", (status, code) => {
    const err = new GitHubRequestError("request failed", { status });
    expect(errorToExitCode(err)).toBe(code);
  });

  it("classifies a GitHubRequestError with retryAfterSeconds as EX_TEMPFAIL regardless of status", () => {
    const err = new GitHubRequestError("secondary rate limit", {
      status: 403,
      retryAfterSeconds: 60,
    });
    // 403 alone would be NOPERM, but retryAfterSeconds means "retry", which takes priority.
    expect(errorToExitCode(err)).toBe(EXIT.TEMPFAIL);
  });

  it("classifies a GitHubRequestError with an exhausted rate limit as EX_TEMPFAIL", () => {
    const err = new GitHubRequestError("rate limited", {
      status: 404,
      rateLimit: { remaining: 0, limit: 5000, resetAt: 1_700_000_000 },
    });
    expect(errorToExitCode(err)).toBe(EXIT.TEMPFAIL);
  });
});
