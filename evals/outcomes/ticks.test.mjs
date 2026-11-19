// node --test evals/outcomes/ticks.test.mjs
// The with arm's CLI mock must read like the shipped CLI. Every backticked
// `pr-shepherd ...` command in a scenario's mock (the hand-written ticks and the
// routing rules that pick between them) has the subcommand and flag shape of
// some command in a current snapshot under test-cases/snapshots, and none of the
// retired MCP wording remains.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { fixtureText, mustChange } from "../lib.mjs";
import { cliBody } from "./cli-mock.mjs";
import { SCENARIOS } from "./scenarios.mjs";

const SNAPSHOTS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "test-cases", "snapshots");

// `mergeReady` and friends were the MCP tools' option names; the CLI has flags.
export const MCP_ERA = /mergeReady|mergeThrough|MCP|call `stack` again|the call's `(?:refs|pr|prs)`/;

const COMMAND = /`((?:[A-Z_]+=\S+ )?pr-shepherd [^`]*)`/g;
const TOKEN = /"[^"]*"|'[^']*'|\S+/g;

/** Subcommand words, whether any other positional appears, and the flag names. */
export function shape(command) {
  const tokens = command.match(TOKEN).slice(command.match(TOKEN).indexOf("pr-shepherd") + 1);
  const words = [];
  const flags = new Set();
  let positional = false;
  let value = false;
  for (const token of tokens) {
    if (token.startsWith("--")) {
      flags.add(token.split("=")[0]);
      value = !token.includes("=");
    } else if (value) {
      value = false;
    } else if (/^[a-z][a-z-]*$/.test(token) && words.length < 2 && !positional) {
      words.push(token);
    } else {
      positional = true;
    }
  }
  return [...words, ...(positional ? ["ARG"] : []), ...[...flags].sort()].join(" ");
}

const commands = (text) => [...text.matchAll(COMMAND)].map((m) => m[1]);

function snapshotShapes() {
  const shapes = new Set();
  for (const dir of readdirSync(SNAPSHOTS)) {
    for (const file of readdirSync(join(SNAPSHOTS, dir)).filter((f) => f.endsWith(".md"))) {
      for (const c of commands(readFileSync(join(SNAPSHOTS, dir, file), "utf8"))) shapes.add(shape(c));
    }
  }
  return shapes;
}

/** The mock body the with arm is served for a scenario. */
function mockBody(spec) {
  let tick = fixtureText(spec.fixture);
  if (spec.transform) tick = mustChange(spec.slug, tick, spec.transform);
  return cliBody(spec, tick);
}

describe("shape", () => {
  it("keeps subcommands and flags, and drops arguments and flag values", () => {
    assert.equal(
      shape('pr-shepherd stack "owner/repo#7" https://x/pull/1 --until-terminal --merge'),
      "stack ARG --merge --until-terminal",
    );
    assert.equal(
      shape("pr-shepherd apply review https://x/pull/1 --message 'a b' --require-sha HEAD"),
      "apply review ARG --message --require-sha",
    );
    assert.equal(shape("GH_REPO=a/b pr-shepherd 42 --until-terminal"), "ARG --until-terminal");
  });
});

describe("hand-written ticks", () => {
  const known = snapshotShapes();
  const bodies = SCENARIOS.map((spec) => [spec.slug, mockBody(spec)]);

  it("finds the shapes the snapshots print", () => {
    assert.ok(known.has("stack ARG --merge --until-terminal"));
  });

  for (const [slug, body] of bodies) {
    it(`${slug}: commands have a snapshot's shape`, () => {
      // A bare subcommand names the command (as in "run `pr-shepherd stack` with `--merge`").
      const named = (c) => {
        const [word, ...rest] = shape(c).split(" ");
        return rest.length === 0 && [...known].some((k) => k.split(" ")[0] === word);
      };
      const unknown = commands(body).filter((c) => !known.has(shape(c)) && !named(c));
      assert.deepEqual(unknown, []);
    });

    it(`${slug}: no MCP-era wording`, () => {
      assert.doesNotMatch(body, MCP_ERA);
    });
  }
});
