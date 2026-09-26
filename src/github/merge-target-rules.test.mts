import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client.mts", () => ({ graphqlWithRateLimit: vi.fn() }));
vi.mock("./stack-read.mts", () => ({ readStackTopology: vi.fn() }));

import { graphqlWithRateLimit } from "./client.mts";
import { loadMergeTargetStatus } from "./merge-target-rules.mts";
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
