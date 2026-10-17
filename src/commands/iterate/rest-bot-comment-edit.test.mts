import { afterEach, describe, expect, it, vi } from "vitest";
import { serve, repo, prefix } from "../../../test-helpers/github/rest-read.test-support.mts";
import { restIterateRoutes } from "../../../test-helpers/github/rest-iterate-routes.test-support.mts";
import { freshLoadConfig } from "../../../test-helpers/config/load-test-support.mts";
import { runWithGithubTransport } from "../../github/transport.mts";
import { runIterate } from "./index.mts";

/**
 * Pins current behavior seen in live cloud run #566: REST cannot minimize, so a bot that edits
 * its status comment in place (a rate-limit notice, a "review running" summary) re-surfaces it as
 * an edited first-look item. On a READY PR that tick is TRIAGE and restarts the ready delay.
 */
const bot = { login: "coderabbitai[bot]", type: "Bot" };

function botComment(body: string) {
  return {
    id: 501,
    node_id: "IC_501",
    body,
    html_url: "https://github.com/octocat/hello-world/pull/101#issuecomment-501",
    created_at: "2026-10-09T00:00:00Z",
    updated_at: "2026-10-09T00:00:00Z",
    user: bot,
    author_association: "NONE",
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("REST cloud bot status-comment edits on a READY PR", () => {
  it("re-surfaces the edit as TRIAGE and restarts the ready delay", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-09T09:00:00Z"));
    await freshLoadConfig();
    const live = { body: "Review in progress." };
    const routes = restIterateRoutes({ pending: false });
    await serve((request, response) => {
      const path = request.path.split("?")[0]!;
      if (path === `${prefix}/issues/101/comments`)
        response.end(JSON.stringify([botComment(live.body)]));
      else if (path === "/user") response.end('{"login":"me"}');
      else void routes(request, response);
    });
    const tick = () =>
      runWithGithubTransport("rest", () =>
        runIterate({
          prNumber: 101,
          targetRepository: repo,
          format: "json",
          readyDelaySeconds: 600,
          stallTimeoutSeconds: 0,
          noAutoMarkReady: true,
        }),
      );

    // First look surfaces the comment once; it cannot be minimized over REST.
    expect(await tick()).toMatchObject({ action: "triage" });
    expect(await tick()).toMatchObject({ status: "READY", remainingSeconds: 600 });
    vi.setSystemTime(new Date("2026-10-09T09:05:00Z"));
    expect(await tick()).toMatchObject({ status: "READY", remainingSeconds: 300 });

    live.body = "Rate limit exceeded; review paused.";
    const edited = await tick();
    expect(edited).toMatchObject({
      action: "triage",
      triage: {
        actionableComments: [
          { id: "IC_501", body: "Rate limit exceeded; review paused.", edited: true },
        ],
      },
    });

    // The unchanged next tick is READY again, but the 600s countdown starts over.
    expect(await tick()).toMatchObject({ status: "READY", remainingSeconds: 600 });
  });
});
