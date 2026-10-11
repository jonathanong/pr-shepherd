import { makeRawPr, makeResponse } from "./batch-fixtures.mts";
import { repo, serve, wire } from "./rest-read.test-support.mts";
import { runIterate } from "../../src/commands/iterate/index.mts";
import { runWithGithubTransport } from "../../src/github/transport.mts";

/**
 * GraphQL requests per native-stack layer tick, measured at the HTTP boundary. `BatchPr`'s first
 * page carries the stack topology and the trunk's rules, so a layer above the trunk needs no
 * separate `PollStackTopology` or `RefRules` read.
 */
const page = { pageInfo: { hasPreviousPage: false, startCursor: null }, nodes: [] };
export const BOTTOM_HEAD = "a".repeat(40);
const LAYER_HEAD = "b".repeat(40);
const TRUNK_TIP = "c".repeat(40);
const MAIN_TIP = "d".repeat(40);

export interface StackState {
  updatedAt: string;
  /** Contexts the trunk requires; a context without a check run is unreported. */
  trunkRequired: string[];
  /** Trunk named by the stack; the bottom entry's base normally matches it. */
  trunk?: string;
  bottomBase?: string;
  /** More entries than one page holds. */
  hasNextPage?: boolean;
}

function member(number: number, headRefName: string, headRefOid: string, baseRefName: string) {
  return {
    number,
    state: "OPEN",
    headRefName,
    headRefOid,
    baseRefName,
    baseRefOid: baseRefName === "user-model" ? BOTTOM_HEAD : MAIN_TIP,
  };
}

function rules(contexts: string[]) {
  return {
    branchProtectionRule: null,
    rules: {
      pageInfo: { hasNextPage: false },
      nodes:
        contexts.length === 0
          ? []
          : [
              {
                type: "REQUIRED_STATUS_CHECKS",
                parameters: { requiredStatusChecks: contexts.map((context) => ({ context })) },
              },
            ],
    },
  };
}

function stackOf(state: StackState) {
  const trunk = state.trunk ?? "main";
  const bottomBase = state.bottomBase ?? "main";
  return {
    id: "STACK_7",
    number: 7,
    size: 2,
    baseRefName: trunk,
    entries: {
      pageInfo: {
        hasNextPage: state.hasNextPage ?? false,
        endCursor: state.hasNextPage ? "entries-1" : null,
      },
      nodes: [
        { position: 1, pullRequest: member(101, "user-model", BOTTOM_HEAD, bottomBase) },
        { position: 2, pullRequest: member(102, "user-ui", LAYER_HEAD, "user-model") },
      ],
    },
    trunkEntry: {
      nodes: [
        {
          pullRequest: {
            baseRefName: bottomBase,
            baseRef: { ...rules(state.trunkRequired), target: { oid: TRUNK_TIP } },
          },
        },
      ],
    },
  };
}

function layerPr(state: StackState) {
  return makeRawPr({
    number: 102,
    updatedAt: state.updatedAt,
    headRefName: "user-ui",
    headRefOid: LAYER_HEAD,
    baseRefName: "user-model",
    baseRefOid: BOTTOM_HEAD,
    baseRef: { ...rules([]), target: { oid: BOTTOM_HEAD } },
    stack: stackOf(state),
    stackEntry: { position: 2 },
    reviewThreads: page,
    commits: {
      totalCount: 1,
      nodes: [
        {
          commit: {
            oid: LAYER_HEAD,
            committedDate: "2026-10-09T00:00:00Z",
            statusCheckRollup: {
              state: "PENDING",
              contexts: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  {
                    __typename: "CheckRun",
                    id: "CR_1",
                    name: "ci",
                    status: "IN_PROGRESS",
                    conclusion: null,
                  },
                ],
              },
            },
            checkSuites: {
              pageInfo: { hasNextPage: false },
              nodes: [{ id: "CS_1", status: "IN_PROGRESS", conclusion: null, workflowRun: null }],
            },
          },
        },
      ],
    },
  });
}

function topology(state: StackState) {
  const stack = stackOf(state);
  return {
    data: {
      viewer: { login: "me" },
      repository: {
        viewerCanAdminister: true,
        pullRequest: {
          stack: {
            ...stack,
            entries: { ...stack.entries, pageInfo: { hasNextPage: false, endCursor: null } },
          },
        },
      },
    },
  };
}

export async function serveStack(state: StackState) {
  await serve((request, response) => {
    const operation = operationOf(request);
    if (operation === "BatchPr") {
      response.end(JSON.stringify(makeResponse(layerPr(state), "me")));
    } else if (operation === "PollStackTopology") {
      response.end(JSON.stringify(topology(state)));
    } else if (operation === "BaseBehind") {
      response.end(
        JSON.stringify({
          data: { repository: { ref: { target: { oid: TRUNK_TIP }, compare: { behindBy: 3 } } } },
        }),
      );
    } else if (operation === "RefRules") {
      response.end(
        JSON.stringify({
          data: {
            repository: { ref: { ...rules(state.trunkRequired), compare: { behindBy: 3 } } },
          },
        }),
      );
    } else response.end("[]");
  });
}

const tick = (fingerprintCache: boolean) =>
  runWithGithubTransport("graphql", () =>
    runIterate({
      prNumber: 102,
      targetRepository: repo,
      format: "json",
      readyDelaySeconds: 0,
      stallTimeoutSeconds: 0,
      noAutoMarkReady: true,
      fingerprintCache,
    }),
  );

export function operationOf(request: { path: string; method: string; body: { query?: unknown } }) {
  return request.path === "/graphql"
    ? (String(request.body.query).match(/\b(?:query|mutation)\s+(\w+)/)?.[1] ?? "graphql")
    : `${request.method} ${request.path.split("?")[0]}`;
}

export async function measure(fingerprintCache: boolean) {
  wire.requests.length = 0;
  const report = await tick(fingerprintCache);
  return { report, operations: wire.requests.map(operationOf) };
}
