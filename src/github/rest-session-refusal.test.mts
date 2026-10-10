import { describe, expect, it } from "vitest";
import { GitHubRequestError } from "./errors.mts";
import { isRestSessionRefusal } from "./rest-session-refusal.mts";

describe("cloud proxy session refusals", () => {
  it.each([
    '{"message":"Blocked","documentation_url":"https://docs.anthropic.com/en/docs/claude-code/github-actions"}',
    "GitHub access to this repository is not enabled for this session",
    "This GitHub API path is not available: sessions are bound to their configured repositories",
  ])("retains a definite proxy refusal: %s", (responseMessage) => {
    expect(
      isRestSessionRefusal(
        new GitHubRequestError("request refused", { status: 403, responseMessage }),
      ),
    ).toBe(true);
  });

  it.each([
    new Error("not enabled for this session"),
    new GitHubRequestError("not enabled for this session", { status: 404 }),
    new GitHubRequestError("Resource not accessible", { status: 403 }),
    new GitHubRequestError("request refused", { status: 403, responseMessage: "null" }),
    new GitHubRequestError("request refused", { status: 403, responseMessage: "{}" }),
    new GitHubRequestError("request refused", {
      status: 403,
      responseMessage: '{"documentation_url":"https://docs.anthropic.com.evil.example/help"}',
    }),
    new GitHubRequestError("request refused", {
      status: 403,
      responseMessage: '{"documentation_url":"not a URL"}',
    }),
  ])("does not infer a session refusal from %s", (error) => {
    expect(isRestSessionRefusal(error)).toBe(false);
  });
});
