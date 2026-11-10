import { verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  apiCalls,
  json,
  publicKey,
  registerAppAuthHooks,
  route,
  state,
} from "../../test-helpers/github/app-auth.test-support.mts";
import { summarizeApiTelemetry, withApiTelemetryScope } from "./api-telemetry.mts";
import { runWithAuthScope, setAuthTarget } from "./auth-target.mts";
import { _resetTokenCache, credentialFingerprint, makeAuthHeaders } from "./http-auth.mts";
import { graphql, rest, restText } from "./http.mts";
import { formatApiUsage } from "../cli/api-usage-formatter.mts";
import { rmSync } from "node:fs";
import { join } from "node:path";

registerAppAuthHooks();

describe("GitHub App credentials", () => {
  it("signs a verifiable RS256 JWT and mints an installation token", async () => {
    const before = Math.floor(Date.now() / 1000);
    const auth = await makeAuthHeaders(undefined, {
      target: { owner: "acme", repo: "widgets" },
      appEligible: true,
    });

    expect(auth.headers["Authorization"]).toBe("Bearer inst-token-1");
    expect(auth.source).toBe("GitHub App 42 (installation 7)");
    expect(auth.fingerprint).toBe(credentialFingerprint("github-app:42:7"));
    expect(state.calls.map((call) => `${call.method} ${new URL(call.url).pathname}`)).toEqual([
      "GET /repos/acme/widgets/installation",
      "POST /app/installations/7/access_tokens",
    ]);

    const [header, payload, signature] = state.calls[0]!.auth.slice("Bearer ".length).split(".");
    expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toEqual({
      alg: "RS256",
      typ: "JWT",
    });
    const claims = JSON.parse(Buffer.from(payload!, "base64url").toString());
    expect(claims.iss).toBe(42);
    expect(claims.iat).toBeLessThanOrEqual(before - 59);
    expect(claims.exp - claims.iat).toBe(10 * 60);
    expect(
      verify(
        "RSA-SHA256",
        Buffer.from(`${header}.${payload}`),
        publicKey,
        Buffer.from(signature!, "base64url"),
      ),
    ).toBe(true);
  });

  it("caches the token and the per-owner installation, sharing one in-flight mint", async () => {
    const target = { owner: "Acme", repo: "a" };
    await Promise.all([
      makeAuthHeaders(undefined, { target: target, appEligible: true }),
      makeAuthHeaders(undefined, { target: target, appEligible: true }),
    ]);
    await makeAuthHeaders(undefined, { target: { owner: "acme", repo: "b" }, appEligible: true });

    expect(state.mintCount).toBe(1);
    expect(state.calls).toHaveLength(2);
  });

  it("refreshes a token within five minutes of expiry", async () => {
    state.expiresAt = new Date(Date.now() + 4 * 60_000).toISOString();
    await makeAuthHeaders(undefined, { target: { owner: "acme", repo: "a" }, appEligible: true });
    const second = await makeAuthHeaders(undefined, {
      target: { owner: "acme", repo: "a" },
      appEligible: true,
    });

    expect(second.headers["Authorization"]).toBe("Bearer inst-token-2");
    expect(state.calls.filter((call) => call.url.endsWith("/installation"))).toHaveLength(1);
  });

  it("beats user tokens for matched repositories and leaves others on the user chain", async () => {
    await rest("GET", "/repos/acme/widgets/pulls/1");
    await rest("GET", "/repos/stranger/widgets/pulls/1");

    expect(apiCalls().map((call) => call.auth)).toEqual([
      "Bearer inst-token-1",
      "Bearer user-token",
    ]);
  });

  it("uses the user chain when no config file exists", async () => {
    rmSync(join(state.home, "github-apps.yml"));
    _resetTokenCache();
    await rest("GET", "/repos/acme/widgets/pulls/1");

    expect(apiCalls()[0]!.auth).toBe("Bearer user-token");
  });

  it("derives the target from REST text paths and GraphQL variables", async () => {
    await restText("/repos/acme/widgets/actions/jobs/1/logs");
    await graphql("query($owner:String!,$repo:String!){x}", { owner: "acme", repo: "widgets" });
    await graphql("query($owner:String!,$name:String!){x}", { owner: "other", name: "one" });
    await graphql("query($owner:String!,$name:String!){x}", { owner: "other", name: "two" });

    expect(apiCalls().map((call) => call.auth)).toEqual([
      "Bearer inst-token-1",
      "Bearer inst-token-1",
      // Another owner is another installation lookup, so it mints its own token.
      "Bearer inst-token-2",
      "Bearer user-token",
    ]);
  });

  it("falls back to the command scope for requests without a target", async () => {
    const node = "query($id:ID!){node(id:$id){id}}";
    await graphql(node, { id: "PR_x" });
    await runWithAuthScope(async () => {
      setAuthTarget({ owner: "acme", name: "widgets" }, "inferred");
      await graphql(node, { id: "PR_x" });
      // A request-derived target beats the scope.
      await rest("GET", "/repos/stranger/x/pulls/1");
    });

    expect(apiCalls().map((call) => call.auth)).toEqual([
      "Bearer user-token",
      "Bearer inst-token-1",
      "Bearer user-token",
    ]);
  });

  it("keeps writes, viewer reads, and caller-relative routes on the user token", async () => {
    await runWithAuthScope(async () => {
      setAuthTarget({ owner: "acme", name: "widgets" }, "explicit");
      await rest("POST", "/repos/acme/widgets/issues/1/comments", { body: "x" });
      await rest("GET", "/user");
      await rest("GET", "/rate_limit");
      await graphql("mutation($id:ID!){x}", { id: "PR_x" });
      await graphql("query($owner:String!,$repo:String!){repository{viewerCanX}}", {
        owner: "acme",
        repo: "widgets",
      });
    });

    expect(new Set(apiCalls().map((call) => call.auth))).toEqual(new Set(["Bearer user-token"]));
    expect(state.calls.some((call) => call.url.includes("/app/"))).toBe(false);
  });

  it("re-mints the installation token after a 401", async () => {
    let first = true;
    route({
      "GET /repos/acme/widgets/pulls/1": () => {
        if (!first) return json(200, { ok: true });
        first = false;
        return json(401, { message: "Bad credentials" });
      },
    });
    await rest("GET", "/repos/acme/widgets/pulls/1");

    expect(apiCalls().map((call) => call.auth)).toEqual([
      "Bearer inst-token-1",
      "Bearer inst-token-2",
    ]);
  });

  it("reports the app as the credential source in text and JSON usage", async () => {
    const usage = await withApiTelemetryScope(async () => {
      await rest("GET", "/repos/acme/widgets/pulls/1");
      return summarizeApiTelemetry();
    });

    expect(usage?.credentialSources).toEqual(["GitHub App 42 (installation 7)"]);
    expect(formatApiUsage(usage)).toContain("Credential source: `GitHub App 42 (installation 7)`");
  });
});
