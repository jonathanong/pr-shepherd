/* eslint-disable max-lines */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { githubWire } from "../../test-helpers/github/transport-wire.mts";
import { graphql, rest, _resetTokenCache } from "./http.mts";
import { GitHubRequestError } from "./errors.mts";
import {
  createGithubTransportRunner,
  getGithubTransport,
  githubOperation,
  isCcrTransport,
  runWithGithubTransport,
} from "./transport.mts";

const blocked = "GitHub GraphQL is not available from Claude Code sessions. Use the REST API.";
let status = 200;
let payload: unknown = { data: { value: "graphql" } };
let headers: Record<string, string> = {};
let failGraphqlSocket = false;
let wire: Awaited<ReturnType<typeof githubWire>>;
const read = () =>
  githubOperation(
    "test.read",
    async () => (await graphql<{ value: string }>("query { value }")).data.value,
    () => rest<string>("GET", "/rest"),
  );
const mutate = () =>
  githubOperation(
    "test.write",
    async () => (await graphql<{ value: string }>("mutation { value }")).data.value,
    () => rest<string>("POST", "/rest"),
    { mutation: true },
  );

beforeAll(async () => {
  wire = await githubWire((request, response) => {
    if (request.path === "/graphql" && failGraphqlSocket) {
      response.destroy();
      return;
    }
    response.statusCode = request.path === "/graphql" ? status : 200;
    for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
    response.end(JSON.stringify(request.path === "/graphql" ? payload : "rest"));
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
    "CLAUDE_CODE_REMOTE",
  ])
    vi.stubEnv(name, "");
  vi.stubEnv("GH_TOKEN", "test-token");
  vi.stubEnv("PR_SHEPHERD_LOG_DISABLED", "1");
  vi.stubGlobal("fetch", wire.fetch);
  _resetTokenCache();
  wire.requests.length = 0;
  status = 200;
  payload = { data: { value: "graphql" } };
  headers = {};
  failGraphqlSocket = false;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  _resetTokenCache();
});

