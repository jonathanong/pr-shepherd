import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runReadOnly } from "../execution-context.mts";
import { claimWarning } from "./graphql-quota-claims.mts";
import type { GraphqlQuotaWarning } from "../types.mts";

describe("claimWarning in a read-only scope", () => {
  it("surfaces the warning without taking a claim", async () => {
    const dir = mkdtempSync(join(tmpdir(), "shepherd-quota-claims-"));
    try {
      const warning = { resetAt: 100, limit: 5000, thresholdPercent: 80 } as GraphqlQuotaWarning;
      const claimed = await runReadOnly(() => claimWarning(join(dir, "quota"), warning, 50, 0));
      expect(claimed).toBe(true);
      expect(readdirSync(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
