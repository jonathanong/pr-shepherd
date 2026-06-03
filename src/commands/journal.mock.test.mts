import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetRepoInfo, mockGetPullRequestBody, mockUpdatePullRequestBody } = vi.hoisted(() => ({
  mockGetRepoInfo: vi.fn(),
  mockGetPullRequestBody: vi.fn(),
  mockUpdatePullRequestBody: vi.fn(),
}));

vi.mock("../github/client.mts", () => ({
  getRepoInfo: mockGetRepoInfo,
  getPullRequestBody: mockGetPullRequestBody,
  updatePullRequestBody: mockUpdatePullRequestBody,
}));

import { runJournal } from "./journal/index.mts";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRepoInfo.mockResolvedValue({ owner: "owner", name: "repo" });
  mockGetPullRequestBody.mockResolvedValue({
    nodeId: "PR_node123",
    body: "## Summary\n\nSome content.",
  });
  mockUpdatePullRequestBody.mockResolvedValue(undefined);
});

describe("runJournal — happy path", () => {
  it("appends an entry and calls updatePullRequestBody", async () => {
    const result = await runJournal({ prNumber: 42, rawItem: "- Decision made.", dryRun: false });

    expect(result.mutated).toBe(true);
    expect(result.sectionExisted).toBe(false);
    expect(result.dryRun).toBe(false);
    expect(result.previewBody).toBeUndefined();
    expect(mockUpdatePullRequestBody).toHaveBeenCalledOnce();
    expect(mockUpdatePullRequestBody.mock.calls[0]![0]).toBe("PR_node123");
    expect(mockUpdatePullRequestBody.mock.calls[0]![1]).toContain("## Shepherd Journal");
    expect(mockUpdatePullRequestBody.mock.calls[0]![1]).toContain("- Decision made.");
  });

  it("appends to an existing section", async () => {
    mockGetPullRequestBody.mockResolvedValue({
      nodeId: "PR_node123",
      body: "## Shepherd Journal\n\n- Old entry.",
    });

    const result = await runJournal({ prNumber: 42, rawItem: "- New entry.", dryRun: false });

    expect(result.mutated).toBe(true);
    expect(result.sectionExisted).toBe(true);
    expect(mockUpdatePullRequestBody).toHaveBeenCalledOnce();
  });

  it("treats a null/empty body the same as an empty string", async () => {
    mockGetPullRequestBody.mockResolvedValue({ nodeId: "PR_node456", body: "" });

    const result = await runJournal({ prNumber: 7, rawItem: "- Entry.", dryRun: false });

    expect(result.mutated).toBe(true);
    expect(mockUpdatePullRequestBody).toHaveBeenCalledOnce();
  });
});

describe("runJournal — dry-run", () => {
  it("does not call updatePullRequestBody on dry-run", async () => {
    const result = await runJournal({ prNumber: 42, rawItem: "- Note.", dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.mutated).toBe(true);
    expect(result.previewBody).toBeDefined();
    expect(result.previewBody).toContain("## Shepherd Journal");
    expect(result.previewBody).toContain("- Note.");
    expect(mockUpdatePullRequestBody).not.toHaveBeenCalled();
  });
});

describe("runJournal — idempotency (dedup)", () => {
  it("returns mutated=false when item already present and does not mutate", async () => {
    mockGetPullRequestBody.mockResolvedValue({
      nodeId: "PR_node123",
      body: "## Shepherd Journal\n\n- Existing entry.",
    });

    const result = await runJournal({
      prNumber: 42,
      rawItem: "- Existing entry.",
      dryRun: false,
    });

    expect(result.mutated).toBe(false);
    expect(mockUpdatePullRequestBody).not.toHaveBeenCalled();
  });
});

describe("runJournal — validation errors", () => {
  it("throws on empty item", async () => {
    await expect(runJournal({ prNumber: 42, rawItem: "  ", dryRun: false })).rejects.toThrow(
      "empty",
    );
    expect(mockUpdatePullRequestBody).not.toHaveBeenCalled();
  });

  it("throws when item does not start with '- '", async () => {
    await expect(
      runJournal({ prNumber: 42, rawItem: "Not a list item.", dryRun: false }),
    ).rejects.toThrow('"- <text>"');
    expect(mockUpdatePullRequestBody).not.toHaveBeenCalled();
  });
});

describe("runJournal — missing PR number", () => {
  it("throws when prNumber is undefined", async () => {
    await expect(
      runJournal({ prNumber: undefined, rawItem: "- Entry.", dryRun: false }),
    ).rejects.toThrow("PR number is required");
    expect(mockGetPullRequestBody).not.toHaveBeenCalled();
  });
});
