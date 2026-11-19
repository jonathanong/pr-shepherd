import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubRequestError } from "./errors.mts";
import {
  createGithubTransportRunner,
  getGithubTransportReason,
  githubOperation,
} from "./transport.mts";
import { transportReasonField } from "./transport-evidence.mts";
import { buildPrShepherdCommand } from "../cli/runner.mts";
import { formatTransportEvidence, projectTransportEvidence } from "../cli/transport-formatter.mts";

afterEach(() => vi.unstubAllEnvs());

const outage = new GitHubRequestError("GraphQL 502 Bad Gateway", { status: 502 });
const failing = () =>
  githubOperation(
    "PollStackSummary",
    () => Promise.reject(outage),
    () => Promise.resolve("rest"),
  );

describe("transport reason", () => {
  it("is absent on GraphQL, and states the cause once auto falls back", async () => {
    await createGithubTransportRunner("auto")(async () => {
      expect(getGithubTransportReason()).toBeUndefined();
      expect(transportReasonField()).toEqual({});
      expect(await failing()).toBe("rest");
      expect(getGithubTransportReason()).toMatch(
        /auto switched to REST after GraphQL PollStackSummary/,
      );
      expect(getGithubTransportReason()).toMatch(/outage/);
      expect(transportReasonField().transportReason).toBeDefined();
    });
  });

  it("is absent when the caller requested REST, and names the cloud session", async () => {
    await createGithubTransportRunner("rest")(async () => {
      expect(getGithubTransportReason()).toBeUndefined();
    });
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await createGithubTransportRunner("auto")(async () => {
      expect(getGithubTransportReason()).toMatch(/cloud session/);
    });
  });

  it("propagates --transport rest into printed commands only when requested", async () => {
    await createGithubTransportRunner("auto")(async () => {
      await failing();
      expect(buildPrShepherdCommand(["iterate", "7"]).argv).not.toContain("--transport");
    });
    await createGithubTransportRunner("rest")(async () => {
      expect(buildPrShepherdCommand(["iterate", "7"]).argv.slice(-2)).toEqual([
        "--transport",
        "rest",
      ]);
    });
  });

  it("renders the reason in text and JSON alike", () => {
    const value = { transport: "rest" as const, transportReason: "why" };
    expect(formatTransportEvidence(value)).toEqual(["**transport** `rest` (why)"]);
    expect(projectTransportEvidence(value)).toEqual(value);
    expect(formatTransportEvidence({ transport: "rest" })).toEqual(["**transport** `rest`"]);
  });
});
