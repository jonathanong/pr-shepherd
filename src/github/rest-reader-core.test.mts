import { describe, expect, it } from "vitest";
import {
  wire,
  serve,
  nextLink,
  prefix,
} from "../../test-helpers/github/rest-read.test-support.mts";
import { readRestPages, restObject, restArray } from "./rest-reader-core.mts";
describe("REST complete pagination", () => {
  it.each([96, 100, 101, 250])(
    "reads all %i items with per_page=100 and Link pagination",
    async (count) => {
      await serve((request, response) => {
        const url = new URL(request.path, "https://api.github.com");
        const page = Number(url.searchParams.get("page") ?? 1);
        expect(url.searchParams.get("per_page")).toBe("100");
        const start = (page - 1) * 100;
        if (start + 100 < count)
          response.setHeader("link", nextLink(`${prefix}/issues/101/comments`, page + 1));
        response.end(
          JSON.stringify(
            Array.from({ length: Math.min(100, count - start) }, (_, i) => ({ id: start + i + 1 })),
          ),
        );
      });
      const result = await readRestPages(`${prefix}/issues/101/comments`);
      expect(result.nodes).toHaveLength(count);
      expect(wire.requests).toHaveLength(Math.ceil(count / 100));
    },
  );
  it("rejects a missing last page despite total_count", async () => {
    await serve((_request, response) =>
      response.end(
        JSON.stringify({
          total_count: 101,
          check_runs: Array.from({ length: 100 }, (_, id) => ({ id })),
        }),
      ),
    );
    await expect(
      readRestPages(`${prefix}/commits/sha/check-runs`, (body) =>
        restArray(restObject(body, "runs").check_runs, "runs"),
      ),
    ).rejects.toThrow("100 of 101");
  });
  it("rejects foreign Link targets", async () => {
    await serve((_request, response) => {
      response.setHeader("link", '<https://attacker.example/steal?per_page=100>; rel="next"');
      response.end("[{}]");
    });
    await expect(readRestPages(`${prefix}/issues/101/comments`)).rejects.toThrow(
      "unsafe pagination",
    );
    expect(wire.requests).toHaveLength(1);
  });

  it("rejects a repeated next page instead of returning duplicate or partial data", async () => {
    await serve((_request, response) => {
      response.setHeader("link", nextLink(`${prefix}/issues/101/comments`, 2));
      response.end('[{"id":1}]');
    });
    await expect(readRestPages(`${prefix}/issues/101/comments`)).rejects.toThrow(
      "pagination cycle",
    );
    expect(wire.requests).toHaveLength(2);
  });
  it("bounds nested REST reads to four active HTTP requests", async () => {
    const held: Array<Parameters<Parameters<typeof serve>[0]>[1]> = [];
    let active = 0;
    let maximum = 0;
    let released = false;
    let reachedFour: () => void;
    const fourStarted = new Promise<void>((resolve) => {
      reachedFour = resolve;
    });
    await serve((_request, response) => {
      active++;
      maximum = Math.max(maximum, active);
      if (released) {
        active--;
        response.end("[]");
      } else {
        held.push(response);
        if (held.length === 4) reachedFour();
      }
    });
    const pending = Promise.all(
      Array.from({ length: 11 }, (_, index) =>
        readRestPages(`${prefix}/issues/${index + 1}/comments`),
      ),
    );
    await fourStarted;
    expect(active).toBe(4);
    released = true;
    for (const response of held) {
      active--;
      response.end("[]");
    }
    const results = await pending;
    expect(results).toHaveLength(11);
    expect(maximum).toBe(4);
  });
});
