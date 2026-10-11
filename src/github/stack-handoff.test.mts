/* eslint-disable max-lines */
import { describe, expect, it } from "vitest";
import { repo, serve, wire } from "../../test-helpers/github/rest-read.test-support.mts";
import { operationOf } from "../../test-helpers/github/stack-tick.test-support.mts";
import {
  HEADS,
  batchPage,
  checkRunsResponse,
  stackModel,
  stackSummaryResponse,
  type LayerModel,
} from "../../test-helpers/github/stack-handoff.test-support.mts";
import { loadDerived, storeDerived } from "../state/rest-cache.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";
import { takeStackHandoff, writeStackHandoffs } from "./stack-handoff.mts";
import { batchResponseFromSummary, type StackHandoffSource } from "./stack-handoff-page.mts";

const HANDOFF_TTL_MS = 2 * 60_000;
import { runWithGithubTransport } from "./transport.mts";

function sourceOf(model: LayerModel[], readAt = Date.now()): StackHandoffSource {
  const stack = stackSummaryResponse(model).data.repository.pullRequest.stack;
  return {
    read: {
      stackNumber: 7,
      stackSize: model.length,
      viewerLogin: "me",
      viewerCanAdminister: true,
      stack: { id: "STACK_7", positions: model.map((_, index) => index + 1) },
      viewerPermission: "ADMIN",
      mergeSettings: {
        mergeCommitAllowed: true,
        squashMergeAllowed: true,
        rebaseMergeAllowed: false,
      },
    },
    layers: stack.entries.nodes.map((node) => node.pullRequest) as unknown as RawSummaryPr[],
    readAt,
  };
}

function runsOf(model: LayerModel[]) {
  const ids = model.flatMap((layer) => layer.runs.map((run) => run.id));
  const nodes = checkRunsResponse(model, ids).data.nodes;
  return new Map(nodes.map((node) => [node!.id, node!] as const));
}

function expected(layer: LayerModel, model: LayerModel[], summary: RawSummaryPr) {
  const page = batchPage(layer, model);
  return { ...page, repository: { ...page.repository, receiptSummary: summary } };
}

const graphql = (model: LayerModel[]) =>
  serve((request, response) => {
    const ids = (request.body as { variables: { ids: string[] } }).variables.ids;
    response.end(JSON.stringify(checkRunsResponse(model, ids)));
  });

const write = (source: StackHandoffSource, routed: number[]) =>
  runWithGithubTransport("graphql", () => writeStackHandoffs(source, routed, repo));

