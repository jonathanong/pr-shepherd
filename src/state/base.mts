import { join } from "node:path";
import { tmpdir } from "node:os";

export function resolveStateBase(): string {
  const envDir = process.env["PR_SHEPHERD_STATE_DIR"];
  return envDir ? envDir : join(tmpdir(), "pr-shepherd-state");
}
