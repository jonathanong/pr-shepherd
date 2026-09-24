import { beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubRequestError } from "./errors.mts";
import { checkStackMergeSelector } from "./stack-merge-selector.mts";

const { mockRest } = vi.hoisted(() => ({ mockRest: vi.fn() }));
vi.mock("./http.mts", () => ({ rest: mockRest }));

const repo = { owner: "acme", name: "widgets" };

beforeEach(() => {
  mockRest.mockReset();
});

describe("checkStackMergeSelector", () => {
  it("reports a native stack that shares the PR number", async () => {
    mockRest.mockResolvedValue({ number: 7, open: true });
    await expect(checkStackMergeSelector(7, repo)).resolves.toEqual({ status: "stack-number" });
    expect(mockRest).toHaveBeenCalledWith("GET", "/repos/acme/widgets/stacks/7");
  });

  it("verifies the PR number when no stack uses it", async () => {
    mockRest.mockRejectedValue(new GitHubRequestError("not found", { status: 404 }));
    await expect(checkStackMergeSelector(7, repo)).resolves.toEqual({ status: "verified" });
  });

  it("reports other lookup failures without throwing", async () => {
    mockRest.mockRejectedValue(
      new GitHubRequestError("GitHub REST GET /repos/acme/widgets/stacks/7 failed: 502", {
        status: 502,
      }),
    );
    await expect(checkStackMergeSelector(7, repo)).resolves.toEqual({
      status: "unverified",
      error: "GitHub REST GET /repos/acme/widgets/stacks/7 failed: 502",
    });
  });

  it("reports a non-Error rejection without throwing", async () => {
    mockRest.mockRejectedValue("socket hang up");
    await expect(checkStackMergeSelector(7, repo)).resolves.toEqual({
      status: "unverified",
      error: "socket hang up",
    });
  });
});
