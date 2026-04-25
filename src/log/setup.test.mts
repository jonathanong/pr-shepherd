import { describe, it, expect, vi } from "vitest";

vi.mock("../github/client.mts", () => ({
  getRepoInfo: vi.fn().mockRejectedValue(new Error("not in a git repo")),
}));

vi.mock("./log-file.mts", () => ({
  initLog: vi.fn().mockResolvedValue(null),
  appendEntry: vi.fn(),
}));

vi.mock("./session.mts", () => ({
  buildSessionHeader: vi.fn().mockReturnValue({ markdown: "## header\n" }),
  formatOutputEntry: vi.fn().mockReturnValue("### Output\n"),
}));

describe("setupLog", () => {
  it("returns without throwing when getRepoInfo fails", async () => {
    vi.resetModules();
    const { setupLog } = await import("./setup.mts");
    await expect(setupLog(["node", "bin/index.mjs", "check"])).resolves.toBeUndefined();
  });
});
