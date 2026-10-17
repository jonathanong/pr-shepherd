import { describe, expect, it } from "vitest";
import {
  expectConfigError,
  freshLoadConfig,
  writeRc,
} from "../../test-helpers/config/load-test-support.mts";

describe("loadConfig — github.transport", () => {
  it("defaults to auto", async () => {
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().github?.transport).toBe("auto");
  });
  it.each(["auto", "graphql", "rest"])("accepts %s", async (transport) => {
    writeRc(`github:\n  transport: ${transport}\n`);
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().github?.transport).toBe(transport);
  });
  it.each(["github: rest", "github: null", "github:\n  transport: invalid"])(
    "rejects invalid nested configuration %s",
    async (yaml) => {
      writeRc(`${yaml}\n`);
      await expectConfigError("`github");
    },
  );
});
