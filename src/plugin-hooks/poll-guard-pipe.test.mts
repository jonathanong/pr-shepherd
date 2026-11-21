import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { PIPE_DENY_REASON, main, runGuard } from "../../plugins/pr-shepherd/hooks/poll-guard.mjs";

const SCRIPT = "plugins/pr-shepherd/hooks/poll-guard.mjs";
const PIPED = "pr-shepherd 1 --until-terminal | tail -40";
const LOOP = "until gh pr view 42 --json state | grep -q MERGED; do sleep 60; done";
const bash = (command: string) => ({ tool_name: "Bash", tool_input: { command }, cwd: "/repo" });
const deny = {
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: PIPE_DENY_REASON,
  },
};

describe("piped pr-shepherd", () => {
  it("denies with one clear reason", () => {
    const result = runGuard(bash(PIPED), {});
    expect(result).toMatchObject({ stderr: "", code: 0 });
    expect(JSON.parse(result.stdout)).toEqual(deny);
    expect(PIPE_DENY_REASON).toContain("## Instructions");
    expect(PIPE_DENY_REASON).toContain("exit code");
  });

  it.each(["pr-shepherd 1 > out.txt", "npx pr-shepherd 1 --until-terminal &> out.txt"])(
    "denies a redirect: %s",
    (command) => {
      expect(JSON.parse(runGuard(bash(command), {}).stdout)).toEqual(deny);
    },
  );

  it.each([
    "pr-shepherd 1 2>/dev/null",
    "pr-shepherd 1 2>&1",
    "pr-shepherd --help | head",
    "pr-shepherd --version > v.txt",
  ])("lets stderr-only and --help/--version through: %s", (command) => {
    expect(runGuard(bash(command), { PR_SHEPHERD_POLL_GUARD: "disabled" }).stdout).toBe("");
  });

  it.each(["disabled", "advisory", "fail", "strict"])("denies at poll level %s", (level) => {
    const result = runGuard(bash(PIPED), { PR_SHEPHERD_POLL_GUARD: level });
    expect(JSON.parse(result.stdout)).toEqual(deny);
    expect(result.code).toBe(0);
  });

  it("applies to Bash only; Monitor stays on the poll path", () => {
    const monitor = { tool_name: "Monitor", tool_input: { command: PIPED } };
    expect(runGuard(monitor, { PR_SHEPHERD_POLL_GUARD: "disabled" }).stdout).toBe("");
  });

  it("lets unpiped, unrelated and malformed commands fall through", () => {
    const off = { PR_SHEPHERD_POLL_GUARD: "disabled" };
    for (const command of ["pr-shepherd 1", "ls | wc -l", "echo 'pr-shepherd | x'"]) {
      expect(runGuard(bash(command), off).stdout).toBe("");
    }
    expect(runGuard({ tool_name: "Bash", tool_input: {} }, off).stdout).toBe("");
  });

  it("still flags pollers", () => {
    expect(runGuard(bash(LOOP), {}).stdout).toContain("custom PR poller");
  });

  it("allows malformed input", () => {
    expect(main("pr-shepherd | {not json", {}).stdout).toBe("");
  });
});

describe("hook process", () => {
  const base = { hook_event_name: "PreToolUse", session_id: "s", cwd: "/repo" };
  const codex = { turn_id: "t", permission_mode: "default", tool_use_id: "u" };
  const run = (input: unknown) =>
    spawnSync(process.execPath, [SCRIPT], {
      input: JSON.stringify(input),
      env: { PATH: process.env.PATH },
      encoding: "utf8",
    });

  it.each([
    ["Claude Code", base],
    ["Codex", { ...base, ...codex }],
  ])("denies on stdin from %s and exits 0", (_host, extra) => {
    const result = run({ ...extra, ...bash(PIPED) });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(deny);
  });

  it("prints nothing for an unpiped command", () => {
    expect(run({ ...base, ...bash("pr-shepherd 1 --until-terminal") })).toMatchObject({
      status: 0,
      stdout: "",
    });
  });
});
