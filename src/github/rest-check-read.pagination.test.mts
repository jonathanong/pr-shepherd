import { describe, expect, it } from "vitest";
import { wire, serve, repo, prefix } from "../../test-helpers/github/rest-read.test-support.mts";
import { readRestCommitChecks } from "./rest-check-read.mts";
import { resolveRestIdentity } from "./rest-identities.mts";

const check = (id: number) => ({
  id,
  node_id: `CR_${id}`,
  name: `job ${id}`,
  status: "completed",
  conclusion: "success",
  details_url: null,
  started_at: "2026-10-09T00:00:00Z",
  completed_at: "2026-10-09T00:01:00Z",
  check_suite: null,
  output: { title: "success", summary: "success", annotations_count: 0 },
});
describe("REST check matrix pagination", () => {
  it.each([96, 100, 101, 250])(
    "loads all %i actual check runs and records their numeric identities",
    async (count) => {
      await serve((request, response) => {
        const url = new URL(request.path, "https://api.github.com");
        if (url.pathname.endsWith("check-runs")) {
          const page = Number(url.searchParams.get("page") ?? 1);
          expect(url.searchParams.get("per_page")).toBe("100");
          expect(url.searchParams.get("filter")).toBe("latest");
          const start = (page - 1) * 100;
          if (start + 100 < count)
            response.setHeader(
              "link",
              `<https://api.github.com${prefix}/commits/aaa111/check-runs?filter=latest&per_page=100&page=${page + 1}>; rel="next"`,
            );
          response.end(
            JSON.stringify({
              total_count: count,
              check_runs: Array.from({ length: Math.min(100, count - start) }, (_, index) =>
                check(start + index + 1),
              ),
            }),
          );
        } else if (url.pathname.endsWith("check-suites"))
          response.end('{"total_count":0,"check_suites":[]}');
        else if (url.pathname.endsWith("actions/runs"))
          response.end('{"total_count":0,"workflow_runs":[]}');
        else response.end("[]");
      });
      const result = await readRestCommitChecks("aaa111", repo, 101);
      expect(result.nodes).toHaveLength(count);
      expect(result.nodes.at(-1)).toMatchObject({ id: `CR_${count}`, name: `job ${count}` });
      expect(await resolveRestIdentity(`CR_${count}`, "check")).toMatchObject({
        repo,
        pr: 101,
        numericId: String(count),
      });
      expect(wire.requests.filter((request) => request.path.includes("check-runs"))).toHaveLength(
        Math.ceil(count / 100),
      );
    },
  );
  it("rejects counted check pages without their declared total", async () => {
    await serve((request, response) =>
      response.end(JSON.stringify(request.path.includes("check-runs") ? { check_runs: [] } : [])),
    );
    await expect(readRestCommitChecks("aaa111", repo, 101)).rejects.toThrow("total_count");
  });

  it("fails closed when a check has an unknown status instead of treating it as skipped", async () => {
    await serve((request, response) => {
      if (request.path.includes("check-runs"))
        response.end(
          JSON.stringify({ total_count: 1, check_runs: [{ ...check(1), status: "unrecognized" }] }),
        );
      else if (request.path.includes("check-suites"))
        response.end('{"total_count":0,"check_suites":[]}');
      else if (request.path.includes("actions/runs"))
        response.end('{"total_count":0,"workflow_runs":[]}');
      else response.end("[]");
    });
    await expect(readRestCommitChecks("aaa111", repo, 101)).rejects.toThrow(
      "unknown check run status",
    );
  });
});
