import { describe, expect, it } from "vitest";
import {
  json,
  registerAppAuthHooks,
  route,
} from "../../test-helpers/github/app-auth.test-support.mts";
import { summarizeApiTelemetry, withApiTelemetryScope } from "./api-telemetry.mts";
import { graphql, rest, restText } from "./http.mts";

registerAppAuthHooks();

const APP = "GitHub App 42 (installation 7)";
const PR = "GET /repos/acme/widgets/pulls/1";
const QUERY = "query($owner:String!,$repo:String!){repository{id}}";

const metered = (status: number, body: unknown, resource: string, remaining: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "x-ratelimit-limit": "5000",
      "x-ratelimit-remaining": String(remaining),
      "x-ratelimit-used": String(5000 - remaining),
      "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 600),
      "x-ratelimit-resource": resource,
    },
  });

/** 401 once (an intermediate response recorded by the retry path), then success. */
function unauthorizedOnce(resource: string, ok: unknown): () => Response {
  let first = true;
  return () => {
    if (!first) return metered(200, ok, resource, 4000);
    first = false;
    return metered(401, { message: "Bad credentials" }, resource, 4999);
  };
}

const run = (fn: () => Promise<unknown>) =>
  withApiTelemetryScope(async () => {
    await fn();
    return summarizeApiTelemetry();
  });

describe("GitHub App telemetry tagging", () => {
  it("tags the intermediate and final responses of a REST retry as the app", async () => {
    route({ [PR]: unauthorizedOnce("core", { ok: true }) });
    const usage = await run(() => rest("GET", "/repos/acme/widgets/pulls/1"));

    expect(usage).not.toHaveProperty("rest");
    expect(usage?.credentialSources).toEqual([]);
    expect(usage?.githubApps?.[0]?.source).toBe(APP);
    expect(usage?.githubApps?.[0]?.rest?.[0]).toMatchObject({ resource: "core", requestCount: 2 });
  });

  it("tags restText requests and their retries as the app", async () => {
    route({ [PR]: unauthorizedOnce("core", { ok: true }) });
    const usage = await run(() => restText("/repos/acme/widgets/pulls/1"));

    expect(usage).not.toHaveProperty("rest");
    expect(usage?.githubApps?.[0]?.rest?.[0]).toMatchObject({ resource: "core", requestCount: 2 });
  });

  it("tags GraphQL retries as the app", async () => {
    let first = true;
    route({
      "POST /graphql": () => {
        const status = first ? 401 : 200;
        const body = first ? { message: "Bad credentials" } : { data: { repository: { id: "r" } } };
        first = false;
        return metered(status, body, "graphql", 4000);
      },
    });
    const usage = await run(() => graphql(QUERY, { owner: "acme", repo: "widgets" }));

    expect(usage).not.toHaveProperty("graphql");
    expect(usage?.githubApps?.[0]?.graphql).toMatchObject({ resource: "graphql" });
  });

  it("records the exhausted app attempt as the app and the user retry as the user", async () => {
    let first = true;
    route({
      [PR]: () => {
        if (!first) return metered(200, { ok: true }, "core", 3000);
        first = false;
        return metered(403, { message: "API rate limit exceeded" }, "core", 0);
      },
    });
    const usage = await run(() => rest("GET", "/repos/acme/widgets/pulls/1"));

    expect(usage?.credentialSources).toEqual(["GH_TOKEN"]);
    expect(usage?.rest?.[0]).toMatchObject({ requestCount: 1, remaining: 3000 });
    expect(usage?.githubApps?.[0]?.rest?.[0]).toMatchObject({ requestCount: 1, remaining: 0 });
  });

  it("keeps a plain success on the user chain untouched", async () => {
    route({ "GET /repos/other/repo/pulls/1": () => json(200, {}) });
    const usage = await run(() => rest("GET", "/repos/other/repo/pulls/1"));
    expect(usage).not.toHaveProperty("githubApps");
  });
});
