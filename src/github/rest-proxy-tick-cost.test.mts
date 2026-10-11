import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { serve, repo, pull, prefix } from "../../test-helpers/github/rest-read.test-support.mts";
import { restIterateRoutes } from "../../test-helpers/github/rest-iterate-routes.test-support.mts";
import { freshLoadConfig } from "../../test-helpers/config/load-test-support.mts";
import { runIterate } from "../commands/iterate/index.mts";
import { runWithGithubTransport } from "./transport.mts";
import { summarizeApiTelemetry, withApiTelemetryScope } from "./api-telemetry.mts";

/**
 * Claude Code cloud ticks measured at the HTTP boundary, modelled on live run #566. The fake
 * proxy answers conditional reads with ETags that depend on the real token behind the proxy
 * (GitHub sends `Vary: Authorization`); the placeholder `GH_TOKEN` Shepherd sees never changes.
 */
interface Live {
  realToken: string;
  baseSha: string;
  pushedAt: string;
  /** Pull bodies served in order; the last one repeats. */
  pulls: Array<Record<string, unknown>>;
}

const log: Array<{ status: number; path: string }> = [];
const coreHeaders = {
  "x-ratelimit-resource": "core",
  "x-ratelimit-limit": "15000",
  "x-ratelimit-remaining": "14000",
  "x-ratelimit-used": "1000",
  "x-ratelimit-reset": "9999999999",
};
const threads = `${prefix}/pulls/101/ccr/review_threads`;

async function serveProxy(live: Live) {
  const routes = restIterateRoutes({ pending: false });
  await serve((request, response) => {
    const path = request.path.split("?")[0]!;
    const end = response.end.bind(response) as (body?: string) => void;
    (response as unknown as { end: (body?: string) => void }).end = (body?: string) => {
      // Like the live proxy, every route but the CCR thread read reports the core window.
      if (path !== threads)
        for (const [name, value] of Object.entries(coreHeaders)) response.setHeader(name, value);
      if (response.statusCode === 200 && request.method === "GET" && path !== threads) {
        const etag = `"${createHash("sha256")
          .update(`${live.realToken}\0${String(body)}`)
          .digest("hex")
          .slice(0, 16)}"`;
        response.setHeader("etag", etag);
        response.setHeader("vary", "Accept, Authorization, Cookie, X-GitHub-OTP");
        if (request.headers?.["if-none-match"] === etag) {
          response.statusCode = 304;
          log.push({ status: 304, path });
          return end();
        }
      }
      log.push({ status: response.statusCode, path });
      return end(body);
    };
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
      const body = live.pulls.length > 1 ? live.pulls.shift()! : live.pulls[0]!;
      response.end(JSON.stringify({ ...pull, base: { ref: "main", sha: live.baseSha }, ...body }));
    } else if (path === prefix) {
      response.end(
        JSON.stringify({
          allow_merge_commit: true,
          allow_squash_merge: true,
          allow_rebase_merge: true,
          pushed_at: live.pushedAt,
        }),
      );
    } else if (path === "/user") response.end('{"login":"me"}');
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

/** Metered: every non-304 except the proxy's headerless thread read. */
const metered = () =>
  log.filter((entry) => entry.status !== 304 && entry.path !== threads).map((entry) => entry.path);
const unmetered = () => log.filter((entry) => entry.path === threads);

describe("REST cloud proxy tick cost", () => {
  it("charges the full snapshot once after the proxy's real token rotates", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await freshLoadConfig();
    const live: Live = {
      realToken: "token-a",
      baseSha: "bbb222",
      pushedAt: "2026-10-09T00:00:00Z",
      pulls: [{}],
    };
    await serveProxy(live);
    expect(await tick()).toMatchObject({ status: "READY" });
    log.length = 0;
    expect(await tick()).toMatchObject({ status: "READY" });
    expect(metered()).toEqual([]);

    // Nothing on the PR changed, but every stored validator was minted for token A.
    live.realToken = "token-b";
    log.length = 0;
    expect(await tick()).toMatchObject({ status: "READY" });
    // The full snapshot: only the closing pull re-read and the READY mergeability read are 304s,
    // because the first pull read just stored the token-B ETag.
    expect(metered()).toHaveLength(13);
    expect(log.filter((entry) => entry.status === 304)).toHaveLength(2);
    expect(unmetered()).toHaveLength(1);

    log.length = 0;
    expect(await tick()).toMatchObject({ status: "READY" });
    expect(metered()).toEqual([]);
  });

  it("re-reads the snapshot when the pull recomputes mergeability after a base push", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await freshLoadConfig();
    const live: Live = {
      realToken: "token-a",
      baseSha: "bbb222",
      pushedAt: "2026-10-09T00:00:00Z",
      pulls: [{}],
    };
    await serveProxy(live);
    expect(await tick()).toMatchObject({ status: "READY" });

    // A push to main: the branch, the repository's pushed_at and the pull's base.sha all change,
    // and the pull is re-read mid-recompute, so its closing read carries a new revision.
    live.baseSha = "ccc333";
    live.pushedAt = "2026-10-09T01:00:00Z";
    live.pulls = [
      { updated_at: "2026-10-09T01:00:00Z" },
      { updated_at: "2026-10-09T01:00:01Z", mergeable: null, mergeable_state: "unknown" },
      { updated_at: "2026-10-09T01:00:02Z" },
    ];
    log.length = 0;
    const usage = await withApiTelemetryScope(async () => {
      expect(await tick()).toMatchObject({ status: "READY" });
      return summarizeApiTelemetry();
    });
    // The reported telemetry agrees with the wire log, not just the fake server's classification.
    expect(usage.rest?.find(({ resource }) => resource === "core")).toMatchObject({
      requestCount: 5,
    });
    expect(usage.unmeteredRestRequestCount).toBe(2);
    expect(metered()).toEqual([
      `${prefix}/pulls/101`,
      `${prefix}/branches/main`,
      prefix,
      `${prefix}/pulls/101`,
      `${prefix}/pulls/101`,
    ]);
    expect(unmetered()).toHaveLength(2);
    expect(log).toHaveLength(31);
  });
});
