// @ts-nocheck
/**
 * REST HTTP routes for the REST variant of a test-cases fixture.
 *
 * Under `--transport rest`, every `githubOperation` read that the harness does not mock above
 * the transport (base-behind compare, branch policy, native-stack membership, merged-base
 * lookup) and every REST mutation reaches the global `fetch` stub. The routes answer from the
 * same fixture fields the GraphQL mocks use, so both variants observe the same GitHub state.
 * An unrouted request throws: a permissive stub would let a dropped or GraphQL-only operation
 * pass unnoticed.
 */

export interface StackLayerRow {
  position: number;
  pullRequest: {
    number: number;
    state: string;
    headRefName: string;
    headRefOid: string;
    baseRefName: string;
    baseRefOid: string;
  };
}

/** Bottom-to-top native-stack rows shared by the GraphQL and REST stack mocks. */
export function stackLayerRows(
  batchData: Record<string, any>,
  anchor: number,
  stackTopology?: unknown[],
): StackLayerRow[] {
  if (stackTopology) return stackTopology as StackLayerRow[];
  const stack = batchData.stack ?? { number: 1, size: 1, position: 1, baseRefName: "main" };
  const layers = Array.from({ length: stack.size }, (_, index) => {
    const position = index + 1;
    return {
      position,
      number: position === stack.position ? anchor : 1000 + position,
      headRefName: `layer-${position}`,
      headRefOid: String(position).repeat(40).slice(0, 40),
    };
  });
  return layers.map((layer, index) => {
    const parent = index === 0 ? null : layers[index - 1];
    return {
      position: layer.position,
      pullRequest: {
        number: layer.number,
        state: "OPEN",
        headRefName: layer.headRefName,
        headRefOid: layer.headRefOid,
        baseRefName: parent ? parent.headRefName : stack.baseRefName,
        baseRefOid: parent ? parent.headRefOid : "c".repeat(40),
      },
    };
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function restPull(owner: string, repo: string, row: StackLayerRow["pullRequest"]) {
  return {
    id: row.number,
    node_id: `PR_${row.number}`,
    number: row.number,
    title: `PR ${row.number}`,
    body: null,
    html_url: `https://github.com/${owner}/${repo}/pull/${row.number}`,
    state: row.state === "OPEN" ? "open" : "closed",
    merged_at: row.state === "MERGED" ? "2026-09-20T12:00:00Z" : null,
    draft: false,
    mergeable: true,
    mergeable_state: "clean",
    updated_at: "2026-09-20T12:00:00Z",
    user: { login: "author", type: "User" },
    head: { ref: row.headRefName, sha: row.headRefOid, repo: { full_name: `${owner}/${repo}` } },
    base: { ref: row.baseRefName, sha: row.baseRefOid },
    requested_reviewers: [],
    requested_teams: [],
  };
}

/** Build the fetch handler for one fixture's REST variant. */
export function restRoutesForFixture(fixture, batchData: Record<string, any>) {
  const { owner, name } = fixture.repository ?? { owner: "owner", name: "repo" };
  const prefix = `/repos/${owner}/${name}`;
  const anchor = batchData.number;
  // Mirror the GraphQL stack mock, including its single-layer default stack.
  const stack = batchData.stack ?? { number: 1, baseRefName: "main" };
  let rows = stackLayerRows(batchData, anchor, fixture.stackTopology);
  const restStack = () => ({
    number: stack.number,
    node_id: `stack-${stack.number}`,
    base: { ref: stack.baseRefName },
    pull_requests: rows.map((row) => ({ number: row.pullRequest.number })),
  });
  return (url: string, method: string): Response => {
    const parsed = new URL(url);
    const path = parsed.pathname;
    const error = fixture.restErrorResponses?.[path];
    if (error) return json(error.body, error.status);
    if (fixture.restResponses && path in fixture.restResponses) {
      return json(fixture.restResponses[path]);
    }
    if (method === "POST" && /\/actions\/runs\/\d+\/cancel$/.test(path)) {
      return fixture.cancelRunsFail
        ? new Response("Cannot cancel a workflow run that is completed", { status: 409 })
        : json({}, 202);
    }
    if (method === "POST" && path === `${prefix}/pulls/${anchor}/ccr/ready_for_review`) {
      // REST cannot read the capability, so GitHub's response carries the fixture's denial.
      return batchData.viewerAuthorization?.viewerCanUpdate === false
        ? json({ message: "Must have push access to repository" }, 403)
        : json({ draft: false });
    }
    if (method === "GET" && path === "/user") {
      return json({ message: "Resource not accessible by integration" }, 403);
    }
    if (method === "GET" && path.startsWith(`${prefix}/compare/`)) {
      return json({ behind_by: fixture.baseBehindBy ?? 0 });
    }
    // Branch summary read before `/protection`; consistent with the unprotected 404 below.
    const branch = path.match(new RegExp(`^${prefix}/branches/([^/]+)$`));
    if (method === "GET" && branch) {
      return json({
        name: decodeURIComponent(branch[1]),
        commit: { sha: batchData.baseRefOid ?? "base000" },
        protection: { enabled: false },
      });
    }
    if (method === "GET" && /\/branches\/[^/]+\/protection$/.test(path)) {
      return json({ message: "Branch not protected" }, 404);
    }
    if (method === "GET" && path.startsWith(`${prefix}/rules/branches/`)) {
      return json([]);
    }
    if (method === "GET" && path === `${prefix}/stacks`) {
      const member = Number(parsed.searchParams.get("pull_request"));
      rows = stackLayerRows(batchData, member, fixture.stackTopology);
      return json([restStack()]);
    }
    if (method === "GET" && path === `${prefix}/stacks/${stack.number}`) {
      return json(restStack());
    }
    if (method === "GET" && path === `${prefix}/pulls` && parsed.searchParams.get("state")) {
      return json(
        (fixture.mergedBasePullRequests ?? []).map((pull) => ({
          number: pull.number,
          html_url: pull.url,
          state: "closed",
          merged_at: pull.mergedAt,
          head: {
            ref: pull.headRefName,
            sha: pull.headRefOid,
            repo: { full_name: pull.headRepository.nameWithOwner },
          },
          base: { ref: pull.baseRefName },
        })),
      );
    }
    const pull = path.match(new RegExp(`^${prefix}/pulls/(\\d+)$`));
    if (method === "GET" && pull) {
      const row = rows.find((candidate) => candidate.pullRequest.number === Number(pull[1]));
      if (row) return json(restPull(owner, name, row.pullRequest));
    }
    throw new Error(`Unrouted REST request in fixture REST variant: ${method} ${url}`);
  };
}
