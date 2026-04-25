import { join } from "node:path";
import { tmpdir } from "node:os";

export function resolveStateBase(): string {
  return process.env["PR_SHEPHERD_STATE_DIR"] ?? join(tmpdir(), "pr-shepherd-state");
}
