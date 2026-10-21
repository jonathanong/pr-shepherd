/**
 * True when a looping command (the default command, `stack`) runs one tick instead of
 * sleeping: inside a Claude Code cloud session, where the session owns the next wake-up.
 */
export function runsSingleTick(): boolean {
  return process.env["CLAUDE_CODE_REMOTE"] === "true";
}
