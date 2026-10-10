import { afterEach, describe, expect, it, vi } from "vitest";
import { canGenerateGithubMutation } from "./mutation-policy.mts";
import { runWithGithubTransport } from "./transport.mts";

afterEach(() => vi.unstubAllEnvs());

describe("canGenerateGithubMutation", () => {
  it("requires confirmed capability on GraphQL", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "false");
    await runWithGithubTransport("graphql", async () => {
      expect(canGenerateGithubMutation(true, "reply")).toBe(true);
      expect(canGenerateGithubMutation(undefined, "reply")).toBe(false);
      expect(canGenerateGithubMutation(false, "reply")).toBe(false);
    });
  });

  it("allows unknown REST reply and dismissal capability but honors known denial", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "false");
    await runWithGithubTransport("rest", async () => {
      expect(canGenerateGithubMutation(undefined, "reply")).toBe(true);
      expect(canGenerateGithubMutation(undefined, "dismiss")).toBe(true);
      expect(canGenerateGithubMutation(false, "reply")).toBe(false);
      expect(canGenerateGithubMutation(false, "dismiss")).toBe(false);
    });
  });

  it("permits REST resolve and ready only on the known CCR route", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "false");
    await runWithGithubTransport("rest", async () => {
      expect(canGenerateGithubMutation(undefined, "resolve")).toBe(false);
      expect(canGenerateGithubMutation(undefined, "ready")).toBe(false);
    });
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await runWithGithubTransport("auto", async () => {
      expect(canGenerateGithubMutation(undefined, "resolve")).toBe(true);
      expect(canGenerateGithubMutation(undefined, "ready")).toBe(true);
      expect(canGenerateGithubMutation(false, "resolve")).toBe(false);
      expect(canGenerateGithubMutation(false, "ready")).toBe(false);
    });
  });

  it("does not generate REST minimization or file-view mutations", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await runWithGithubTransport("auto", async () => {
      expect(canGenerateGithubMutation(true, "minimize")).toBe(false);
      expect(canGenerateGithubMutation(undefined, "minimize")).toBe(false);
      expect(canGenerateGithubMutation(true, "view")).toBe(false);
      expect(canGenerateGithubMutation(undefined, "view")).toBe(false);
    });
  });
});
