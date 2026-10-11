import { describe, expect, it, vi } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repo, serve, wire } from "../../test-helpers/github/rest-read.test-support.mts";
import { freshLoadConfig } from "../../test-helpers/config/load-test-support.mts";
import { operationOf } from "../../test-helpers/github/stack-tick.test-support.mts";
import {
  batchPage,
  checkRunsResponse,
  stackModel,
  stackSummaryResponse,
  summaryLayer,
} from "../../test-helpers/github/stack-handoff.test-support.mts";
import { runAggregatePoll, runPollSummary } from "../commands/poll-summary.mts";
import { runIterate } from "../commands/iterate/index.mts";
import { runWithGithubTransport } from "./transport.mts";

const model = stackModel();

async function serveModel() {
  await serve((request, response) => {
    const operation = operationOf(request);
    const body = request.body as { variables?: { pr?: number; ids?: string[] } };
    if (operation === "PollStackSummary") {
      response.end(JSON.stringify(stackSummaryResponse(model)));
    } else if (operation === "StackHandoffCheckRuns") {
      response.end(JSON.stringify(checkRunsResponse(model, body.variables!.ids!)));
    } else if (operation === "BatchPr") {
      const layer = model.find((item) => item.number === body.variables!.pr)!;
      const page = batchPage(layer, model);
      const receipt = String((request.body as { query: string }).query).includes("receiptSummary");
      const repository = {
        ...page.repository,
        ...(receipt && { receiptSummary: summaryLayer(layer, model) }),
      };
      response.end(JSON.stringify({ data: { ...page, repository } }));
    } else response.end("[]");
  });
}

const iterate = (prNumber: number) =>
  runWithGithubTransport("graphql", () =>
    runIterate({
      prNumber,
      targetRepository: repo,
      format: "json",
      readyDelaySeconds: 0,
      stallTimeoutSeconds: 0,
      noAutoMarkReady: true,
    }),
  );

async function measure<T>(run: () => Promise<T>) {
  wire.requests.length = 0;
  const result = await run();
  return { result, operations: wire.requests.map(operationOf) };
}

const graphqlOnly = (operations: string[]) =>
  operations.filter((operation) => !operation.includes(" "));

describe("GraphQL routed stack layer handoff cost", () => {
  it("routes layers on one summary read plus check-run details; their first ticks read nothing", async () => {
    await freshLoadConfig();
    await serveModel();
    const summary = await measure(() =>
      runWithGithubTransport("graphql", () =>
        runPollSummary({ stackPrNumber: 101, targetRepository: repo }),
      ),
    );
    expect(summary.result).toMatchObject({ nextAction: "shepherd" });
    expect(summary.operations).toEqual(["PollStackSummary", "StackHandoffCheckRuns"]);

    const handedOff = [];
    for (const layer of model) {
      const tick = await measure(() => iterate(layer.number));
      expect(tick.operations).toEqual([]);
      handedOff.push(tick.result);
    }
    const next = await measure(() => iterate(101));
    expect(graphqlOnly(next.operations)).toEqual(["BatchPr"]);

    // The same ticks on a fresh state directory, read from BatchPr, report the same.
    vi.stubEnv("PR_SHEPHERD_STATE_DIR", await mkdtemp(join(tmpdir(), "pr-shepherd-handoff-")));
    for (const [index, layer] of model.entries()) {
      const read = await measure(() => iterate(layer.number));
      expect(graphqlOnly(read.operations)).toEqual(["BatchPr"]);
      const { apiUsage, ...report } = read.result as typeof read.result & { apiUsage?: unknown };
      expect(apiUsage).toBeDefined();
      expect(handedOff[index]).toEqual(report);
    }
  });

  it("hands off from the aggregate poll's actionable return", async () => {
    await freshLoadConfig();
    await serveModel();
    const summary = await measure(() =>
      runWithGithubTransport("graphql", () =>
        runAggregatePoll({
          stackPrNumber: 101,
          targetRepository: repo,
          intervalSeconds: 1,
          timeoutSeconds: 1,
          debounceSeconds: 0,
        }),
      ),
    );
    expect(summary.result).toMatchObject({ nextAction: "shepherd", reason: "actionable" });
    expect(summary.operations).toEqual(["PollStackSummary", "StackHandoffCheckRuns"]);
    expect((await measure(() => iterate(102))).operations).toEqual([]);
  });
});
