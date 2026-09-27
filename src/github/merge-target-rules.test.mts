import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client.mts", () => ({ graphqlWithRateLimit: vi.fn() }));
vi.mock("./stack-read.mts", () => ({ readStackTopology: vi.fn() }));

import { graphqlWithRateLimit } from "./client.mts";
import { loadBaseBehindBy, loadMergeTargetStatus } from "./merge-target-rules.mts";
import { readStackTopology } from "./stack-read.mts";

const graphql = vi.mocked(graphqlWithRateLimit);
const topology = vi.mocked(readStackTopology);

const input = {
  owner: "acme",
  name: "widgets",
  pr: 622,
  baseRefName: "feature-parent",
  headRefName: "feature",
  localContexts: ["local"],
  stack: { baseRefName: "main" },
};

describe("loadMergeTargetStatus", () => {
  beforeEach(() => {
    graphql.mockReset();
    topology.mockReset();
  });

  it("fails when the stack has no open layer based on the trunk", async () => {
    topology.mockResolvedValue({
      ordered: [
        {
          number: 1,
          state: "CLOSED",
          baseRefName: "main",
          headRefName: "old",
          headRefOid: "a",
          baseRefOid: "b",
        },
      ],
    } as Awaited<ReturnType<typeof readStackTopology>>);

    await expect(loadMergeTargetStatus(input)).rejects.toThrow(
      "Native stack for PR #622 has no open layer based on main",
    );
    expect(graphql).not.toHaveBeenCalled();
  });

  it("fails when the trunk ref does not exist", async () => {
    graphql.mockResolvedValue({
      data: { repository: { ref: null } },
    } as Awaited<ReturnType<typeof graphqlWithRateLimit>>);

    await expect(
      loadMergeTargetStatus({ ...input, baseRefName: "main", stack: { baseRefName: "main" } }),
    ).rejects.toThrow("Branch refs/heads/main was not found in acme/widgets");
  });
});

describe("loadBaseBehindBy", () => {
  beforeEach(() => graphql.mockReset());

  it("returns the base compare behind count", async () => {
    graphql.mockResolvedValue({
      data: { repository: { ref: { compare: { behindBy: 93 } } } },
    } as Awaited<ReturnType<typeof graphqlWithRateLimit>>);

    const head = "c".repeat(40);
    await expect(loadBaseBehindBy("acme", "widgets", "main", head)).resolves.toBe(93);
    expect(graphql).toHaveBeenCalledWith(
      expect.stringContaining("behindBy"),
      expect.objectContaining({
        qualifiedName: "refs/heads/main",
        headRef: "c".repeat(40),
      }),
    );
  });

  it("returns zero when GitHub has no compare object", async () => {
    graphql.mockResolvedValue({
      data: { repository: { ref: { compare: null } } },
    } as Awaited<ReturnType<typeof graphqlWithRateLimit>>);
    await expect(loadBaseBehindBy("acme", "widgets", "main", "feature")).resolves.toBe(0);
  });

  it("fails when the repository or base ref is missing", async () => {
    graphql.mockResolvedValue({
      data: { repository: null },
    } as Awaited<ReturnType<typeof graphqlWithRateLimit>>);
    await expect(loadBaseBehindBy("acme", "widgets", "main", "feature")).rejects.toThrow(
      "acme/widgets",
    );
    graphql.mockResolvedValue({
      data: { repository: { ref: null } },
    } as Awaited<ReturnType<typeof graphqlWithRateLimit>>);
    await expect(loadBaseBehindBy("acme", "widgets", "main", "feature")).rejects.toThrow(
      "refs/heads/main",
    );
  });
});
