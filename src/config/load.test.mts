/* eslint-disable max-lines */
import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  expectConfigError,
  freshLoadConfig,
  removeRc,
  tmpPath,
  writeRawRc,
  writeRc,
} from "../../test-helpers/config/load-test-support.mts";

describe("loadConfig — no rc file", () => {
  it("returns built-in defaults when no rc file exists in the tree", async () => {
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.apply).toEqual({ "sha-poll-interval-seconds": 2, "sha-poll-max-attempts": 10 });
    expect(result.iterate["triage-attempts-per-thread"]).toBe(3);
    expect(result.checks["ci-trigger-events"]).toEqual(["pull_request", "pull_request_target"]);
    expect(result["bot-usernames"]).toContain("coderabbitai");
    expect(result["bot-usernames"]).toContain("greptile-apps");
    expect(result.checks.ignore).toEqual([]);
    expect(result.checks["never-ignore"]).toEqual([]);
  });

  it("uses conservative v1 defaults", async () => {
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result.iterate["ready-delay-minutes"]).toBe(0);
    expect(result.iterate["minimize-comments"]).toBe("bots");
    expect(result.iterate["minimize-approvals"]).toBe(false);
    expect(result.iterate["resolve-other-human-threads"]).toBe("none");
    expect(result["mark-ready"]).toEqual({ auto: true, "blocking-reviewer-logins": [] });
    expect(result.actions).toEqual({
      "auto-minimize-suppressed": true,
      "work-while-queued": false,
    });
  });

  it("returns defaults for empty YAML (yaml.parse returns null)", async () => {
    writeRc("");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().apply["sha-poll-max-attempts"]).toBe(10);
  });
});

describe("loadConfig — overrides", () => {
  it("applies kebab-case keys from the rc file", async () => {
    writeRc(
      [
        "bot-usernames:",
        "  - custom-reviewer",
        "checks:",
        "  ignore:",
        '    - "Kilo*"',
        "  never-ignore:",
        '    - "Final Code Review"',
        "iterate:",
        "  ready-delay-minutes: 10",
        "  minimize-approvals: true",
        "  minimize-comments: all",
        "  resolve-other-human-threads: outdated",
        "mark-ready:",
        "  auto: false",
        "  blocking-reviewer-logins:",
        "    - copilot",
        "actions:",
        "  auto-minimize-suppressed: false",
        "  work-while-queued: true",
        "apply:",
        "  sha-poll-interval-seconds: 0.5",
        "",
      ].join("\n"),
    );
    const loadConfig = await freshLoadConfig();
    const result = loadConfig();
    expect(result["bot-usernames"]).toEqual(["custom-reviewer"]);
    expect(result.checks.ignore).toEqual(["Kilo*"]);
    expect(result.checks["never-ignore"]).toEqual(["Final Code Review"]);
    expect(result.iterate).toMatchObject({
      "ready-delay-minutes": 10,
      "minimize-approvals": true,
      "minimize-comments": "all",
      "resolve-other-human-threads": "outdated",
    });
    expect(result["mark-ready"]).toEqual({ auto: false, "blocking-reviewer-logins": ["copilot"] });
    expect(result.actions).toEqual({
      "auto-minimize-suppressed": false,
      "work-while-queued": true,
    });
    expect(result.apply["sha-poll-interval-seconds"]).toBe(0.5);
  });

  it("overrides a single leaf while keeping sibling defaults", async () => {
    writeRc("apply:\n  sha-poll-max-attempts: 20\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().apply).toEqual({
      "sha-poll-interval-seconds": 2,
      "sha-poll-max-attempts": 20,
    });
  });

  it("replaces arrays outright rather than concatenating", async () => {
    writeRc("checks:\n  ci-trigger-events:\n    - push\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().checks["ci-trigger-events"]).toEqual(["push"]);
  });
});

describe("loadConfig — invalid values", () => {
  it.each([
    [
      "iterate:\n  resolve-other-human-threads: sometimes\n",
      "`iterate.resolve-other-human-threads`",
    ],
    ["iterate:\n  minimize-comments: users\n", "`iterate.minimize-comments`"],
    ["iterate:\n  ready-delay-minutes: -1\n", "`iterate.ready-delay-minutes`"],
    ["iterate:\n  triage-attempts-per-thread: 1.5\n", "`iterate.triage-attempts-per-thread`"],
    ["bot-usernames: custom-reviewer\n", "`bot-usernames`"],
    ["checks:\n  ignore:\n    - Kilo Code Review\n    - false\n", "`checks.ignore[1]`"],
    ["checks:\n  never-ignore:\n    - false\n", "`checks.never-ignore[0]`"],
    ["apply:\n  sha-poll-max-attempts: 0\n", "`apply.sha-poll-max-attempts`"],
    ["mark-ready:\n  auto: yes please\n", "`mark-ready.auto`"],
    ["actions:\n  work-while-queued: 1\n", "`actions.work-while-queued`"],
  ])("rejects %j", async (yaml, path) => {
    writeRc(yaml);
    await expectConfigError(tmpPath(".pr-shepherdrc.yml"), path);
  });

  it("reports every issue in the file at once", async () => {
    writeRc("iterate:\n  minimize-comments: users\n  ready-delay-minutes: -1\n");
    await expectConfigError("`iterate.minimize-comments`", "`iterate.ready-delay-minutes`");
  });

  it("rejects malformed YAML, naming the file", async () => {
    writeRc(":\ninvalid: [\n");
    await expectConfigError(`invalid config in ${tmpPath(".pr-shepherdrc.yml")}`);
  });

  it.each(["- a\n- b\n", "just a string\n"])("rejects a non-mapping top level %j", async (yaml) => {
    writeRawRc(yaml);
    await expectConfigError("the top level must be a mapping");
  });

  it("does not cache a failed load", async () => {
    writeRc("iterate:\n  ready-delay-minutes: -1\n");
    const loadConfig = await freshLoadConfig();
    expect(() => loadConfig()).toThrow("ready-delay-minutes");
    writeRc("iterate:\n  ready-delay-minutes: 3\n");
    expect(loadConfig().iterate["ready-delay-minutes"]).toBe(3);
  });
});

