import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { DENY_REASON, main } from "../../plugins/pr-shepherd/hooks/pipe-guard.mjs";

const SCRIPT = "plugins/pr-shepherd/hooks/pipe-guard.mjs";
const piped = {
  tool_name: "Bash",
  tool_input: { command: "pr-shepherd 1 --until-terminal | tail -40" },
};
const plain = { tool_name: "Bash", tool_input: { command: "pr-shepherd 1 --until-terminal" } };

const run = (input: unknown) =>
  spawnSync("node", [SCRIPT], { input: JSON.stringify(input), encoding: "utf8" });

describe("main", () => {
  it("denies a piped pr-shepherd with one clear reason", () => {
    const { stdout } = main(JSON.stringify(piped));
    expect(JSON.parse(stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: DENY_REASON,
      },
    });
    expect(DENY_REASON).toContain("## Instructions");
  });

  it("allows without parsing when the input lacks pr-shepherd or a pipe", () => {
    expect(main('{"tool_input":{"command":"ls | wc"}}').stdout).toBe("");
    expect(main('{"tool_input":{"command":"pr-shepherd 1"}}').stdout).toBe("");
  });

  it("allows when the name and pipe appear outside the command", () => {
    const input = { cwd: "/work/pr-shepherd|x", tool_input: { command: "ls" } };
    expect(main(JSON.stringify(input)).stdout).toBe("");
  });

  it("allows malformed input", () => {
    expect(main("pr-shepherd | {not json").stdout).toBe("");
  });

  it("allows input with no tool_input", () => {
    expect(main('{"note":"pr-shepherd |"}').stdout).toBe("");
  });
});

describe("hook script", () => {
  const claude = { hook_event_name: "PreToolUse", session_id: "s", cwd: "/repo", ...piped };
  const codex = {
    hook_event_name: "PreToolUse",
    session_id: "s",
    turn_id: "t",
    permission_mode: "default",
    tool_use_id: "u",
    cwd: "/repo",
    ...piped,
  };

  it.each([
    ["Claude Code", claude],
    ["Codex", codex],
  ])("denies on stdin from %s and exits 0", (_host, input) => {
    const result = run(input);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("prints nothing and exits 0 for an unpiped command", () => {
    const result = run({ ...claude, ...plain });
    expect(result).toMatchObject({ status: 0, stdout: "" });
  });
});

describe("hook wiring", () => {
  const entries = (path: string, base: string) => {
    const hooks = JSON.parse(readFileSync(path, "utf8")).hooks.PreToolUse;
    return hooks
      .filter((h: { hooks: { command: string }[] }) =>
        h.hooks[0].command.includes("pipe-guard.mjs"),
      )
      .map((h: { matcher: string; hooks: { command: string }[] }) => [
        h.matcher,
        h.hooks[0].command,
        base,
      ]);
  };

  it("registers a Bash PreToolUse hook for the plugin and the root manifest", () => {
    const plugin = entries("plugins/pr-shepherd/hooks/hooks.json", "hooks");
    const root = entries(".claude-plugin/plugin.json", "plugins/pr-shepherd/hooks");
    expect(plugin).toEqual([
      ["Bash", 'node "${CLAUDE_PLUGIN_ROOT}/hooks/pipe-guard.mjs"', "hooks"],
    ]);
    expect(root).toEqual([
      [
        "Bash",
        'node "${CLAUDE_PLUGIN_ROOT}/plugins/pr-shepherd/hooks/pipe-guard.mjs"',
        "plugins/pr-shepherd/hooks",
      ],
    ]);
  });
});
