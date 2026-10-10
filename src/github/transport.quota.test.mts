import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { githubWire } from "../../test-helpers/github/transport-wire.mts";
import { graphql, rest, _resetTokenCache } from "./http.mts";
import { GitHubRequestError } from "./errors.mts";
import {
  createGithubTransportRunner,
  githubOperation,
  runWithGithubTransport,
} from "./transport.mts";

const rateLimited = {
  data: null,
  errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }],
};
let wire: Awaited<ReturnType<typeof githubWire>>;
let quota: unknown = { resources: { graphql: { remaining: 0 } } };
let graphqlStatus = 200;
let graphqlPayload: unknown = rateLimited;
let graphqlHeaders: Record<string, string> = {};
let quotaStatus = 200;

const read = () =>
  githubOperation(
    "quota.read",
    async () => (await graphql<{ value: string }>("query { value }")).data.value,
    () => rest<string>("GET", "/rest"),
  );
const mutate = () =>
  githubOperation(
    "quota.write",
    async () => (await graphql<{ value: string }>("mutation { value }")).data.value,
    () => rest<string>("POST", "/rest"),
    { mutation: true },
  );

beforeAll(async () => {
  wire = await githubWire((request, response) => {
    if (request.path === "/graphql") {
      response.statusCode = graphqlStatus;
      for (const [name, value] of Object.entries(graphqlHeaders)) response.setHeader(name, value);
      response.end(JSON.stringify(graphqlPayload));
    } else if (request.path === "/rate_limit") {
      response.statusCode = quotaStatus;
      response.end(JSON.stringify(quota));
    } else response.end(JSON.stringify("rest"));
  });
});
afterAll(async () => wire.close());
beforeEach(() => {
  for (const name of [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "http_proxy",
    "https_proxy",
    "NO_PROXY",
    "no_proxy",
  ])
    vi.stubEnv(name, "");
  vi.stubEnv("GH_TOKEN", "quota-test-token");
  vi.stubEnv("PR_SHEPHERD_LOG_DISABLED", "1");
  vi.stubGlobal("fetch", wire.fetch);
  _resetTokenCache();
  wire.requests.length = 0;
  quota = { resources: { graphql: { remaining: 0 } } };
  graphqlStatus = 200;
  graphqlPayload = rateLimited;
  graphqlHeaders = {};
  quotaStatus = 200;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  _resetTokenCache();
});

describe("GraphQL primary-quota fallback proof", () => {
  it("probes REST quota for a headerless 200 RATE_LIMITED response and latches after proof", async () => {
    const client = createGithubTransportRunner("auto");
    await expect(client(read)).resolves.toBe("rest");
    await expect(client(read)).resolves.toBe("rest");
    expect(wire.requests.map((request) => request.path)).toEqual([
      "/graphql",
      "/rate_limit",
      "/rest",
      "/rest",
    ]);
  });

  it.each([
    ["healthy quota", { resources: { graphql: { remaining: 10 } } }, 200],
    ["malformed quota", { resources: { graphql: { remaining: "0" } } }, 200],
    ["unavailable probe", {}, 503],
  ] as const)(
    "preserves the GraphQL refusal when the probe has no proof: %s",
    async (_name, value, status) => {
      quota = value;
      quotaStatus = status;
      await expect(runWithGithubTransport("auto", read)).rejects.toBeInstanceOf(GitHubRequestError);
      expect(wire.requests.map((request) => request.path)).toEqual(["/graphql", "/rate_limit"]);
    },
  );

  it("safely retries a quota-refused mutation after REST proves GraphQL exhaustion", async () => {
    graphqlStatus = 403;
    graphqlPayload = { message: "API rate limit exceeded" };
    const client = createGithubTransportRunner("auto");
    await expect(client(mutate)).resolves.toBe("rest");
    await expect(client(read)).resolves.toBe("rest");
    expect(wire.requests.map(({ method, path }) => [method, path])).toEqual([
      ["POST", "/graphql"],
      ["GET", "/rate_limit"],
      ["POST", "/rest"],
      ["GET", "/rest"],
    ]);
  });

  it("does not probe when GraphQL headers already prove exhaustion", async () => {
    graphqlStatus = 403;
    graphqlPayload = { message: "API rate limit exceeded" };
    graphqlHeaders = {
      "x-ratelimit-remaining": "0",
      "x-ratelimit-limit": "5000",
      "x-ratelimit-reset": "2000000000",
      "x-ratelimit-resource": "graphql",
    };
    await expect(runWithGithubTransport("auto", read)).resolves.toBe("rest");
    expect(wire.requests.map((request) => request.path)).toEqual(["/graphql", "/rest"]);
  });

  it.each([
    {
      name: "forced GraphQL",
      mode: "graphql" as const,
      status: 200,
      headers: {} as Record<string, string>,
    },
    {
      name: "secondary throttle",
      mode: "auto" as const,
      status: 403,
      headers: { "retry-after": "3" },
    },
  ])("does not probe or fall back for $name", async (fixture) => {
    graphqlStatus = fixture.status;
    graphqlPayload =
      fixture.name === "secondary throttle"
        ? { message: "You have exceeded a secondary rate limit" }
        : rateLimited;
    graphqlHeaders = fixture.headers;
    await expect(runWithGithubTransport(fixture.mode, read)).rejects.toBeInstanceOf(
      GitHubRequestError,
    );
    expect(wire.requests.map((request) => request.path)).toEqual(["/graphql"]);
  });

  it.each([false, true])(
    "does not probe, fall back, or latch on mixed quota/application errors with measured exhaustion=%s",
    async (measured) => {
      graphqlPayload = {
        data: null,
        errors: [
          { type: "RATE_LIMITED", message: "API rate limit exceeded" },
          { type: "UNPROCESSABLE", message: "Input could not be processed" },
        ],
      };
      if (measured) {
        graphqlHeaders = {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-limit": "5000",
          "x-ratelimit-reset": "2000000000",
          "x-ratelimit-resource": "graphql",
        };
      }
      const client = createGithubTransportRunner("auto");
      await expect(client(read)).rejects.toBeInstanceOf(GitHubRequestError);
      expect(wire.requests.map((request) => request.path)).toEqual(["/graphql"]);
      graphqlStatus = 200;
      graphqlPayload = { data: { value: "graphql" } };
      await expect(client(read)).resolves.toBe("graphql");
      expect(wire.requests.map((request) => request.path)).toEqual(["/graphql", "/graphql"]);
    },
  );
});