describe("loadConfig — unknown and renamed keys", () => {
  it("names the v1 key for a pre-v1 camelCase key", async () => {
    writeRc("watch:\n  readyDelayMinutes: 5\n");
    await expectConfigError("`watch.readyDelayMinutes` → `iterate.ready-delay-minutes`");
  });

  it("hints every renamed key, including nested and array items", async () => {
    writeRc(
      [
        "ignoreChecks: []",
        "iterate:",
        "  fixAttemptsPerThread: 2",
        "resolve:",
        "  shaPoll:",
        "    intervalMs: 2000",
        "poll:",
        "  quota-warnings:",
        "    - remainingPercent: 20",
        "      interval-factor: 2",
        "",
      ].join("\n"),
    );
    await expectConfigError(
      "`ignoreChecks` → `checks.ignore`",
      "`iterate.fixAttemptsPerThread` → `iterate.triage-attempts-per-thread`",
      "`resolve.shaPoll.intervalMs` → `apply.sha-poll-interval-seconds` (seconds, not milliseconds)",
      "`poll.quota-warnings[0].remainingPercent` → `poll.quota-warnings[].remaining-percent`",
    );
  });

  it("rejects the removed poll.mode key with what to use instead", async () => {
    writeRc("poll:\n  mode: once\n  interval-seconds: 30\n");
    await expectConfigError("`poll.mode` was removed: use `pr-shepherd iterate` for single ticks");
  });

  it("reports an unknown key without a rename as unknown", async () => {
    writeRc("iterate:\n  sparkle: true\nsurprise:\n  nested: 1\n");
    await expectConfigError("unknown key `iterate.sparkle`", "unknown key `surprise`");
  });

  it("does not let a renamed key take effect", async () => {
    writeRc("mergeStatus:\n  blockingReviewerLogins:\n    - copilot\n");
    await expectConfigError(
      "`mergeStatus.blockingReviewerLogins` → `mark-ready.blocking-reviewer-logins`",
    );
  });
});

describe("loadConfig — file discovery", () => {
  it.each([".pr-shepherdrc.yaml", ".pr-shepherd/config.yml", ".pr-shepherd/config.yaml"])(
    "reads %s",
    async (name) => {
      mkdirSync(tmpPath(".pr-shepherd"), { recursive: true });
      writeFileSync(tmpPath(name), "version: 1\niterate:\n  ready-delay-minutes: 4\n");
      const loadConfig = await freshLoadConfig();
      expect(loadConfig().iterate["ready-delay-minutes"]).toBe(4);
    },
  );

  it("rejects two config files in one directory", async () => {
    writeRc("iterate:\n  ready-delay-minutes: 1\n");
    mkdirSync(tmpPath(".pr-shepherd"), { recursive: true });
    writeFileSync(
      tmpPath(".pr-shepherd", "config.yml"),
      "version: 1\niterate:\n  ready-delay-minutes: 2\n",
    );
    const message = await expectConfigError("multiple config files in", "Keep exactly one.");
    expect(message).toContain(tmpPath(".pr-shepherdrc.yml"));
    expect(message).toContain(tmpPath(".pr-shepherd", "config.yml"));
  });

  it("finds rc file in a parent directory when cwd is a nested subdir", async () => {
    writeRc("iterate:\n  triage-attempts-per-thread: 50\n");
    const sub = tmpPath("nested", "deep");
    mkdirSync(sub, { recursive: true });
    process.chdir(sub);
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().iterate["triage-attempts-per-thread"]).toBe(50);
  });
});

describe("loadConfig — caching", () => {
  it("returns the same object reference on repeated calls (no re-parse)", async () => {
    writeRc("iterate:\n  triage-attempts-per-thread: 60\n");
    const loadConfig = await freshLoadConfig();
    const first = loadConfig();
    // Delete the file to prove the second call does not re-read disk
    removeRc();
    const second = loadConfig();
    expect(second).toBe(first);
  });

  it("_resetConfigCache allows fresh load after cache is cleared", async () => {
    writeRc("iterate:\n  triage-attempts-per-thread: 7\n");
    const mod = await import("./load.mts");
    const first = mod.loadConfig();
    expect(first.iterate["triage-attempts-per-thread"]).toBe(7);

    // Update the file then reset the cache so the next call re-reads disk
    writeRc("iterate:\n  triage-attempts-per-thread: 11\n");
    mod._resetConfigCache();
    const second = mod.loadConfig();
    expect(second.iterate["triage-attempts-per-thread"]).toBe(11);
  });
});

describe("resolveConfig", () => {
  it("names the source in validation errors", async () => {
    const { resolveConfig } = await import("./resolve.mts");
    expect(() => resolveConfig({ iterate: { "ready-delay-minutes": "soon" } }, "a test")).toThrow(
      /invalid config in a test:\n {2}- `iterate.ready-delay-minutes`/,
    );
    expect(() => resolveConfig({ sparkle: 1 })).toThrow(
      "invalid config in built-in defaults:\n  - unknown key `sparkle`",
    );
  });
});
