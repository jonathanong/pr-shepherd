import { describe, expect, it } from "vitest";
import { serve, wire, repo, comment } from "../test-helpers/github/rest-read.test-support.mts";
import { restIterateRoutes } from "../test-helpers/github/rest-iterate-routes.test-support.mts";
import { runPoll } from "../src/commands/poll.mts";
import { runWithGithubTransport } from "../src/github/transport.mts";
import { readReadyReceipt } from "../src/state/ready-receipts.mts";

describe("GraphQL quota exhaustion during an automatic poll", () => {
  it("surfaces feedback after fallback and refuses READY while REST evidence is incomplete", async () => {
    await serve(restIterateRoutes({ quotaHeaders: false, comments: [comment(11)] }));
    const poll = () =>
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
      });
    await runWithGithubTransport("auto", async () => {
      const first = await poll();
      expect(first).toMatchObject({ action: "fix_code", transport: "rest" });
      if (first.action !== "fix_code") throw new Error("expected first-look feedback");
      expect(first.fix.firstLookThreads).toMatchObject([{ firstLookStatus: "unknown" }]);
      expect(await poll()).toMatchObject({
        action: "escalate",
        transport: "rest",
        escalate: { triggers: ["transport-unsupported"] },
      });
    });
    expect(wire.requests.filter(({ path }) => path === "/graphql")).toHaveLength(1);
    expect(wire.requests.filter(({ path }) => path === "/rate_limit")).toHaveLength(1);
    expect(await readReadyReceipt({ owner: repo.owner, repo: repo.name, pr: 101 })).toBeNull();
  });

  it.each([true, false])(
    "finishes with REST READY evidence and retains fallback across polls (quota headers=%s)",
    async (quotaHeaders) => {
      await serve(restIterateRoutes({ quotaHeaders }));
      const poll = () =>
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
        });
      await runWithGithubTransport("auto", async () => {
        for (let tick = 0; tick < 2; tick++) {
          const result = await poll();
          expect(result).toMatchObject({
            action: "cancel",
            reason: "ready-delay-elapsed",
            status: "READY",
            transport: "rest",
          });
        }
      });
      expect(wire.requests.filter(({ path }) => path === "/graphql")).toHaveLength(1);
      expect(wire.requests.filter(({ path }) => path === "/rate_limit")).toHaveLength(
        quotaHeaders ? 0 : 1,
      );
      expect(
        await readReadyReceipt({ owner: repo.owner, repo: repo.name, pr: 101 }),
      ).not.toBeNull();
      expect(wire.requests.filter(({ method }) => method !== "GET")).toMatchObject([
        { method: "POST", path: "/graphql" },
      ]);
    },
  );
});
