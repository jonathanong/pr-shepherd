import { describe, expect, it } from "vitest";
import {
  serve,
  repo,
  serveWithEtags,
  etagResponses as log,
} from "../../test-helpers/github/rest-read.test-support.mts";
import { restIterateRoutes } from "../../test-helpers/github/rest-iterate-routes.test-support.mts";
import { serveSummaryStack } from "../../test-helpers/github/rest-stack-summary.test-support.mts";
import { freshLoadConfig } from "../../test-helpers/config/load-test-support.mts";
import { runIterate } from "../commands/iterate/index.mts";
import { fetchPollSummary } from "./poll-summary.mts";
import { runWithGithubTransport } from "./transport.mts";

/**
 * Charged-request budget of REST wait ticks, measured at the HTTP boundary. The fake answers
 * like GitHub's conditional reads, so a request is charged exactly when it is not a 304.
 */
async function serveOnePr(state: { baseSha: string; baseStatus: number }) {
  serveWithEtags();
  const routes = restIterateRoutes({ pending: true });
  await serve((request, response) => {
    const path = request.path.split("?")[0]!;
    if (path === "/repos/octocat/hello-world/branches/main") {
      response.statusCode = state.baseStatus;
      response.end(
        state.baseStatus === 200
          ? JSON.stringify({
              name: "main",
              commit: { sha: state.baseSha },
              protected: false,
              protection: { enabled: false },
            })
          : '{"message":"Not Found"}',
      );
    } else if (path === "/user") response.end('{"login":"me"}');
    else void routes(request, response);
  });
}

const tick = (fingerprintCache: boolean) =>
  runWithGithubTransport("rest", () =>
    runIterate({
      prNumber: 101,
      targetRepository: repo,
      format: "json",
      readyDelaySeconds: 0,
      stallTimeoutSeconds: 0,
      noAutoMarkReady: true,
      fingerprintCache,
    }),
  );

const charged = () => log.filter((entry) => entry.status !== 304);
const notModified = () => log.filter((entry) => entry.status === 304);

describe("REST wait tick cost", () => {
  it("charges the cold snapshot once and nothing on unchanged wait ticks", async () => {
    await freshLoadConfig();
    await serveOnePr({ baseSha: "bbb222", baseStatus: 200 });
    const first = await tick(false);
    expect(first.action).toBe("wait");
    // pull, review comments, issue comments, reviews, check-runs, check-suites, statuses,
    // actions runs, base summary, rules, stacks, repository, viewer. The pull re-read is a 304.
    expect(charged()).toHaveLength(13);
    expect(notModified()).toHaveLength(1);
    expect(log.some((entry) => entry.path.endsWith("/protection"))).toBe(false);
    for (let i = 0; i < 2; i++) {
      log.length = 0;
      const next = await tick(true);
      expect(next).toMatchObject({ action: "wait", fingerprintReused: true });
      expect(notModified()).toHaveLength(14);
      expect(charged()).toEqual([]);
    }
  });

  it("does not replay the report when only the base branch moved", async () => {
    await freshLoadConfig();
    const state = { baseSha: "bbb222", baseStatus: 200 };
    await serveOnePr(state);
    await tick(false);
    state.baseSha = "ccc333";
    log.length = 0;
    const next = await tick(true);
    expect(next.action).toBe("wait");
    expect(next).not.toHaveProperty("fingerprintReused");
    expect(charged().map((entry) => entry.path)).toEqual([
      "/repos/octocat/hello-world/branches/main",
    ]);
  });

  it("does not replay the report when the base branch summary is unavailable", async () => {
    await freshLoadConfig();
    await serveOnePr({ baseSha: "bbb222", baseStatus: 404 });
    await tick(false);
    log.length = 0;
    const next = await tick(true);
    expect(next).not.toHaveProperty("fingerprintReused");
    expect(charged().map((entry) => entry.path.split("?")[0])).toEqual(
      expect.arrayContaining([
        "/repos/octocat/hello-world/branches/main",
        "/repos/octocat/hello-world/branches/main/protection",
      ]),
    );
  });

  it("charges nothing on an unchanged 10-layer stack summary tick", async () => {
    await freshLoadConfig();
    serveWithEtags();
    const fixture = await serveSummaryStack();
    const read = () =>
      runWithGithubTransport("rest", () => fetchPollSummary({ stackPrNumber: 101 }, repo));
    expect((await read()).prs).toHaveLength(10);
    // 126 reads without validators. Repeat reads inside the tick (each layer's pull three times,
    // stack membership twice) are already 304 after the first.
    expect(charged()).toHaveLength(104);
    log.length = 0;
    expect((await read()).prs).toHaveLength(10);
    expect(charged()).toEqual([]);
    // A changed resource still answers 200 and is the only charged read.
    fixture.settings.allow_merge_commit = false;
    log.length = 0;
    expect((await read()).allowedMergeMethods).not.toContain("merge");
    expect(charged().map((entry) => entry.path)).toEqual(["/repos/octocat/hello-world"]);
  });
});
