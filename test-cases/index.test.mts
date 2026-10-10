import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import {
  registerHarnessBefore,
  listFixtureNames,
  loadFixture,
  applyFixture,
  captureRun,
  captureTwoTickStallRun,
  fixtureTransports,
  type Fixture,
  type FixtureTransport,
} from "../test-helpers/test-cases/harness.mts";
import {
  CANONICAL_REST_ITEM_BLOCK,
  CANONICAL_REST_TEXT_BLOCK,
  collectRestJsonEvidence,
  hasRestSnapshot,
  restSnapshotPaths,
  stripRestJsonEvidence,
  stripRestTextEvidence,
} from "../test-helpers/test-cases/rest-variant.mts";
import { REST_BATCH_UNAVAILABLE } from "../src/github/rest-batch-unavailable.mts";

registerHarnessBefore();

const fixturesDir = fileURLToPath(new URL("./", import.meta.url));

/**
 * The action slug encoded in a fixture's directory name (e.g. "16-fix-code-review-thread" ->
 * "fix_code") must match the action iterate actually emits. Without this guard a fixture can
 * silently drift from what its name promises — see the three fixtures documented in
 * test-cases/README.md that this guard would have caught.
 */
const NAME_ACTION_SLUGS: ReadonlyArray<[prefix: string, action: string]> = [
  ["fix-code-", "fix_code"],
  ["mark-ready-", "mark_ready"],
  ["cancel-", "cancel"],
  ["ready-", "ready"],
  ["wait-", "wait"],
  ["escalate-", "escalate"],
  ["merge-", "merge"],
];

function actionFromFixtureName(name: string): string {
  const rest = name.replace(/^\d+-/, "");
  const match = NAME_ACTION_SLUGS.find(([prefix]) => rest.startsWith(prefix));
  if (!match) {
    throw new Error(`fixture name "${name}" does not start with a known action slug`);
  }
  return match[1];
}

interface RunResult {
  textOut: string;
  jsonOut: string;
  exitCode: number;
  jsonExitCode: number;
}

interface Outcome {
  exitCode: number;
  action?: string;
  reason?: string;
  nextAction?: string;
}

async function runVariant(fixture: Fixture, transport: FixtureTransport): Promise<RunResult> {
  applyFixture(fixture, transport);
  const run = fixture.stallMode === "two-tick" ? captureTwoTickStallRun : captureRun;
  const result = await run(fixture, transport);
  expect(result.textOut, "text output must not be empty").toBeTruthy();
  expect(result.jsonOut, "json output must not be empty").toBeTruthy();
  expect(result.jsonExitCode, "text and json exit codes must agree").toBe(result.exitCode);
  return result;
}

/** What the fixture's directory name and expectations promise (the GraphQL outcome). */
function expectedOutcome(name: string, fixture: Fixture): Outcome {
  if (fixture.mode === "aggregate") {
    return {
      exitCode: fixture.expectedExitCode,
      reason: fixture.expectedReason,
      ...(fixture.expectedNextAction !== undefined && { nextAction: fixture.expectedNextAction }),
    };
  }
  return { exitCode: fixture.expectedExitCode, action: actionFromFixtureName(name) };
}

function assertOutcome(fixture: Fixture, result: RunResult, expected: Outcome): void {
  expect(result.exitCode, "exit code must match docs/exit-codes.md").toBe(expected.exitCode);
  const json = JSON.parse(result.jsonOut) as Record<string, unknown>;
  if (fixture.mode === "aggregate") {
    expect(json.mode).toBe("summary");
    expect(json.reason).toBe(expected.reason);
    if (expected.nextAction !== undefined) expect(json.nextAction).toBe(expected.nextAction);
  } else {
    expect(json.action, `fixture name must match the emitted action`).toBe(expected.action);
  }
}

/** GraphQL results captured this run, reused by the REST comparison in the same file. */
const graphqlResults = new Map<string, RunResult>();

for (const name of listFixtureNames()) {
  const fixture = loadFixture(name);
  const transports = fixtureTransports(fixture);
  const snapshotDir = join(fixturesDir, "snapshots", name);

  describe(name, () => {
    if (transports.includes("graphql")) {
      it("snapshots match", async () => {
        const result = await runVariant(fixture, "graphql");
        graphqlResults.set(name, result);
        assertOutcome(fixture, result, expectedOutcome(name, fixture));
        await expect(result.textOut).toMatchFileSnapshot(join(snapshotDir, "output.text.md"));
        await expect(result.jsonOut).toMatchFileSnapshot(join(snapshotDir, "output.json"));
      });
    }

    if (transports.includes("rest")) {
      it("REST variant matches GraphQL or its REST snapshot", async () => {
        const result = await runVariant(fixture, "rest");

        // The transport evidence block is the same canonical block on every REST output.
        const json = JSON.parse(result.jsonOut) as unknown;
        const evidence = collectRestJsonEvidence(json);
        expect(evidence.length, "REST JSON must carry transport evidence").toBeGreaterThan(0);
        for (const entry of evidence) {
          expect(entry).toEqual({
            transport: "rest",
            transportUnavailable: [...REST_BATCH_UNAVAILABLE],
          });
        }
        expect(
          result.textOut.includes(
            fixture.mode === "aggregate" ? CANONICAL_REST_ITEM_BLOCK : CANONICAL_REST_TEXT_BLOCK,
          ),
          "REST text must carry the canonical transport block",
        ).toBe(true);

        const paths = restSnapshotPaths(snapshotDir);
        let sameAsGraphql = false;
        if (transports.includes("graphql")) {
          const graphql = graphqlResults.get(name) ?? (await runVariant(fixture, "graphql"));
          const sameText = stripRestTextEvidence(result.textOut) === graphql.textOut;
          const sameJson = isDeepStrictEqual(
            stripRestJsonEvidence(json),
            JSON.parse(graphql.jsonOut),
          );
          sameAsGraphql = sameText && sameJson;
        }
        if (sameAsGraphql) {
          expect(
            hasRestSnapshot(snapshotDir),
            "REST output now equals GraphQL output apart from the transport block; " +
              "delete the stale output.rest.* snapshot files",
          ).toBe(false);
        } else {
          await expect(result.textOut).toMatchFileSnapshot(paths.text);
          await expect(result.jsonOut).toMatchFileSnapshot(paths.json);
        }

        // Outcome: same as GraphQL unless an explained divergence is declared, and a declared
        // divergence must actually occur.
        const graphqlOutcome = expectedOutcome(name, fixture);
        const divergence = fixture.restDivergence;
        if (divergence) {
          expect(divergence.why, "restDivergence.why must explain the difference").toBeTruthy();
          const { why: _why, ...overrides } = divergence;
          const restOutcome = { ...graphqlOutcome, ...overrides };
          expect(
            isDeepStrictEqual(restOutcome, graphqlOutcome),
            "restDivergence must change the action, exit code, reason, or next action",
          ).toBe(false);
          assertOutcome(fixture, result, restOutcome);
        } else {
          assertOutcome(fixture, result, graphqlOutcome);
        }
      });
    }
  });
}
