import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

// Each test file gets its own state directory, so derived caches one file writes (such as a
// stack-size hint) never change the reads another file's mocked GitHub sequence expects.
if (!process.env["PR_SHEPHERD_STATE_DIR"]) {
  const directory = mkdtempSync(join(tmpdir(), "shepherd-test-state-"));
  process.env["PR_SHEPHERD_STATE_DIR"] = directory;
  afterAll(() => rmSync(directory, { recursive: true, force: true }));
}
