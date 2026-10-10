import { serve, pull, prefix } from "./rest-read.test-support.mts";

export async function serveSummaryStack(size = 10) {
  const stack = {
    number: 42,
    node_id: "S_42",
    base: { ref: "main" },
    pull_requests: Array.from({ length: size }, (_, index) => ({ number: 101 + index })),
  };
  const fixture = {
    stack,
    settings: { allow_merge_commit: true, allow_squash_merge: true, allow_rebase_merge: false },
    viewerLogin: "AUTHOR",
    rules: [] as Array<{ type: string; parameters: null }>,
    finalHeadDrift: false,
    finalStateDrift: false,
    finalAutoMergeDrift: false,
    finalBaseRefDrift: false,
    sameBase: false,
    membershipDrift: false,
    membershipOrderDrift: false,
    reads: new Map<number, number>(),
    stackReads: 0,
  };
  await serve((request, response) => {
    const path = request.path.split("?")[0]!;
    let body: unknown = [];
    if (path === "/user") body = { login: fixture.viewerLogin };
    else if (path === `${prefix}/stacks`) body = [stack];
    else if (path === `${prefix}/stacks/42`) {
      fixture.stackReads++;
      body =
        fixture.membershipDrift && fixture.stackReads > 1
          ? { ...stack, pull_requests: stack.pull_requests.slice(0, -1) }
          : fixture.membershipOrderDrift && fixture.stackReads > 1
            ? { ...stack, pull_requests: [...stack.pull_requests].reverse() }
            : stack;
    } else if (/\/pulls\/\d+$/.test(path)) {
      const number = Number(path.split("/").at(-1));
      const position = number - 101;
      const read = (fixture.reads.get(number) ?? 0) + 1;
      fixture.reads.set(number, read);
      const final = read % 3 === 0;
      body = {
        ...pull,
        id: 100000 + number,
        node_id: `PR_${number}`,
        number,
        html_url: `https://github.com/octocat/hello-world/pull/${number}`,
        head: {
          ...pull.head,
          ref: `layer-${position + 1}`,
          sha: fixture.finalHeadDrift && final ? "f".repeat(40) : sha(position + 1),
        },
        base: fixture.sameBase
          ? { ref: "main", sha: sha(0) }
          : {
              ref:
                fixture.finalBaseRefDrift && final
                  ? "renamed-base"
                  : position === 0
                    ? "main"
                    : `layer-${position}`,
              sha: sha(position),
            },
        mergeable_state: fixture.finalStateDrift && final ? "blocked" : "clean",
        auto_merge:
          fixture.finalAutoMergeDrift && final
            ? { merge_method: "squash", enabled_by: { login: "author" } }
            : null,
      };
    } else if (path === prefix) body = fixture.settings;
    else if (path.endsWith("check-runs")) body = { total_count: 0, check_runs: [] };
    else if (path.endsWith("check-suites")) body = { total_count: 0, check_suites: [] };
    else if (path.endsWith("actions/runs")) body = { total_count: 0, workflow_runs: [] };
    else if (path.includes("/compare/")) body = { behind_by: 0 };
    else if (path.endsWith("/protection")) {
      response.statusCode = 404;
      body = { message: "Branch not protected" };
    } else if (path.includes("/rules/branches/")) body = fixture.rules;
    response.end(JSON.stringify(body));
  });
  return fixture;
}

function sha(position: number): string {
  return String(position).padStart(40, "0");
}
