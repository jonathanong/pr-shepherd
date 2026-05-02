export type AgentRuntime = "claude" | "codex";

export function detectAgentRuntime(
  env: Partial<Record<"AGENT" | "CODEX_CI", string | undefined>> = process.env,
): AgentRuntime {
  if (env.AGENT?.trim().toLowerCase() === "codex") return "codex";
  if (env.CODEX_CI === "1") return "codex";
  return "claude";
}
