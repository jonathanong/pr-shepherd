/* eslint-disable max-lines */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetRepoInfo,
  mockGetPullRequestBody,
  mockUpdatePullRequestBody,
  mockGetCurrentPrNumber,
} = vi.hoisted(() => ({
  mockGetRepoInfo: vi.fn(),
  mockGetPullRequestBody: vi.fn(),
  mockUpdatePullRequestBody: vi.fn(),
  mockGetCurrentPrNumber: vi.fn(),
}));

vi.mock("../github/client.mts", () => ({
  getRepoInfo: mockGetRepoInfo,
  getPullRequestBody: mockGetPullRequestBody,
  updatePullRequestBody: mockUpdatePullRequestBody,
  getCurrentPrNumber: mockGetCurrentPrNumber,
}));

import { runJournal } from "./journal/index.mts";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRepoInfo.mockResolvedValue({ owner: "owner", name: "repo" });
  mockGetCurrentPrNumber.mockResolvedValue(null);
  mockGetPullRequestBody.mockResolvedValue({
    nodeId: "PR_node123",
    body: "## Summary\n\nSome content.",
    viewerCanUpdate: true,
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
    expect(mockUpdatePullRequestBody.mock.calls[0]![1]).toContain(
      "<summary>Shepherd Journal</summary>",
    );
    expect(mockUpdatePullRequestBody.mock.calls[0]![1]).toContain("- Decision made.");
  });

  it("preserves the exact non-journal body while appending", async () => {
    const originalBody = [
      "# Summary",
      "",
      "Keep this description exactly as written.",
      "",
      "## Shepherd Journal",
      "",
      "- Existing entry.",
      "",
      "## Follow-up",
      "",
      "Keep this section too.",
    ].join("\n");
    mockGetPullRequestBody.mockResolvedValue({
      nodeId: "PR_node123",
      body: originalBody,
      viewerCanUpdate: true,
    });

    await runJournal({ prNumber: 42, rawItem: "- New entry.", dryRun: false });

    expect(mockUpdatePullRequestBody).toHaveBeenCalledWith(
      "PR_node123",
      [
        "# Summary",
        "",
        "Keep this description exactly as written.",
        "",
        "<details>",
        "<summary>Shepherd Journal</summary>",
        "",
        "- Existing entry.",
        "- New entry.",
        "</details>",
        "",
        "## Follow-up",
        "",
        "Keep this section too.",
      ].join("\n"),
    );
  });

  it("appends to an existing section", async () => {
    mockGetPullRequestBody.mockResolvedValue({
      nodeId: "PR_node123",
      body: "<details>\n<summary>Shepherd Journal</summary>\n\n- Old entry.\n</details>",
      viewerCanUpdate: true,
    });

    const result = await runJournal({ prNumber: 42, rawItem: "- New entry.", dryRun: false });

    expect(result.mutated).toBe(true);
    expect(result.sectionExisted).toBe(true);
    expect(mockUpdatePullRequestBody).toHaveBeenCalledOnce();
  });

  it("treats a null/empty body the same as an empty string", async () => {
    mockGetPullRequestBody.mockResolvedValue({
      nodeId: "PR_node456",
      body: "",
      viewerCanUpdate: true,
    });

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
    expect(result.previewBody).toContain("<summary>Shepherd Journal</summary>");
    expect(result.previewBody).toContain("- Note.");
    expect(mockUpdatePullRequestBody).not.toHaveBeenCalled();
  });
});

describe("runJournal — authorization", () => {
  it("returns a structured skip and does not update when viewerCanUpdate is false", async () => {
    mockGetPullRequestBody.mockResolvedValue({
      nodeId: "PR_node123",
      body: "",
      viewerCanUpdate: false,
    });

    const result = await runJournal({ prNumber: 42, rawItem: "- Note.", dryRun: false });

    expect(result.authorizationSkipped).toBe("denied-or-unverifiable");
    expect(result.mutated).toBe(false);
    expect(mockUpdatePullRequestBody).not.toHaveBeenCalled();
  });
});

describe("runJournal — idempotency (dedup)", () => {
  it("returns mutated=false when item already present and does not mutate", async () => {
    mockGetPullRequestBody.mockResolvedValue({
      nodeId: "PR_node123",
      body: "<details>\n<summary>Shepherd Journal</summary>\n\n- Existing entry.\n</details>",
      viewerCanUpdate: true,
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

describe("runJournal — PR number discovery", () => {
  it("throws when prNumber is undefined and no current branch PR", async () => {
    mockGetCurrentPrNumber.mockResolvedValue(null);
    await expect(
      runJournal({ prNumber: undefined, rawItem: "- Entry.", dryRun: false }),
    ).rejects.toThrow("PR number is required");
    expect(mockGetPullRequestBody).not.toHaveBeenCalled();
  });

  it("resolves prNumber from current branch when not provided", async () => {
    mockGetCurrentPrNumber.mockResolvedValue(99);
    const result = await runJournal({ prNumber: undefined, rawItem: "- Entry.", dryRun: false });
    expect(result.prNumber).toBe(99);
    expect(mockGetPullRequestBody).toHaveBeenCalledWith(99, "owner", "repo");
  });
});
