import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { main, readSmallFile, runGuard } from "../../plugins/pr-shepherd/hooks/poll-guard.mjs";

const SCRIPT = "plugins/pr-shepherd/hooks/poll-guard.mjs";
const LOOP = "until gh pr view 42 --json state | grep -q MERGED; do sleep 60; done";
const bash = (command: string, cwd = "/repo") => ({
  tool_name: "Bash",
  tool_input: { command },
  cwd,
});
const output = (stdout: string) => JSON.parse(stdout).hookSpecificOutput;

describe("runGuard", () => {
  it("adds context and lets the call run by default", () => {
    const result = runGuard(bash(LOOP), {});
    expect(result.code).toBe(0);
    expect(output(result.stdout)).toEqual({
      hookEventName: "PreToolUse",
      additionalContext: expect.stringContaining("custom PR poller"),
    });
  });

  it("blocks with a reason at fail", () => {
    const result = runGuard(bash(LOOP), { PR_SHEPHERD_POLL_GUARD: "fail" });
    expect(output(result.stdout)).toEqual({
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: expect.stringContaining("--until-terminal"),
    });
  });

  it("does nothing when disabled", () => {
    expect(runGuard(bash(LOOP), { PR_SHEPHERD_POLL_GUARD: "disabled" })).toEqual({
      stdout: "",
      stderr: "",
      code: 0,
    });
  });

  it("reads the level from the Claude Code plugin option, with the env var winning", () => {
    const option = { CLAUDE_PLUGIN_OPTION_POLL_GUARD: "fail" };
    expect(output(runGuard(bash(LOOP), option).stdout).permissionDecision).toBe("deny");
    const both = { ...option, PR_SHEPHERD_POLL_GUARD: "disabled" };
    expect(runGuard(bash(LOOP), both).stdout).toBe("");
  });

  it("reports an invalid level without blocking", () => {
    const result = runGuard(bash(LOOP), { PR_SHEPHERD_POLL_GUARD: "strict" });
    expect(result).toEqual({
      stdout: "",
      stderr: expect.stringContaining('got "strict"'),
      code: 1,
    });
  });

  it("lets ordinary commands through", () => {
    expect(runGuard(bash("gh pr view 42"), {}).stdout).toBe("");
    expect(runGuard({ tool_name: "Monitor", tool_input: {} }, {}).stdout).toBe("");
  });

  it("reads scripts relative to the call's cwd and from expanded paths", () => {
    const seen: string[] = [];
    const read = (path: string) => (seen.push(path), "while true; do gh api x; sleep 9; done");
    runGuard(bash("bash wait.sh 1", "/work"), {}, read);
    runGuard(bash("bash $TMPDIR/w.sh"), { TMPDIR: "/t" }, read);
    expect(seen).toEqual(["/work/wait.sh", "/t/w.sh"]);
    expect(runGuard({ tool_input: { command: "./x.sh" } }, {}, () => null).stdout).toBe("");
  });
});

describe("readSmallFile", () => {
  const dir = mkdtempSync(join(tmpdir(), "poll-guard-"));
  it("reads small files only", () => {
    writeFileSync(join(dir, "small.sh"), "echo hi\n");
    writeFileSync(join(dir, "big.sh"), "x".repeat(64 * 1024 + 1));
    expect(readSmallFile(join(dir, "small.sh"))).toBe("echo hi\n");
    expect(readSmallFile(join(dir, "big.sh"))).toBeNull();
    expect(readSmallFile(dir)).toBeNull();
    expect(readSmallFile(join(dir, "missing.sh"))).toBeNull();
  });
});

describe("main", () => {
  it("lets the call run on unreadable input", () => {
    expect(main("not json", {})).toEqual({ stdout: "", stderr: "", code: 0 });
  });

  it("runs as a hook process", () => {
    const run = spawnSync(process.execPath, [SCRIPT], {
      input: JSON.stringify(bash(LOOP)),
      env: { PATH: process.env.PATH, PR_SHEPHERD_POLL_GUARD: "fail" },
      encoding: "utf8",
    });
    expect(run.status).toBe(0);
    expect(output(run.stdout).permissionDecision).toBe("deny");
  });
});

describe("hook registration", () => {
  const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
  const commandOf = (hooks: {
    PreToolUse: Array<{ matcher: string; hooks: Array<{ command: string }> }>;
  }) => {
    const [entry] = hooks.PreToolUse;
    expect(entry.matcher).toBe("Bash|Monitor");
    return entry.hooks[0].command;
  };

  it("points the plugin directory's hooks.json at the script", () => {
    const command = commandOf(readJson("plugins/pr-shepherd/hooks/hooks.json").hooks);
    expect(command).toBe('node "${CLAUDE_PLUGIN_ROOT}/hooks/poll-guard.mjs"');
  });

  it("points the package-root manifest at the script", () => {
    const command = commandOf(readJson(".claude-plugin/plugin.json").hooks);
    expect(command).toBe(`node "\${CLAUDE_PLUGIN_ROOT}/${SCRIPT}"`);
    expect(existsSync(SCRIPT)).toBe(true);
  });

  it("offers the level as a Claude Code plugin option", () => {
    for (const path of [
      ".claude-plugin/plugin.json",
      "plugins/pr-shepherd/.claude-plugin/plugin.json",
    ]) {
      expect(readJson(path).userConfig.poll_guard.default).toBe("advisory");
    }
  });
});
