import { describe, it, expect, vi } from "vitest";

describe("truncation", () => {
  it("truncates when MAX_BODY env is set before module load", async () => {
    const saved = process.env["PR_SHEPHERD_LOG_MAX_BODY"];
    try {
      process.env["PR_SHEPHERD_LOG_MAX_BODY"] = "5";
      vi.resetModules();
      const { formatResponseEntry: freshFmt } = await import("./session.mts");
      const out = freshFmt({
        n: 1,
        kind: "GraphQL",
        method: "POST",
        url: "https://api.github.com/graphql",
        status: 200,
        durationMs: 10,
        textBody: "a".repeat(20),
      });
      expect(out).toContain("truncated");
      expect(out).toContain("characters");
    } finally {
      vi.resetModules();
      if (saved === undefined) delete process.env["PR_SHEPHERD_LOG_MAX_BODY"];
      else process.env["PR_SHEPHERD_LOG_MAX_BODY"] = saved;
    }
  });
});
