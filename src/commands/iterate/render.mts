import type { ResolveCommand } from "../../types.mts";
import { renderShellCommand } from "../../cli/runner.mts";

export { buildFixInstructions } from "./fix-instructions.mts";

/** Render a resolve command as a shell snippet. Appends `--require-sha "$HEAD_SHA"` when set. */
export function renderResolveCommand(rc: ResolveCommand): string {
  const parts = [...rc.argv];
  if (rc.requiresHeadSha) parts.push("--require-sha", "$HEAD_SHA");
  return renderShellCommand(parts);
}
