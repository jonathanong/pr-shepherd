import { describe, expect, it } from "vitest";
import { repo, wire } from "../../test-helpers/github/rest-read.test-support.mts";
import { serveSummaryStack } from "../../test-helpers/github/rest-stack-summary.test-support.mts";
import { readRestExplicitSummary } from "./rest-explicit-summary-read.mts";
import { readRestStackSummary } from "./rest-stack-summary.mts";

describe("REST explicit summary viewer sharing", () => {
  it("reads one viewer per chunk without dropping each PR's actual native stack membership", async () => {
    await serveSummaryStack(2);
    const summary = await readRestExplicitSummary([101, 102], repo);
    expect(summary.map((pr) => pr.stack?.number)).toEqual([42, 42]);
    expect(wire.requests.filter(({ path }) => path === "/user")).toHaveLength(1);
    expect(
      wire.requests.filter(({ path }) => path.includes("/stacks?pull_request=101")),
    ).toHaveLength(1);
    expect(
      wire.requests.filter(({ path }) => path.includes("/stacks?pull_request=102")),
    ).toHaveLength(1);
    await readRestExplicitSummary([101, 102], repo);
    expect(wire.requests.filter(({ path }) => path === "/user")).toHaveLength(2);
  });

  it("shares an unknown viewer across stack layers and refreshes that evidence on the next tick", async () => {
    const fixture = await serveSummaryStack(2);
    fixture.viewerLogin = "";
    expect(await readRestStackSummary(101, repo)).toMatchObject({
      viewerLogin: null,
      stackSize: 2,
    });
    expect(wire.requests.filter(({ path }) => path === "/user")).toHaveLength(1);
    fixture.viewerLogin = "AUTHOR";
    expect(await readRestStackSummary(101, repo)).toMatchObject({
      viewerLogin: "AUTHOR",
      stackSize: 2,
    });
    expect(wire.requests.filter(({ path }) => path === "/user")).toHaveLength(2);
  });
});
