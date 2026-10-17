import { describe, expect, it } from "vitest";
import { tmpPath, writeRc } from "../test-helpers/config/load-test-support.mts";

describe("createPrShepherd — config validation", () => {
  it("rejects with the config error before GitHub I/O, even with an explicit transport", async () => {
    writeRc("watch:\n  readyDelayMinutes: 5\n");
    const { createPrShepherd } = await import("./api.mts");
    const client = createPrShepherd({ cwd: tmpPath(), transport: "rest" });
    await expect(client.getJournal({ pr: "owner/repo#1" })).rejects.toMatchObject({
      name: "ShepherdError",
      exitCode: 78,
      message: expect.stringContaining("`watch.readyDelayMinutes` → `iterate.ready-delay-minutes`"),
    });
  });
});
