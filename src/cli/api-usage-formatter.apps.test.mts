import { describe, expect, it } from "vitest";
import { formatApiUsage } from "./api-usage-formatter.mts";

const APP = "GitHub App 5700476 (installation 180605082)";
const reset = 1_900_000_000;
const resets = new Date(reset * 1000).toISOString();

const graphql = {
  resource: "graphql",
  requestCount: 5,
  limit: 10000,
  used: 3,
  remaining: 9997,
  resetAt: reset,
  measuredQueryCost: 5,
  unmeasuredRequestCount: 0,
  nodeCount: 4000,
};

describe("formatApiUsage GitHub App blocks", () => {
  it("lists user sources, then each app as a nested block", () => {
    const text = formatApiUsage({
      credentialSources: ["gh auth token"],
      graphql: { ...graphql, requestCount: 1, limit: 5000, remaining: 4990, used: 10 },
      githubApps: [
        {
          source: APP,
          graphql,
          rest: [
            {
              resource: "core",
              requestCount: 1,
              limit: 15000,
              used: 1,
              remaining: 14999,
              resetAt: reset,
            },
          ],
        },
      ],
    });
    expect(text).toBe(
      [
        "## GitHub API usage",
        "",
        "- Credential source: `gh auth token`",
        `- \`graphql\`: 4990/5000 remaining · used 10 · 1 requests · resets ${resets}`,
        "- GraphQL measured cost: 5 · unmeasured requests: 0 · nodes: 4000",
        `- \`${APP}\`:`,
        `  - \`graphql\`: 9997/10000 remaining · used 3 · 5 requests · resets ${resets}`,
        "  - GraphQL measured cost: 5 · unmeasured requests: 0 · nodes: 4000",
        `  - \`core\`: 14999/15000 remaining · used 1 · 1 requests · resets ${resets}`,
      ].join("\n"),
    );
  });

  it("omits the credential line when only an app answered", () => {
    const text = formatApiUsage({ credentialSources: [], githubApps: [{ source: APP, graphql }] });
    expect(text).not.toContain("Credential source");
    expect(text).toContain(`- \`${APP}\`:\n  - \`graphql\`: 9997/10000`);
  });
});
