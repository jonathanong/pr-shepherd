import { describe, expect, it, vi } from "vitest";
import {
  wire,
  serve,
  comment,
  repo,
  prefix,
} from "../test-helpers/github/rest-read.test-support.mts";
import { restIterateRoutes as routes } from "../test-helpers/github/rest-iterate-routes.test-support.mts";
import { runIterate } from "../src/commands/iterate/index.mts";
import { runPoll } from "../src/commands/poll.mts";
import { runWithGithubTransport } from "../src/github/transport.mts";
import { readReadyReceipt } from "../src/state/ready-receipts.mts";

const iterate = (extra: { noAutoMarkReady?: boolean } = {}) =>
  runWithGithubTransport("rest", () =>
    runIterate({
      prNumber: 101,
      targetRepository: repo,
      format: "json",
      readyDelaySeconds: 0,
      stallTimeoutSeconds: 0,
      ...extra,
    }),
  );

const pollUntilTerminal = () =>
  runWithGithubTransport("rest", () =>
    runPoll({
      prNumber: 101,
      targetRepository: repo,
      format: "json",
      readyDelaySeconds: 0,
      stallTimeoutSeconds: 0,
      intervalSeconds: 0,
      timeoutSeconds: 0,
      debounceSeconds: 0,
      untilTerminal: true,
      noAutoMarkReady: true,
    }),
  );

function assertNoGraphql() {
  expect(wire.requests.some((request) => request.path === "/graphql")).toBe(false);
}

describe("REST transport iterate scenarios", () => {
  it("waits on an in-progress CI check using REST data", async () => {
    await serve(routes({ pending: true }));
    const result = await iterate({ noAutoMarkReady: true });
    expect(result).toMatchObject({ action: "wait", transport: "rest", status: "IN_PROGRESS" });
    assertNoGraphql();
  });

  it("resumes a cloud REST --until-terminal run and records ready evidence", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await serve(routes({ comments: [comment(11)] }));
    const first = await pollUntilTerminal();
    expect(first.action).toBe("fix_code");
    if (first.action !== "fix_code") throw new Error("expected first-look work");
    expect(first.fix.firstLookThreads).toHaveLength(1);
    expect(first.fix.firstLookThreads[0]).toMatchObject({ firstLookStatus: "resolved" });

    // A fresh transport runner models an independently started CLI invocation;
    // seen markers and ready receipts live outside that process scope.
    const next = await pollUntilTerminal();
    expect(next).toMatchObject({
      action: "cancel",
      reason: "ready-delay-elapsed",
      status: "READY",
    });
    expect(next.action === "fix_code" ? next.fix.firstLookThreads : []).toHaveLength(0);
    expect(await readReadyReceipt({ owner: repo.owner, repo: repo.name, pr: 101 })).not.toBeNull();
    assertNoGraphql();
  });

  it("surfaces status-unknown feedback once and escalates the incomplete REST snapshot", async () => {
    await serve(routes({ comments: [comment(11)] }));
    const first = await iterate({ noAutoMarkReady: true });
    expect(first.action).toBe("fix_code");
    if (first.action !== "fix_code") throw new Error("expected first-look work");
    expect(first.fix.firstLookThreads).toMatchObject([{ firstLookStatus: "unknown" }]);

    const next = await iterate({ noAutoMarkReady: true });
    expect(next).toMatchObject({
      action: "escalate",
      escalate: { triggers: ["transport-unsupported"] },
    });
    assertNoGraphql();
  });

  it("uses the cloud CCR endpoint to mark a draft ready without GraphQL", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await serve(routes({ draft: true }));
    const result = await iterate();
    expect(result).toMatchObject({ action: "mark_ready", markedReady: true, transport: "rest" });
    expect(
      wire.requests.some(
        (request) =>
          request.method === "POST" && request.path === `${prefix}/pulls/101/ccr/ready_for_review`,
      ),
    ).toBe(true);
    assertNoGraphql();
  });
});
