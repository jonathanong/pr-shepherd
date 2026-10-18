import { describe, it, expect, vi } from "vitest";
import { freshLoadConfig, writeRc } from "../../test-helpers/config/load-test-support.mts";

describe("loadConfig — iterate.reviewOutputMaxChars", () => {
  it("defaults to 50000", async () => {
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().iterate.reviewOutputMaxChars).toBe(50000);
  });

  it("accepts 0 (unlimited) from the rc file", async () => {
    writeRc("iterate:\n  reviewOutputMaxChars: 0\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().iterate.reviewOutputMaxChars).toBe(0);
  });

  it.each(["-1", "1.5", '"big"'])("rejects %s", async (raw) => {
    writeRc(`iterate:\n  reviewOutputMaxChars: ${raw}\n`);
    const loadConfig = await freshLoadConfig();
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      expect(loadConfig().iterate.reviewOutputMaxChars).toBe(50000);
      expect(write).toHaveBeenCalledWith(
        expect.stringContaining(
          "Invalid config: iterate.reviewOutputMaxChars must be a non-negative integer",
        ),
      );
    } finally {
      write.mockRestore();
    }
  });
});
