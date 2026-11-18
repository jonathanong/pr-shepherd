import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GitHubRequestError } from "../github/errors.mts";
import { formatCliError } from "./error-format.mts";

describe("formatCliError", () => {
  it("surfaces authoritative quota and credential details", () => {
    const error = new GitHubRequestError("GitHub GraphQL error", {
      status: 200,
      authSource: "gh auth token",
      rateLimit: {
        resource: "graphql",
        limit: 5_000,
        used: 5_002,
        remaining: 0,
        resetAt: 1_788_066_749,
      },
    });
    expect(formatCliError(error)).toBe(
      "GitHub GraphQL error (resource graphql; remaining 0/5000; used 5002; reset 2026-08-30T05:12:29.000Z; credential gh auth token)",
    );
  });

  it("surfaces retry guidance without quota metadata", () => {
    const error = new GitHubRequestError("GitHub REST error", {
      status: 429,
      retryAfterSeconds: 60,
    });

    expect(formatCliError(error)).toBe("GitHub REST error (retry after 60s)");
  });

  describe("state directory permission errors", () => {
    const saved = process.env["PR_SHEPHERD_STATE_DIR"];
    beforeEach(() => {
      process.env["PR_SHEPHERD_STATE_DIR"] = "/state";
    });
    afterEach(() => {
      if (saved === undefined) delete process.env["PR_SHEPHERD_STATE_DIR"];
      else process.env["PR_SHEPHERD_STATE_DIR"] = saved;
    });

    function fsError(code: string, path: string | undefined): Error {
      return Object.assign(new Error(`${code}: operation not permitted`), { code, path });
    }

    it.each(["EPERM", "EACCES"])("adds an actionable hint for %s inside the state dir", (code) => {
      expect(formatCliError(fsError(code, "/state/o/r/worktrees/x.md"))).toBe(
        `${code}: operation not permitted\nstate dir /state not writable; set PR_SHEPHERD_STATE_DIR to a writable directory or run outside the sandbox`,
      );
    });

    it.each([
      ["outside the state dir", fsError("EPERM", "/elsewhere/file")],
      ["a non-permission code", fsError("ENOENT", "/state/x")],
      ["no path", fsError("EPERM", undefined)],
    ])("leaves the message alone for %s", (_label, err) => {
      expect(formatCliError(err)).toBe(err.message);
    });

    it("tolerates a nullish error", () => {
      expect(formatCliError(undefined)).toBe("undefined");
    });
  });
});
