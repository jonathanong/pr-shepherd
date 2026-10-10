import { describe, expect, it } from "vitest";
import { formatApiUsage } from "./api-usage-formatter.mts";

const core = {
  resource: "core",
  requestCount: 3,
  limit: 5000,
  used: 10,
  remaining: 4990,
  resetAt: 1_900_000_000,
};

describe("formatApiUsage REST conditional reads", () => {
  it("reports 304 responses next to the request count", () => {
    const text = formatApiUsage({
      credentialSources: ["GH_TOKEN"],
      rest: [{ ...core, notModified: 7 }],
    });
    expect(text).toContain("3 requests · 7 not modified (304) · resets");
  });

  it("omits the not-modified tally when there were none", () => {
    const text = formatApiUsage({
      credentialSources: ["GH_TOKEN"],
      rest: [core],
    });
    expect(text).toContain("3 requests · resets");
    expect(text).not.toContain("not modified");
  });
});