describe("batchResponseFromSummary", () => {
  it("rebuilds each layer's BatchPr first page from the stack summary", () => {
    const model = stackModel();
    const source = sourceOf(model);
    const runs = runsOf(model);
    model.forEach((layer, index) => {
      const summary = source.layers[index]!;
      expect(batchResponseFromSummary(summary, source, runs)).toEqual(
        expected(layer, model, summary),
      );
    });
  });

  it("keeps optional summary fields absent or null the way BatchPr answers them", () => {
    const model = stackModel();
    const source = sourceOf(model);
    const layer = source.layers[0]!;
    const commit = layer.commits.nodes[0]!.commit;
    const nodes = commit.statusCheckRollup!.contexts.nodes as Array<Record<string, unknown>>;
    delete nodes[2]!.createdAt;
    delete nodes[2]!.targetUrl;
    delete nodes[2]!.description;
    nodes[0]!.checkSuite = null;
    nodes[1]!.checkSuite = { workflowRun: null };
    commit.checkSuites!.nodes[0]!.workflowRun = null;
    delete (layer.reviews.nodes[0] as { commit?: unknown }).commit;
    delete layer.headRepository;
    delete layer.baseRef;
    const runs = new Map(runsOf(model));
    runs.set("CR_2", { title: null, summary: null, annotations: undefined } as never);
    const built = batchResponseFromSummary(layer, source, runs)!.repository!.pullRequest!;
    const contexts = built.commits.nodes[0]!.commit.statusCheckRollup!.contexts.nodes;
    expect(contexts[2]).toEqual({
      __typename: "StatusContext",
      context: "deploy/preview",
      state: "SUCCESS",
      targetUrl: null,
      description: null,
    });
    expect(contexts[0]).toMatchObject({ checkSuite: null });
    expect(contexts[1]).toMatchObject({ checkSuite: { workflowRun: null } });
    expect(contexts[1]).not.toHaveProperty("annotations");
    expect(built.commits.nodes[0]!.commit.checkSuites!.nodes[0]!.workflowRun).toBeNull();
    expect(built.changesRequestedReviews.nodes[0]).not.toHaveProperty("commit");
    expect(built.headRepository).toBeNull();
    expect(built.baseRef).toBeNull();
    expect(built.stack!.trunkEntry!.nodes[0]!.pullRequest!.baseRef).toBeNull();

    const bare = sourceOf(model);
    const top = bare.layers[1]!;
    const run = top.commits.nodes[0]!.commit.statusCheckRollup!.contexts.nodes[0] as {
      checkSuite: { workflowRun: { workflow: unknown; createdAt?: string } };
    };
    run.checkSuite.workflowRun.workflow = null;
    delete run.checkSuite.workflowRun.createdAt;
    top.commits.nodes[0]!.commit.statusCheckRollup = null;
    expect(
      batchResponseFromSummary(top, bare, runsOf(model))!.repository!.pullRequest!.commits.nodes[0]!
        .commit.statusCheckRollup,
    ).toBeNull();
  });

  it("drops a check run's workflow when the summary has none", () => {
    const model = stackModel();
    const source = sourceOf(model);
    const top = source.layers[1]!;
    const run = top.commits.nodes[0]!.commit.statusCheckRollup!.contexts.nodes[0] as {
      checkSuite: { createdAt?: string; workflowRun: { workflow: unknown; createdAt?: string } };
    };
    run.checkSuite.workflowRun.workflow = null;
    delete run.checkSuite.createdAt;
    delete run.checkSuite.workflowRun.createdAt;
    const built = batchResponseFromSummary(top, source, runsOf(model))!;
    const context = built.repository!.pullRequest!.commits.nodes[0]!.commit.statusCheckRollup!
      .contexts.nodes[0] as { checkSuite: unknown };
    expect(context.checkSuite).toEqual({
      updatedAt: "2026-10-09T00:00:00Z",
      workflowRun: {
        event: "pull_request",
        updatedAt: "2026-10-09T00:00:00Z",
        workflow: null,
      },
    });
  });

  const gates: Array<[string, (source: StackHandoffSource, layer: RawSummaryPr) => void]> = [
    ["no stack identity", (source) => delete source.read.stack],
    ["no viewer permission", (source) => delete source.read.viewerPermission],
    ["no merge settings", (source) => delete source.read.mergeSettings],
    [
      "more layers than one entries page",
      (source) => source.layers.push(...Array.from({ length: 49 }, () => source.layers[1]!)),
    ],
    ["no stack", (_, layer) => (layer.stack = null)],
    ["no stack entry", (_, layer) => (layer.stackEntry = null)],
    ["a closed layer", (_, layer) => (layer.state = "CLOSED")],
    ["no node id", (_, layer) => delete layer.id],
    ["no viewerDidAuthor", (_, layer) => delete layer.viewerDidAuthor],
    ["a queued layer", (_, layer) => (layer.isInMergeQueue = true)],
    ["a queue entry", (_, layer) => (layer.mergeQueueEntry = { headCommit: null })],
    [
      "a queue removal",
      (_, layer) =>
        (layer.mergeQueueRemovals = { nodes: [{ id: "RME_1", createdAt: "x" }] as never }),
    ],
    ["older comments", (_, layer) => (layer.comments.pageInfo.hasPreviousPage = true)],
    ["older reviews", (_, layer) => (layer.reviews.pageInfo.hasPreviousPage = true)],
    ["older threads", (_, layer) => (layer.reviewThreads.pageInfo.hasPreviousPage = true)],
    [
      "a truncated thread",
      (_, layer) => (layer.reviewThreads.nodes[0]!.comments.pageInfo.hasPreviousPage = true),
    ],
    [
      "a thread wider than five comments",
      (_, layer) => {
        const comments = layer.reviewThreads.nodes[0]!.comments.nodes;
        comments.push(...Array.from({ length: 5 }, () => comments[0]!));
      },
    ],
    [
      "a review bucket wider than BatchPr's page",
      (_, layer) =>
        layer.reviews.nodes.push(...Array.from({ length: 51 }, () => layer.reviews.nodes[1]!)),
    ],
    [
      "a full latestReviews window",
      (_, layer) =>
        layer.latestReviews!.nodes.push(
          ...Array.from({ length: 47 }, () => layer.latestReviews!.nodes[0]!),
        ),
    ],
    ["no latestReviews", (_, layer) => delete layer.latestReviews],
    ["no review requests", (_, layer) => delete layer.reviewRequests],
    ["no commit count", (_, layer) => delete layer.commits.totalCount],
    ["no head commit", (_, layer) => (layer.commits.nodes = [])],
    ["a stale head commit", (_, layer) => (layer.commits.nodes[0]!.commit.oid = "f".repeat(40))],
    [
      "no suite page info",
      (_, layer) => delete layer.commits.nodes[0]!.commit.checkSuites!.pageInfo,
    ],
    [
      "older contexts",
      (_, layer) =>
        (layer.commits.nodes[0]!.commit.statusCheckRollup!.contexts.pageInfo.hasPreviousPage = true),
    ],
    [
      "more contexts than BatchPr's page",
      (_, layer) => (layer.commits.nodes[0]!.commit.statusCheckRollup!.contexts.totalCount = 101),
    ],
    [
      "fewer contexts than the total",
      (_, layer) => (layer.commits.nodes[0]!.commit.statusCheckRollup!.contexts.totalCount = 4),
    ],
  ];

  it.each(gates)("hands nothing off for %s", (_, mutate) => {
    const model = stackModel();
    const source = sourceOf(model);
    mutate(source, source.layers[0]!);
    expect(batchResponseFromSummary(source.layers[0]!, source, runsOf(model))).toBeNull();
  });

  it("hands nothing off when a check run's details are missing", () => {
    const model = stackModel();
    const source = sourceOf(model);
    const runs = runsOf(model);
    runs.delete("CR_1");
    expect(batchResponseFromSummary(source.layers[0]!, source, runs)).toBeNull();
    const noId = sourceOf(model);
    delete (
      noId.layers[0]!.commits.nodes[0]!.commit.statusCheckRollup!.contexts.nodes[0] as {
        id?: string;
      }
    ).id;
    expect(batchResponseFromSummary(noId.layers[0]!, noId, runsOf(model))).toBeNull();
  });
});

