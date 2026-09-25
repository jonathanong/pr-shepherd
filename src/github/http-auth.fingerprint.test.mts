import { afterEach, describe, expect, it } from "vitest";
import { _resetTokenCache, credentialFingerprint, makeAuthHeaders } from "./http-auth.mts";

const syntheticToken = "synthetic-token-not-real";

describe("credentialFingerprint", () => {
  const previousToken = process.env["GH_TOKEN"];

  afterEach(() => {
    if (previousToken === undefined) delete process.env["GH_TOKEN"];
    else process.env["GH_TOKEN"] = previousToken;
    _resetTokenCache();
  });

  it("returns a truncated hash and never the token", async () => {
    process.env["GH_TOKEN"] = syntheticToken;
    _resetTokenCache();

    const auth = await makeAuthHeaders();

    expect(auth.fingerprint).toBe(credentialFingerprint(syntheticToken));
    expect(auth.fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(auth.fingerprint).not.toContain("synthetic");
    expect(credentialFingerprint(`${syntheticToken}-other`)).not.toBe(auth.fingerprint);
  });
});
