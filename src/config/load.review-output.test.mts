import { describe, it, expect } from "vitest";
import {
  expectConfigError,
  freshLoadConfig,
  writeRc,
} from "../../test-helpers/config/load-test-support.mts";

describe("loadConfig — iterate.review-output-max-chars", () => {
  it("defaults to 50000", async () => {
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().iterate["review-output-max-chars"]).toBe(50000);
  });

  it("accepts 0 (unlimited) from the rc file", async () => {
    writeRc("iterate:\n  review-output-max-chars: 0\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().iterate["review-output-max-chars"]).toBe(0);
  });

  it.each(["-1", "1.5", '"big"'])("rejects %s", async (raw) => {
    writeRc(`iterate:\n  review-output-max-chars: ${raw}\n`);
    await expectConfigError("`iterate.review-output-max-chars`");
  });

  it("names the v1 key for the pre-v1 camelCase key", async () => {
    writeRc("iterate:\n  reviewOutputMaxChars: 3000\n");
    await expectConfigError("`iterate.reviewOutputMaxChars` → `iterate.review-output-max-chars`");
  });
});
