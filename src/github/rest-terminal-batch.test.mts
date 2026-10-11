import { describe, expect, it } from "vitest";
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
import { runCheck } from "../commands/check.mts";
import { fetchRestPrBatch } from "./rest-batch-read.mts";
import { runWithGithubTransport } from "./transport.mts";

const merged = {
  ...pull,
  state: "closed",
  merged_at: "2026-01-01T00:00:00Z",
  mergeable: null,
  mergeable_state: "unknown",
};

async function servePull(body: object) {
  await freshLoadConfig();
  serveWithEtags();
  const routes = restIterateRoutes();
  await serve((request, response) => {
    if (request.path.split("?")[0] === `${prefix}/pulls/101`) response.end(JSON.stringify(body));
    else void routes(request, response);
  });
}

const pulls = () => log.filter((entry) => entry.path === `${prefix}/pulls/101`);

describe("REST merged short-circuit", () => {
  it("answers a merged PR from the first pull read", async () => {
    await servePull(merged);
    const result = await runWithGithubTransport("rest", () =>
      runIterate({
        prNumber: 101,
        targetRepository: repo,
        format: "json",
        readyDelaySeconds: 0,
        stallTimeoutSeconds: 0,
        noAutoMarkReady: true,
      }),
    );
    expect(result).toMatchObject({ action: "cancel", reason: "merged" });
    expect(log.map((entry) => entry.path)).toEqual([`${prefix}/pulls/101`]);
  });

  it("reports no merge requirements derived from the unread reviews, threads and rules", async () => {
    await servePull(merged);
    const report = await runWithGithubTransport("rest", () =>
      runCheck({ prNumber: 101, targetRepository: repo, format: "json" }),
    );
    expect(report.status).toBe("MERGED");
    expect(report.mergeStatus).not.toHaveProperty("mergeRequirements");
    expect(report.transportUnavailable).toContainEqual({
      field: "mergeRequirements",
      reason: "not read for a merged pull request",
    });
  });

  it("short-circuits even when the tick wants a ready receipt summary", async () => {
    await servePull(merged);
    const batch = await runWithGithubTransport("rest", () =>
      fetchRestPrBatch(101, repo, { terminalShortCircuit: true, includeReceiptSummary: true }),
    );
    expect(batch.data.state).toBe("MERGED");
    expect(log).toHaveLength(1);
  });

  it("keeps the full snapshot and its closing re-read for a closed, unmerged PR", async () => {
    // A closed PR can be reopened mid-snapshot; the closing pull re-read catches that.
    await servePull({ ...pull, state: "closed" });
    const batch = await runWithGithubTransport("rest", () =>
      fetchRestPrBatch(101, repo, { terminalShortCircuit: true }),
    );
    expect(batch.data.state).toBe("CLOSED");
    expect(pulls()).toHaveLength(2);
    expect(log.length).toBeGreaterThan(2);
  });
});
