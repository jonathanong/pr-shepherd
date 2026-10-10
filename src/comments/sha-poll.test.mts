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

  it("names the checkout cause and the current PR head on timeout", async () => {
    vi.useFakeTimers();
    try {
      mockGetPrHeadSha.mockResolvedValue("pr-head-sha");
      const settled = waitForSha(42, REPO, "local-sha").catch((e: unknown) => e as Error);

      await vi.runAllTimersAsync();

      const { message } = (await settled) as Error;
      expect(message).toContain("has not updated to local-sha");
      expect(message).toContain("outside the PR head checkout");
      expect(message).toContain("(currently pr-head-sha)");
    } finally {
      vi.useRealTimers();
    }
  });
});
