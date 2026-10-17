import { describe, it } from "vitest";
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
});
