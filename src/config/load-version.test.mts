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

  it.each(["", "# comment only\n", "---\n"])(
    "accepts an empty file %j without a version",
    async (body) => {
      writeRawRc(body);
      const loadConfig = await freshLoadConfig();
      expect(loadConfig().iterate["ready-delay-minutes"]).toBe(0);
    },
  );

  it.each(["null\n", "~\n"])("rejects an explicit null document %j", async (body) => {
    writeRawRc(body);
    await expectConfigError("the top level must be a mapping");
  });

  it.each([
    ["apply", "sha-poll-interval-seconds"],
    ["iterate", "ready-delay-minutes"],
    ["poll", "debounce-seconds"],
  ])("rejects an infinite %s.%s", async (section, key) => {
    writeRawRc(`version: 1\n${section}:\n  ${key}: .inf\n`);
    await expectConfigError(`${section}.${key}`);
  });
});
