import { describe, expect, it, vi } from "vitest";
import {
  serve,
  repo,
  pull,
  prefix,
  serveWithEtags,
  etagResponses as log,
} from "../../test-helpers/github/rest-read.test-support.mts";
import { restIterateRoutes } from "../../test-helpers/github/rest-iterate-routes.test-support.mts";
import { freshLoadConfig } from "../../test-helpers/config/load-test-support.mts";
import { runIterate } from "../commands/iterate/index.mts";
import { runWithGithubTransport } from "./transport.mts";

/**
 * Charged-request budget of changed and READY REST ticks after a warm tick, measured at the
 * HTTP boundary. The fake answers like GitHub's conditional reads: a request is charged exactly
 * when its body changed, so a tick pays only for the resources that moved.
 */
async function serveLivePr(live: { baseSha: string; mergeable: boolean; mergeableState: string }) {
  serveWithEtags();
  const routes = restIterateRoutes({ pending: false });
  await serve((request, response) => {
    const path = request.path.split("?")[0]!;
    if (path === `${prefix}/branches/main`) {
      response.end(
        JSON.stringify({
          name: "main",
          commit: { sha: live.baseSha },
          protected: false,
          protection: { enabled: false },
        }),
      );
    } else if (path === `${prefix}/pulls/101`) {
      response.end(
        JSON.stringify({
          ...pull,
          base: { ref: "main", sha: live.baseSha },
          mergeable: live.mergeable,
          mergeable_state: live.mergeableState,
        }),
      );
    } else if (path === `${prefix}/pulls`) response.end("[]");
    else if (path === "/user") response.end('{"login":"me"}');
    else void routes(request, response);
  });
}

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

const charged = () =>
  log.filter((entry) => entry.status !== 304).map((entry) => entry.path.split("?")[0]);

describe("REST changed tick cost", () => {
  it("charges the pull, the base branch and the merged-base lookup when a base push conflicts", async () => {
    await freshLoadConfig();
    const live = { baseSha: "bbb222", mergeable: true, mergeableState: "clean" };
    await serveLivePr(live);
    expect(await tick()).toMatchObject({ status: "READY" });
    Object.assign(live, { baseSha: "ccc333", mergeable: false, mergeableState: "dirty" });
    log.length = 0;
    const conflicted = await tick();
    expect(conflicted).toMatchObject({ action: "fix_code" });
    expect(conflicted).toMatchObject({ mergeStatus: "CONFLICTS" });
    // The snapshot's closing pull re-read is a 304: the settled dirty body was just stored. A
    // conflict also looks up whether the base branch was itself a merged PR's head.
    expect(charged()).toEqual([
      `${prefix}/pulls/101`,
      `${prefix}/branches/main`,
      `${prefix}/pulls`,
    ]);
  });

  it("charges nothing on a READY tick after an unchanged READY tick", async () => {
    await freshLoadConfig();
    await serveLivePr({ baseSha: "bbb222", mergeable: true, mergeableState: "clean" });
    expect(await tick()).toMatchObject({ status: "READY" });
    log.length = 0;
    // The ready-delay countdown's later tick: a READY report is rebuilt, never replayed, but
    // its reads and the mergeability refresh all answer 304.
    expect(await tick()).toMatchObject({ status: "READY" });
    expect(charged()).toEqual([]);
  });

  it("charges only the validator-less cloud thread read on an unchanged cloud READY tick", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await freshLoadConfig();
    await serveLivePr({ baseSha: "bbb222", mergeable: true, mergeableState: "clean" });
    serveWithEtags((path) => path.endsWith("/ccr/review_threads"));
    await tick();
    log.length = 0;
    expect(await tick()).toMatchObject({ status: "READY" });
    expect(charged()).toEqual([`${prefix}/pulls/101/ccr/review_threads`]);
  });
});
