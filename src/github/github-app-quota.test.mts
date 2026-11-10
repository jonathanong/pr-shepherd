import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiCalls,
  json,
  registerAppAuthHooks,
  route,
} from "../../test-helpers/github/app-auth.test-support.mts";
import { formatApiUsage } from "../cli/api-usage-formatter.mts";
import { summarizeApiTelemetry, withApiTelemetryScope } from "./api-telemetry.mts";
import { graphql, rest } from "./http.mts";

const { appendEntry } = vi.hoisted(() => ({ appendEntry: vi.fn() }));
vi.mock("../log/log-file.mts", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  appendEntry,
}));

registerAppAuthHooks();

afterEach(() => {
  vi.useRealTimers();
  appendEntry.mockClear();
});

const RESET = () => String(Math.floor(Date.now() / 1000) + 600);
const spent = (status: number, resource: string, message = "API rate limit exceeded") =>
  new Response(JSON.stringify({ message }), {
    status,
    headers: {
      "content-type": "application/json",
      "x-ratelimit-limit": "5000",
      "x-ratelimit-remaining": "0",
      "x-ratelimit-used": "5000",
      "x-ratelimit-reset": RESET(),
      "x-ratelimit-resource": resource,
    },
  });
const tokens = () => apiCalls().map((call) => call.auth.replace("Bearer ", ""));
const READ = "GET /repos/acme/widgets/pulls/1";
const QUERY = "query($owner:String!,$repo:String!){repository{id}}";
const vars = { owner: "acme", repo: "widgets" };

function once(first: () => Response, ok: unknown = { ok: true }): () => Response {
  let used = false;
  return () => {
    if (used) return json(200, ok);
    used = true;
    return first();
  };
}

describe("app quota fallback", () => {
  it("retries a REST read with the user token and routes core there until reset", async () => {
    route({ [READ]: once(() => spent(403, "core")) });
    await rest("GET", "/repos/acme/widgets/pulls/1");
    await rest("GET", "/repos/acme/widgets/pulls/2");

    expect(tokens()).toEqual(["inst-token-1", "user-token", "user-token"]);
    const notes = appendEntry.mock.calls
      .map(([text]) => String(text))
      .filter((t) => t.includes("exhausted"));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("installation 7 exhausted its core");
  });

  it("falls back on a 429 with an empty bucket", async () => {
    route({ [READ]: once(() => spent(429, "core")) });
    await rest("GET", "/repos/acme/widgets/pulls/1");

    expect(tokens()).toEqual(["inst-token-1", "user-token"]);
  });

  it("handles GraphQL 403 exhaustion without diverting REST", async () => {
    route({ "POST /graphql": once(() => spent(403, "graphql"), { data: { ok: true } }) });
    await graphql(QUERY, vars);
    await graphql(QUERY, vars);
    await rest("GET", "/repos/acme/widgets/pulls/1");

    expect(tokens()).toEqual(["inst-token-1", "user-token", "user-token", "inst-token-1"]);
  });

  it("handles the 200 RATE_LIMITED form", async () => {
    route({
      "POST /graphql": once(
        () => json(200, { errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }] }),
        { data: { ok: true } },
      ),
    });
    await graphql(QUERY, vars);
    await graphql(QUERY, vars);

    expect(tokens()).toEqual(["inst-token-1", "user-token", "user-token"]);
  });

  it("returns to the app once GitHub's reset passes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    route({ [READ]: once(() => spent(403, "core")) });
    await rest("GET", "/repos/acme/widgets/pulls/1");
    vi.setSystemTime(Date.now() + 700_000);
    await rest("GET", "/repos/acme/widgets/pulls/2");

    expect(tokens()).toEqual(["inst-token-1", "user-token", "inst-token-1"]);
  });

  it("uses a short window when GitHub sends no usable reset", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    route({
      [READ]: once(
        () =>
          new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          }),
      ),
    });
    await rest("GET", "/repos/acme/widgets/pulls/1");
    await rest("GET", "/repos/acme/widgets/pulls/2");
    vi.setSystemTime(Date.now() + 61_000);
    await rest("GET", "/repos/acme/widgets/pulls/3");

    expect(tokens()).toEqual(["inst-token-1", "user-token", "user-token", "inst-token-1"]);
  });

  it("never falls back on a secondary limit", async () => {
    route({
      [READ]: once(() =>
        spent(403, "core", "You have exceeded a secondary rate limit. Please wait."),
      ),
    });
    await expect(rest("GET", "/repos/acme/widgets/pulls/1")).rejects.toThrow("secondary");
    await rest("GET", "/repos/acme/widgets/pulls/1");

    expect(tokens()).toEqual(["inst-token-1", "inst-token-1"]);
  });

  it("surfaces the error when the user token is exhausted too", async () => {
    route({ [READ]: () => spent(403, "core") });
    await expect(rest("GET", "/repos/acme/widgets/pulls/1")).rejects.toThrow("403");

    expect(tokens()).toEqual(["inst-token-1", "user-token"]);
  });

  it("does not retry errors that are not app credentials or not quota", async () => {
    route({
      [READ]: () => json(500, { message: "boom" }),
      "GET /repos/o/r/x": () => spent(403, "core"),
    });
    await expect(rest("GET", "/repos/acme/widgets/pulls/1")).rejects.toThrow("500");
    await expect(rest("GET", "/repos/o/r/x")).rejects.toThrow("403");
  });

  it("reports both credential sources in usage", async () => {
    route({ [READ]: once(() => spent(403, "core")) });
    const usage = await withApiTelemetryScope(async () => {
      await rest("GET", "/repos/acme/widgets/pulls/1");
      return summarizeApiTelemetry();
    });

    expect(usage?.credentialSources).toEqual(["GH_TOKEN"]);
    expect(usage?.githubApps?.map((app) => app.source)).toEqual(["GitHub App 42 (installation 7)"]);
    const text = formatApiUsage(usage);
    expect(text).toContain("- Credential source: `GH_TOKEN`");
    expect(text).toContain("- `GitHub App 42 (installation 7)`:");
  });
});