describe("stack handoffs", () => {
  it("stores routed layers once, consumed by the first read of the same head", async () => {
    const model = stackModel();
    await graphql(model);
    const source = sourceOf(model);
    await write(source, [102]);
    expect(wire.requests.map(operationOf)).toEqual(["StackHandoffCheckRuns"]);
    expect(wire.requests[0]!.body).toMatchObject({ variables: { ids: ["CR_3"] } });
    expect(await takeStackHandoff(repo, 101)).toBeNull();
    expect(await takeStackHandoff(repo, 102)).toEqual(
      expected(model[1]!, model, source.layers[1]!),
    );
    expect(await takeStackHandoff(repo, 102)).toBeNull();
  });

  it("ignores a stale, future, or mismatched handoff and deletes it", async () => {
    const model = stackModel();
    await graphql(model);
    const source = sourceOf(model, 1_000_000);
    for (const now of [1_000_000 + HANDOFF_TTL_MS + 1, 999_999]) {
      await write(source, [101]);
      expect(await takeStackHandoff(repo, 101, now)).toBeNull();
      expect((await loadDerived({ ...key, pr: 101 }, "stack-handoff"))?.value).toBeNull();
    }
    await write(source, [101]);
    expect(await takeStackHandoff(repo, 101, 1_000_000 + HANDOFF_TTL_MS)).not.toBeNull();

    const response = batchResponseFromSummary(source.layers[0]!, source, runsOf(model));
    await storeDerived(key, "stack-handoff", { readAt: 1, headRefOid: HEADS[102], response });
    expect(await takeStackHandoff(repo, 101, 1)).toBeNull();
    await storeDerived(key, "stack-handoff", { readAt: 1, headRefOid: HEADS[101], response: {} });
    expect(await takeStackHandoff(repo, 101, 1)).toBeNull();
  });

  it("clears a routed layer's earlier handoff when its new summary is incomplete", async () => {
    const model = stackModel();
    await graphql(model);
    await write(sourceOf(model), [101, 102]);
    const next = sourceOf(model);
    next.layers[0]!.reviewThreads.pageInfo.hasPreviousPage = true;
    next.layers[1]!.reviewThreads.pageInfo.hasPreviousPage = true;
    wire.requests.length = 0;
    await write(next, [101, 102]);
    expect(wire.requests).toEqual([]);
    expect(await takeStackHandoff(repo, 101)).toBeNull();
    expect(await takeStackHandoff(repo, 102)).toBeNull();
  });

  it("clears earlier handoffs for layers a newer read no longer routes", async () => {
    const model = stackModel();
    await graphql(model);
    await write(sourceOf(model), [101, 102]);
    wire.requests.length = 0;
    await write(sourceOf(model), [101]);
    expect(await takeStackHandoff(repo, 102)).toBeNull();
    expect(await takeStackHandoff(repo, 101)).not.toBeNull();

    await write(sourceOf(model), [101, 102]);
    wire.requests.length = 0;
    await write(sourceOf(model), []);
    expect(wire.requests).toEqual([]);
    expect(await takeStackHandoff(repo, 101)).toBeNull();
    expect(await takeStackHandoff(repo, 102)).toBeNull();
  });

  it("stores nothing when the check-run read fails or misses a run", async () => {
    const model = stackModel();
    await graphql(model);
    await write(sourceOf(model), [101, 102]);
    await serve((_, response) => {
      response.end(JSON.stringify({ errors: [{ type: "FORBIDDEN", message: "denied" }] }));
    });
    await write(sourceOf(model), [101, 102]);
    expect(await takeStackHandoff(repo, 101)).toBeNull();
    expect(await takeStackHandoff(repo, 102)).toBeNull();

    await serve((_, response) => {
      const { data } = checkRunsResponse(model, ["CR_1", "CR_2", "CR_3"]);
      const [lint, test, top] = data.nodes;
      const nodes = [
        { ...lint, annotations: undefined },
        { ...test, title: undefined, summary: undefined },
        null,
        { __typename: "StatusContext" },
        { ...top, id: undefined },
      ];
      response.end(JSON.stringify({ data: { nodes } }));
    });
    await write(sourceOf(model), [101, 102]);
    expect(await takeStackHandoff(repo, 101)).toBeNull();
    expect(await takeStackHandoff(repo, 102)).toBeNull();
  });

  it("reads check runs in pages of 100", async () => {
    const model = stackModel();
    for (const layer of model) {
      layer.status = undefined;
      layer.runs = Array.from({ length: 75 }, (_, index) => ({
        id: `CR_${layer.number}_${index}`,
        name: `check-${index}`,
        conclusion: "SUCCESS",
      }));
    }
    await graphql(model);
    await write(sourceOf(model), [101, 102]);
    expect(
      wire.requests.map(
        (request) => (request.body as { variables: { ids: string[] } }).variables.ids.length,
      ),
    ).toEqual([100, 50]);
    expect(await takeStackHandoff(repo, 101)).not.toBeNull();
  });

  it("hands nothing off on the REST transport", async () => {
    const model = stackModel();
    await graphql(model);
    await runWithGithubTransport("rest", () => writeStackHandoffs(sourceOf(model), [101], repo));
    expect(wire.requests).toEqual([]);
    expect(await takeStackHandoff(repo, 101)).toBeNull();
  });
});

const key = { owner: repo.owner, repo: repo.name, pr: 101 };