describe("named GitHub transport operations through HTTP", () => {
  it("prefers GraphQL locally and REST in the exact cloud environment", async () => {
    await expect(runWithGithubTransport("auto", read)).resolves.toBe("graphql");
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await expect(runWithGithubTransport("auto", read)).resolves.toBe("rest");
    await expect(runWithGithubTransport("graphql", read)).resolves.toBe("graphql");
    vi.stubEnv("CLAUDE_CODE_REMOTE", "1");
    await expect(runWithGithubTransport("auto", read)).resolves.toBe("graphql");
  });

  it("latches only the client's fallback and retains per-call overrides", async () => {
    status = 403;
    payload = { message: blocked };
    const client = createGithubTransportRunner("auto");
    await expect(client(read)).resolves.toBe("rest");
    expect(wire.requests.map((request) => request.path)).toEqual(["/graphql", "/rest"]);
    expect(await client(async () => isCcrTransport())).toBe(true);
    status = 200;
    payload = { data: { value: "graphql" } };
    await expect(client(read)).resolves.toBe("rest");
    await expect(client(read, "graphql")).resolves.toBe("graphql");
    await expect(createGithubTransportRunner("auto")(read)).resolves.toBe("graphql");
    expect(await createGithubTransportRunner("rest")(async () => isCcrTransport())).toBe(false);
  });

  it("preserves raw cloud refusal text and forced GraphQL never falls back", async () => {
    status = 403;
    payload = { message: blocked, suffix: "raw context" };
    await expect(runWithGithubTransport("graphql", read)).rejects.toMatchObject({
      status: 403,
      responseMessage: JSON.stringify(payload),
    });
    expect(wire.requests.every((request) => request.path === "/graphql")).toBe(true);
  });

  it("falls back after exhausted GraphQL primary quota without marking cloud", async () => {
    status = 403;
    payload = { message: "API rate limit exceeded" };
    headers = {
      "x-ratelimit-remaining": "0",
      "x-ratelimit-limit": "5000",
      "x-ratelimit-reset": "2000000000",
      "x-ratelimit-resource": "graphql",
    };
    const runner = createGithubTransportRunner("auto");
    await expect(runner(read)).resolves.toBe("rest");
    expect(await runner(async () => isCcrTransport())).toBe(false);
  });

  it.each([
    {
      name: "invalid credentials",
      status: 401,
      payload: { message: "Bad credentials" },
      headers: {},
    },
    {
      name: "ordinary forbidden",
      status: 403,
      payload: { message: "Resource not accessible by integration" },
      headers: {},
    },
    {
      name: "secondary rate limit",
      status: 403,
      payload: { message: "secondary rate limit" },
      headers: { "retry-after": "2" },
    },
    {
      name: "query validation",
      status: 200,
      payload: {
        data: null,
        errors: [{ message: "Unknown field", type: "GRAPHQL_VALIDATION_FAILED" }],
      },
      headers: {},
    },
    {
      name: "resource limit",
      status: 200,
      payload: {
        data: null,
        errors: [
          { message: "Resource limits for this query exceeded", type: "RESOURCE_LIMITS_EXCEEDED" },
        ],
      },
      headers: {},
    },
  ])("does not fall back for $name", async (fixture) => {
    status = fixture.status;
    payload = fixture.payload;
    headers = fixture.headers as Record<string, string>;
    await expect(runWithGithubTransport("auto", read)).rejects.toBeInstanceOf(GitHubRequestError);
    expect(wire.requests.every((request) => request.path === "/graphql")).toBe(true);
  });

  it.each([
    { name: "server 503", status: 503, payload: { message: "unavailable" } },
    {
      name: "GraphQL INTERNAL",
      status: 200,
      payload: { data: null, errors: [{ message: "engine failure", type: "INTERNAL" }] },
    },
  ])("falls back after bounded read retries for $name", async (fixture) => {
    status = fixture.status;
    payload = fixture.payload;
    await expect(runWithGithubTransport("auto", read)).resolves.toBe("rest");
    expect(wire.requests.filter((request) => request.path === "/graphql")).toHaveLength(3);
    expect(wire.requests.at(-1)?.path).toBe("/rest");
  });

  it("retries a socket-failed read, then falls back without replaying mutations", async () => {
    failGraphqlSocket = true;
    await expect(runWithGithubTransport("auto", read)).resolves.toBe("rest");
    expect(wire.requests.filter((request) => request.path === "/graphql")).toHaveLength(3);
    wire.requests.length = 0;
    await expect(runWithGithubTransport("auto", mutate)).rejects.toThrow();
    expect(wire.requests.map((request) => request.path)).toEqual(["/graphql"]);
  });

  it("does not replay a server-failed mutation merely because its final query spent the quota", async () => {
    status = 503;
    payload = { message: "outcome unknown" };
    headers = {
      "x-ratelimit-remaining": "0",
      "x-ratelimit-limit": "5000",
      "x-ratelimit-reset": "2000000000",
      "x-ratelimit-resource": "graphql",
    };
    await expect(runWithGithubTransport("auto", mutate)).rejects.toMatchObject({ status: 503 });
    expect(wire.requests.map((request) => request.path)).toEqual(["/graphql"]);
  });

  it("retains mixed permission errors and inherits nested command fallback state", async () => {
    payload = {
      data: null,
      errors: [
        { type: "INTERNAL", message: "engine failed" },
        { type: "FORBIDDEN", message: "Resource not accessible" },
      ],
    };
    await expect(runWithGithubTransport("auto", mutate)).rejects.toBeInstanceOf(GitHubRequestError);
    expect(wire.requests.map((request) => request.path)).toEqual(["/graphql"]);
    status = 403;
    payload = { message: blocked };
    const runner = createGithubTransportRunner("auto");
    await expect(runner(() => runWithGithubTransport(undefined, read))).resolves.toBe("rest");
    expect(
      await runner(() => runWithGithubTransport("auto", async () => getGithubTransport())),
    ).toBe("rest");
  });

  it("never retries or replays ambiguous mutations, while latching later reads", async () => {
    status = 503;
    payload = { message: "reply may have been written" };
    const runner = createGithubTransportRunner("auto");
    await expect(runner(mutate)).rejects.toMatchObject({ status: 503 });
    expect(wire.requests.map((request) => request.path)).toEqual(["/graphql"]);
    await expect(runner(read)).resolves.toBe("rest");
  });

  it("replays explicit cloud mutation refusal safely", async () => {
    status = 403;
    payload = { message: blocked };
    await expect(runWithGithubTransport("auto", mutate)).resolves.toBe("rest");
    expect(wire.requests.map((request) => request.method)).toEqual(["POST", "POST"]);
  });

  it("keeps concurrent async client selections isolated", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const left = createGithubTransportRunner("graphql")(async () => {
      await gate;
      return [getGithubTransport(), await read()];
    });
    const right = createGithubTransportRunner("rest")(async () => {
      release();
      return [getGithubTransport(), await read()];
    });
    await expect(Promise.all([left, right])).resolves.toEqual([
      ["graphql", "graphql"],
      ["rest", "rest"],
    ]);
  });
});
