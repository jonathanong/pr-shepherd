import { describe, expect, it } from "vitest";
import { expectConfigError, writeRc } from "../../test-helpers/config/load-test-support.mts";

describe("loadConfig — removed and unknown keys", () => {
  it("rejects the removed minimize-comments users value", async () => {
    writeRc("iterate:\n  minimize-comments: users\n");
    await expectConfigError("`iterate.minimize-comments`", '"all"|"bots"|"none"');
  });

  it("rejects removed action keys as unknown", async () => {
    writeRc("actions:\n  autoResolveOutdated: false\n  commitSuggestions: false\n");
    await expectConfigError(
      "unknown key `actions.autoResolveOutdated`",
      "unknown key `actions.commitSuggestions`",
    );
  });

  it("rejects unknown keys in every section, including classify", async () => {
    writeRc("classify:\n  custom: true\nunknownSetting: true\nactions:\n  unknownAction: true\n");
    await expectConfigError(
      "unknown key `classify.custom`",
      "unknown key `unknownSetting`",
      "unknown key `actions.unknownAction`",
    );
  });

  it("reports unknown siblings alongside rename hints in an old section", async () => {
    writeRc("watch:\n  readyDelayMinutes: 5\n  sparkle: true\n");
    await expectConfigError(
      "`watch.readyDelayMinutes` → `iterate.ready-delay-minutes`",
      "unknown key `watch.sparkle`",
    );
  });

  it("reports an old section without any renamed keys as one unknown key", async () => {
    writeRc("watch:\n  sparkle: true\n");
    const message = await expectConfigError("unknown key `watch`");
    expect(message).not.toContain("watch.sparkle");
  });
});
