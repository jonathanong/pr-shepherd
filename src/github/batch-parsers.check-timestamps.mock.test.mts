import { describe, it, expect } from "vitest";
import {
  registerHooks,
  REPO,
  makeRawPr,
  makeResponse,
  mockGraphqlWithRateLimit,
} from "../../test-helpers/github/batch-parsers.test-support.mts";
import { fetchPrBatch } from "./batch.mts";

registerHooks();

describe("fetchPrBatch — check timestamps", () => {
  it("maps CheckRun source and timing fields", async () => {
    const pr = makeRawPr({
      commits: {
        nodes: [
          {
            commit: {
              statusCheckRollup: {
                contexts: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [
                    {
                      __typename: "CheckRun",
                      name: "tests",
                      status: "QUEUED",
                      conclusion: null,
                      detailsUrl: "https://github.com/owner/repo/actions/runs/9999/jobs/1",
                      startedAt: null,
                      completedAt: "2026-05-20T01:04:00Z",
                      title: null,
                      summary: null,
                      checkSuite: {
                        status: "COMPLETED",
                        createdAt: "2026-05-20T01:00:00Z",
                        updatedAt: "2026-05-20T01:05:00Z",
                        workflowRun: {
                          event: "pull_request",
                          createdAt: "2026-05-20T00:59:00Z",
                          updatedAt: "2026-05-20T01:06:00Z",
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));

    const { data } = await fetchPrBatch(42, REPO);

    expect(data.checks[0]).toMatchObject({
      source: "check_run",
      suiteStatus: "COMPLETED",
      createdAtUnix: 1_779_238_740,
      completedAtUnix: 1_779_239_040,
      updatedAtUnix: 1_779_239_160,
    });
    expect(data.checks[0]).not.toHaveProperty("startedAtUnix");
  });

  it("maps StatusContext source and createdAt", async () => {
    const pr = makeRawPr({
      commits: {
        nodes: [
          {
            commit: {
              statusCheckRollup: {
                contexts: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [
                    {
                      __typename: "StatusContext",
                      context: "external",
                      state: "PENDING",
                      createdAt: "2026-05-20T02:00:00Z",
                      targetUrl: "https://example.test/status",
                      description: "Waiting",
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));

    const { data } = await fetchPrBatch(42, REPO);

    expect(data.checks[0]).toMatchObject({
      source: "status_context",
      createdAtUnix: 1_779_242_400,
      summary: "Waiting",
    });
  });

  it("normalizes a finished run reported as in_progress (#793)", async () => {
    const node = {
      __typename: "CheckRun",
      name: "checks / migration-order",
      status: "IN_PROGRESS",
      conclusion: "SUCCESS",
      detailsUrl: "https://github.com/owner/repo/actions/runs/9999/jobs/1",
      startedAt: "2026-05-20T01:00:00Z",
      completedAt: "2026-05-20T01:04:00Z",
      title: null,
      summary: null,
      checkSuite: null,
    };
    const pr = makeRawPr({
      commits: {
        nodes: [
          {
            commit: {
              statusCheckRollup: {
                contexts: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [
                    node,
                    { ...node, name: "ended", conclusion: null },
                    { ...node, name: "running", conclusion: null, completedAt: null },
                  ],
                },
              },
            },
          },
        ],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));

    const { data } = await fetchPrBatch(42, REPO);

    expect(data.checks[0]).toMatchObject({
      name: "checks / migration-order",
      status: "COMPLETED",
      conclusion: "SUCCESS",
    });
    expect(data.checks[1]).toMatchObject({ status: "COMPLETED", conclusion: null });
    expect(data.checks[2]).toMatchObject({ status: "IN_PROGRESS", conclusion: null });
  });
});
