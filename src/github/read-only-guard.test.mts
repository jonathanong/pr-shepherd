import { describe, expect, it, vi } from "vitest";
import { runReadOnly } from "../execution-context.mts";
import { graphql, rest } from "./http.mts";
import { assertGraphQlReadable, assertRestReadable } from "./read-only-guard.mts";

describe("read-only HTTP backstop", () => {
  it("refuses a GraphQL mutation before any request is sent", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      await expect(
        runReadOnly(() =>
          graphql("mutation M { markPullRequestReadyForReview(input: {}) { __typename } }", {}),
        ),
      ).rejects.toThrow(/read-only status check refused a GitHub mutation: GraphQL mutation/);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("refuses a mutation document that starts with GraphQL-ignored commas", () => {
    expect(() =>
      runReadOnly(() =>
        assertGraphQlReadable(
          ", ,\n mutation M { markPullRequestReadyForReview(input: {}) { __typename } }",
        ),
      ),
    ).toThrow(/refused a GitHub mutation/);
    expect(() =>
      runReadOnly(() => assertGraphQlReadable(", query Q { viewer { login } }")),
    ).not.toThrow();
  });

  it("refuses every non-GET REST method before any request is sent", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        await expect(runReadOnly(() => rest(method, "/repos/o/r/pulls/1"))).rejects.toThrow(
          /read-only status check refused/,
        );
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("allows queries, GET and HEAD, and everything outside a read-only scope", () => {
    expect(() =>
      runReadOnly(() => assertGraphQlReadable("query Q { viewer { login } }")),
    ).not.toThrow();
    expect(() => runReadOnly(() => assertGraphQlReadable("{ viewer { login } }"))).not.toThrow();
    expect(() => runReadOnly(() => assertRestReadable("GET", "/x"))).not.toThrow();
    expect(() => runReadOnly(() => assertRestReadable("head", "/x"))).not.toThrow();
    expect(() => assertGraphQlReadable("mutation M { x }")).not.toThrow();
    expect(() => assertRestReadable("PUT", "/x")).not.toThrow();
  });
});
