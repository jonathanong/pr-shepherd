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

  it("classifies a GraphQL 'resource not accessible' error at HTTP 200 as EX_NOPERM", () => {
    // GitHub reports field-level PAT scope failures as an errors[] entry at HTTP 200,
    // not as a 401/403 — status alone can't see this; it requires the message.
    const err = new GitHubRequestError("GitHub GraphQL error: not accessible", {
      status: 200,
      graphqlErrors: [{ message: "Resource not accessible by personal access token" }],
    });
    expect(errorToExitCode(err)).toBe(EXIT.NOPERM);
  });

  it("does not classify an unrelated GraphQL error at HTTP 200 as EX_NOPERM", () => {
    const err = new GitHubRequestError("GitHub GraphQL error: bad field", {
      status: 200,
      graphqlErrors: [{ message: "Variable $id has an invalid value" }],
    });
    expect(errorToExitCode(err)).toBe(EXIT.UNAVAILABLE);
  });

  // Captured from avifenesh/glide-mq BatchPr: HTTP 200, data: null, GitHub GraphQL INTERNAL.
  const BATCHPR_INTERNAL_MESSAGE =
    "Something went wrong while executing your query on 2026-08-29T06:55:45Z. Please include `D8D9:242C07:434A6C:5437E7:6A928270` when reporting this issue.";

  it("classifies GitHub GraphQL INTERNAL by message at HTTP 200 as EX_TEMPFAIL", () => {
    const err = new GitHubRequestError(
      `GitHub GraphQL error (no data): ${BATCHPR_INTERNAL_MESSAGE}`,
      {
        status: 200,
        graphqlErrors: [{ message: BATCHPR_INTERNAL_MESSAGE }],
      },
    );
    expect(errorToExitCode(err)).toBe(EXIT.TEMPFAIL);
  });

  it("classifies GitHub GraphQL INTERNAL by type at HTTP 200 as EX_TEMPFAIL", () => {
    const err = new GitHubRequestError("GitHub GraphQL error (no data)", {
      status: 200,
      graphqlErrors: [{ message: "internal error", type: "INTERNAL" }],
    });
    expect(errorToExitCode(err)).toBe(EXIT.TEMPFAIL);
  });

  it("classifies GitHub GraphQL INTERNAL by extensions.code at HTTP 200 as EX_TEMPFAIL", () => {
    const err = new GitHubRequestError("GitHub GraphQL error (no data)", {
      status: 200,
      graphqlErrors: [{ message: "internal error", extensions: { code: "INTERNAL" } }],
    });
    expect(errorToExitCode(err)).toBe(EXIT.TEMPFAIL);
  });

  it("classifies extensions.code INTERNAL even when type is a different nonempty value", () => {
    const err = new GitHubRequestError("GitHub GraphQL error (no data)", {
      status: 200,
      graphqlErrors: [
        { message: "engine crash", type: "FORBIDDEN", extensions: { code: "INTERNAL" } },
      ],
    });
    expect(errorToExitCode(err)).toBe(EXIT.TEMPFAIL);
  });

  it.each([null, [], "INTERNAL", { code: 1 }] as const)(
    "does not treat non-object-code extensions %j as INTERNAL",
    (extensions) => {
      const err = new GitHubRequestError("GitHub GraphQL error (no data)", {
        status: 200,
        graphqlErrors: [{ message: "not an engine crash", extensions }],
      });
      expect(errorToExitCode(err)).toBe(EXIT.UNAVAILABLE);
    },
  );

  it("does not classify a GraphQL INTERNAL-looking permission error as EX_TEMPFAIL", () => {
    const err = new GitHubRequestError("GitHub GraphQL error: not accessible", {
      status: 200,
      graphqlErrors: [
        { message: "Resource not accessible by personal access token", type: "FORBIDDEN" },
      ],
    });
    expect(errorToExitCode(err)).toBe(EXIT.NOPERM);
  });

  it("lets a retry signal win over a GraphQL permission-error message", () => {
    const err = new GitHubRequestError("secondary rate limit", {
      status: 200,
      retryAfterSeconds: 30,
      graphqlErrors: [{ message: "Resource not accessible by personal access token" }],
    });
    expect(errorToExitCode(err)).toBe(EXIT.TEMPFAIL);
  });

  it("honors exitCodeOverride, bypassing status-based classification entirely", () => {
    const err = new GitHubRequestError("malformed response", {
      status: 200,
      exitCodeOverride: EXIT.SOFTWARE,
    });
    expect(errorToExitCode(err)).toBe(EXIT.SOFTWARE);
  });
});
