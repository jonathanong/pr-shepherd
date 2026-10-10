import { describe, expect, it } from "vitest";
import { serve, wire, repo } from "../../test-helpers/github/rest-read.test-support.mts";
import { getRestMerge, requestRestMerge } from "./rest-merge.mts";

describe("REST asynchronous merge response boundary", () => {
  it.each([null, "unexpected response"])(
    "rejects a non-object response %j after one submission",
    async (body) => {
      await serve((_request, response) => response.end(JSON.stringify(body)));
      await expect(
        requestRestMerge(repo, 101, { requireSha: "a".repeat(40), mergeAction: "default" }),
      ).rejects.toThrow("Invalid asynchronous merge response");
      expect(wire.requests).toHaveLength(1);
      expect(wire.requests[0]?.method).toBe("PUT");
    },
  );

  it("rejects invalid status UUIDs before HTTP", async () => {
    await serve((_request, response) => response.end("{}"));
    await expect(getRestMerge(repo, 101, "../another-request")).rejects.toThrow(
      "Invalid asynchronous merge UUID",
    );
    expect(wire.requests).toEqual([]);
  });
});
