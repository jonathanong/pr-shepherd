import { describe, it, expect, vi } from "vitest";
import { freshLoadConfig, writeRc } from "../../test-helpers/config/load-test-support.mts";

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
    const loadConfig = await freshLoadConfig();
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      expect(loadConfig().iterate.instructions).toBe("inline");
      expect(write).toHaveBeenCalledWith(
        expect.stringContaining(
          'Invalid config: iterate.instructions must be "playbook" or "inline", got "verbose"',
        ),
      );
    } finally {
      write.mockRestore();
    }
  });
});
