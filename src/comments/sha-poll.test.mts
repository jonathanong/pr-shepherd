import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../github/client.mts", () => ({
  getPrHeadSha: vi.fn(),
}));

import { waitForSha } from "./sha-poll.mts";
import { getPrHeadSha } from "../github/client.mts";

const mockGetPrHeadSha = vi.mocked(getPrHeadSha);
const REPO = { owner: "owner", name: "repo" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("waitForSha", () => {
  it("rethrows the last SHA lookup error", async () => {
    vi.useFakeTimers();
    try {
      mockGetPrHeadSha.mockRejectedValue(new Error("GitHub unavailable"));
      const settled = waitForSha(42, REPO, "expected-sha").catch((e: unknown) => e as Error);

      await vi.runAllTimersAsync();

      await expect(settled).resolves.toMatchObject({ message: "GitHub unavailable" });
      expect(mockGetPrHeadSha).toHaveBeenCalledTimes(10);
    } finally {
      vi.useRealTimers();
    }
  });
});
