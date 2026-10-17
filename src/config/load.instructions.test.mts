import { describe, it, expect } from "vitest";
import {
  expectConfigError,
  freshLoadConfig,
  writeRc,
} from "../../test-helpers/config/load-test-support.mts";

describe("loadConfig — iterate.instructions", () => {
  it("defaults to inline", async () => {
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().iterate.instructions).toBe("inline");
  });

  it("accepts playbook from the rc file", async () => {
    writeRc("iterate:\n  instructions: playbook\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().iterate.instructions).toBe("playbook");
  });

  it("rejects an unknown style", async () => {
    writeRc("iterate:\n  instructions: verbose\n");
    await expectConfigError("`iterate.instructions`");
  });
});
