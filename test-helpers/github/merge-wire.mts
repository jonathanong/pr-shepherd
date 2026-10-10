import { githubWire } from "./transport-wire.mts";
import type { RestMergeResponse } from "../../src/github/rest-merge.mts";

export const mergeHead = "a".repeat(40);
export const mergeUuid = "630b9d5e-3f2a-4f7e-8b0c-2d5f9a8c1e42";
export const pendingMerge = (): RestMergeResponse => ({
  status: "pending",
  details: {
    message: "Merge request is in progress.",
    uuid: mergeUuid,
    merge_method: "squash",
    merge_action: "direct_merge",
    expected_head_sha: mergeHead,
    bypass_rules: false,
  },
});
export async function mergeWire() {
  const fixture = {
    snapshot: {
      state: "open",
      merged: false,
      draft: false,
      head: { sha: mergeHead },
      merge_commit_sha: "b".repeat(40),
    },
    submitStatus: 202,
    submitBody: pendingMerge(),
    pollStatus: 200,
    pollBody: pendingMerge(),
    failMutation: false,
    mergedOnExpiry: false,
  };
  const wire = await githubWire((request, response) => {
    if (request.path.includes("/stacks?")) {
      response.end("[]");
      return;
    }
    if (request.path.endsWith("/merge-async") && request.method === "PUT") {
      if (fixture.failMutation) {
        response.destroy();
        return;
      }
      response.statusCode = fixture.submitStatus;
      response.end(JSON.stringify(fixture.submitBody));
    } else if (request.path.includes("/merge-async/")) {
      response.statusCode = fixture.pollStatus;
      if (fixture.mergedOnExpiry) fixture.snapshot.merged = true;
      response.end(JSON.stringify(fixture.pollBody));
    } else response.end(JSON.stringify(fixture.snapshot));
  });
  return { ...fixture, wire, fixture };
}
