import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CCR_GRAPHQL_REFUSAL_BODY } from "../../test-helpers/github/ccr-graphql-refusal.fixture.mts";
import { githubWire } from "../../test-helpers/github/transport-wire.mts";
import { formatCliError } from "../cli/error-format.mts";
import { EXIT, errorToExitCode } from "../exit-codes.mts";
import { graphql, rest, _resetTokenCache } from "./http.mts";
import { isCcrGraphqlRefusal } from "./graphql-session-refusal.mts";
import { getGithubTransport, githubOperation, runWithGithubTransport } from "./transport.mts";

let wire: Awaited<ReturnType<typeof githubWire>>;

beforeAll(async () => {
  wire = await githubWire((request, response) => {
    if (request.path === "/graphql") {
      response.statusCode = 403;
      response.end(CCR_GRAPHQL_REFUSAL_BODY);
      return;
    }
    response.end(JSON.stringify("rest"));
  });
});
afterAll(async () => wire.close());
beforeEach(() => {
  vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
  vi.stubEnv("GH_TOKEN", "test-token");
  vi.stubEnv("PR_SHEPHERD_LOG_DISABLED", "1");
  vi.stubGlobal("fetch", wire.fetch);
  _resetTokenCache();
  wire.requests.length = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  _resetTokenCache();
});

const read = () =>
  githubOperation(
    "test.read",
    async () => (await graphql<{ value: string }>("query { value }")).data.value,
    () => rest<string>("GET", "/rest"),
  );

describe("the Claude Code proxy's GraphQL refusal", () => {
  it("names the REST transports and exits 77 when GraphQL is forced", async () => {
    expect(CCR_GRAPHQL_REFUSAL_BODY.length).toBeGreaterThan(200);
    const error = await runWithGithubTransport("graphql", read).catch((caught: unknown) => caught);
    expect(errorToExitCode(error)).toBe(EXIT.NOPERM);
    expect(formatCliError(error)).toBe(
      "GitHub GraphQL is not available from Claude Code sessions (HTTP 403 from the Claude Code proxy). " +
        "Rerun with `--transport rest` or `--transport auto` (the default), or set `github.transport` " +
        "to `rest` or `auto`. (credential GH_TOKEN)",
    );
    expect(error).toMatchObject({ status: 403, responseMessage: CCR_GRAPHQL_REFUSAL_BODY });
    expect(wire.requests.map((request) => request.path)).toEqual(["/graphql"]);
  });

  it("names the REST transports for a direct GraphQL call outside a named operation", async () => {
    await expect(graphql("query { value }")).rejects.toThrow("`--transport rest`");
  });

  it("still falls back to REST under auto when the session was not detected", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "");
    await expect(
      runWithGithubTransport("auto", async () => {
        expect(getGithubTransport()).toBe("graphql");
        return read();
      }),
    ).resolves.toBe("rest");
    expect(wire.requests.map((request) => request.path)).toEqual(["/graphql", "/rest"]);
  });

  it("recognizes only the proxy's 403", () => {
    expect(isCcrGraphqlRefusal(403, CCR_GRAPHQL_REFUSAL_BODY)).toBe(true);
    expect(isCcrGraphqlRefusal(401, CCR_GRAPHQL_REFUSAL_BODY)).toBe(false);
    expect(isCcrGraphqlRefusal(403, '{"message":"Resource not accessible"}')).toBe(false);
  });
});
