import { describe, expect, it } from "vitest";
import {
  expectConfigError,
  freshLoadConfig,
  writeRawRc,
} from "../../test-helpers/config/load-test-support.mts";

describe("loadConfig — config version", () => {
  it("accepts version 1", async () => {
    writeRawRc("version: 1\niterate:\n  ready-delay-minutes: 5\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().iterate["ready-delay-minutes"]).toBe(5);
  });

  it("requires a version and still reports rename hints for a 0.x file", async () => {
    writeRawRc("watch:\n  readyDelayMinutes: 5\n");
    await expectConfigError(
      "`version` is required: add `version: 1`",
      "`watch.readyDelayMinutes` → `iterate.ready-delay-minutes`",
    );
  });

  it("reports only the version for a newer format", async () => {
    writeRawRc("version: 2\nfuture-key: true\n");
    const message = await expectConfigError(
      "`version: 2` needs a newer pr-shepherd; this release reads config version 1",
    );
    expect(message).not.toContain("future-key");
  });

  it.each(["0", '"1"', "1.5"])("rejects version %s", async (version) => {
    writeRawRc(`version: ${version}\n`);
    await expectConfigError("`version` must be 1");
  });

  it("accepts an empty file without a version", async () => {
    writeRawRc("");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().iterate["ready-delay-minutes"]).toBe(0);
  });
});
