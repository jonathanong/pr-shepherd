import { describe, it, expect } from "vitest";
import {
  mockFetch,
  gqlErrors,
  registerClientHooks,
} from "../../test-helpers/github/client.test-support.mts";
import { graphql } from "./client.mts";

registerClientHooks();

describe("graphql — error handling", () => {
  it("throws when response contains errors[]", async () => {
    mockFetch.mockResolvedValue(
      gqlErrors([{ message: "Field does not exist" }, { message: "Syntax error" }]),
    );
    await expect(graphql("{ q }")).rejects.toThrow("Field does not exist; Syntax error");
  });

  it("wraps fetch failure as 'GitHub GraphQL request failed'", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: () => Promise.resolve("Unauthorized"),
    });
    const err = await graphql("{ q }").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/GitHub GraphQL request failed: 401/);
  });
});
