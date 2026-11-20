import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeIterateResult } from "../../../fixtures/cli-parser.iterate-fixtures.mts";
import type { ApiUsage } from "../../types.mts";

const { mockSummarizeApiTelemetry } = vi.hoisted(() => ({ mockSummarizeApiTelemetry: vi.fn() }));

vi.mock("../../config/load.mts", () => ({ loadConfig: () => ({ quotaWarningBands: [] }) }));
vi.mock("../../github/api-telemetry.mts", () => ({
  summarizeApiTelemetry: mockSummarizeApiTelemetry,
  withGraphqlCredentialFingerprint: <T,>(sample: T) => sample,
  withRestCoreCredentialFingerprint: <T,>(sample: T) => sample,
}));

import { attachApiUsage } from "./api-usage.mts";

const graphql = {
  resource: "graphql",
  requestCount: 1,
  limit: 5000,
  used: 100,
  remaining: 4900,
  resetAt: 1_788_066_749,
  measuredQueryCost: 1,
  unmeasuredRequestCount: 0,
  nodeCount: 1,
};
const live: ApiUsage = { credentialSources: ["GH_TOKEN"], graphql };

describe("stale gh cache on merge ticks", () => {
  let cacheRoot: string;
  let previousXdg: string | undefined;

  beforeEach(() => {
    cacheRoot = mkdtempSync(join(tmpdir(), "gh-cache-merge-"));
    previousXdg = process.env["XDG_CACHE_HOME"];
    process.env["XDG_CACHE_HOME"] = cacheRoot;
    mkdirSync(join(cacheRoot, "gh", "aa", "bb"), { recursive: true });
    writeFileSync(join(cacheRoot, "gh", "aa", "bb", "cc"), '{"errors":[{"type":"RATE_LIMIT"}]}');
  });
  afterEach(() => {
    if (previousXdg === undefined) delete process.env["XDG_CACHE_HOME"];
    else process.env["XDG_CACHE_HOME"] = previousXdg;
    rmSync(cacheRoot, { recursive: true, force: true });
  });

  async function run(usage: ApiUsage, mode: "auto" | "rest" = "auto") {
    mockSummarizeApiTelemetry.mockReturnValue(usage);
    const base = makeIterateResult("merge");
    if (base.action !== "merge") throw new Error("expected merge");
    return attachApiUsage({ ...base, merge: { ...base.merge, mode } }, false);
  }

  it("reports the stale entry when live GraphQL quota remains", async () => {
    const result = await run(live);
    if (result.action !== "merge") throw new Error("expected merge");
    expect(result.merge.ghCacheStaleRateLimit?.paths).toEqual([
      join(cacheRoot, "gh", "aa", "bb", "cc"),
    ]);
  });

  it("stays silent when live quota is exhausted, absent (REST), or the plan is REST", async () => {
    const exhausted = { ...live, graphql: { ...graphql, remaining: 0 } };
    for (const result of [
      await run(exhausted),
      await run({ credentialSources: [] }),
      await run(live, "rest"),
    ]) {
      expect(JSON.stringify(result)).not.toContain("ghCacheStaleRateLimit");
    }
  });

  it("stays silent when the cache is clean", async () => {
    process.env["XDG_CACHE_HOME"] = join(cacheRoot, "missing");
    expect(JSON.stringify(await run(live))).not.toContain("ghCacheStaleRateLimit");
  });
});
