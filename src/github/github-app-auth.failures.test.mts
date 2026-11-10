import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  fetchMock,
  json,
  registerAppAuthHooks,
  route,
  state,
} from "../../test-helpers/github/app-auth.test-support.mts";
import { EXIT, ShepherdError } from "../exit-codes.mts";
import { makeAuthHeaders } from "./http-auth.mts";

registerAppAuthHooks();

describe("GitHub App failures", () => {
  const target = { owner: "acme", repo: "widgets" };

  async function failure(): Promise<ShepherdError> {
    try {
      await makeAuthHeaders(undefined, target);
    } catch (error) {
      return error as ShepherdError;
    }
    throw new Error("expected a failure");
  }

  it("names the app, repository, and fix when the app is not installed", async () => {
    route({ "GET /repos/acme/widgets/installation": () => json(404, { message: "Not Found" }) });
    const error = await failure();

    expect(error).toBeInstanceOf(ShepherdError);
    expect(error.exitCode).toBe(EXIT.NOPERM);
    expect(error.message).toContain("GitHub App 42");
    expect(error.message).toContain("acme/widgets");
    expect(error.message).toContain("Install the app on that account");
  });

  it("explains other installation lookup failures", async () => {
    route({ "GET /repos/acme/widgets/installation": () => json(401, { message: "bad jwt" }) });
    expect((await failure()).message).toContain("GitHub answered 401");
    route({ "GET /repos/acme/widgets/installation": () => json(200, { id: "x" }) });
    expect((await failure()).message).toContain("GitHub answered 200");
  });

  it("explains a rejected token request", async () => {
    route({ "POST /app/installations/7/access_tokens": () => json(403, { message: "nope" }) });
    const error = await failure();

    expect(error.message).toContain("token request answered 403");
  });

  it("never falls back to a user token when the key file is missing or invalid", async () => {
    rmSync(join(state.home, "app.pem"));
    let error = await failure();
    expect(error.exitCode).toBe(EXIT.NOPERM);
    expect(error.message).toContain("cannot read the private key");
    expect(error.message).toContain("private-key-file");

    writeFileSync(join(state.home, "app.pem"), "not a key");
    error = await failure();
    expect(error.message).toContain("not a valid RSA PEM key");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats an unparseable expiry as already stale", async () => {
    state.expiresAt = "garbage";
    await makeAuthHeaders(undefined, target);
    const again = await makeAuthHeaders(undefined, target);

    expect(again.headers["Authorization"]).toBe("Bearer inst-token-2");
  });

  it("handles a non-JSON error body", async () => {
    route({
      "GET /repos/acme/widgets/installation": () => new Response("<html>", { status: 502 }),
    });
    expect((await failure()).message).toContain("GitHub answered 502");
  });
});
