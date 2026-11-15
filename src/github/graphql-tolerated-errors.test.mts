import { describe, expect, it } from "vitest";
import { withoutToleratedErrors } from "./graphql-tolerated-errors.mts";

const IP_ALLOW_LIST =
  "Although you appear to have the correct authorization credentials, the `cursor` organization has an IP allow list enabled, and your IP address is not permitted to access this resource.";

describe("withoutToleratedErrors", () => {
  it("passes through no errors", () => {
    expect(withoutToleratedErrors(undefined)).toBeUndefined();
    expect(withoutToleratedErrors([])).toEqual([]);
  });

  it("drops an unreadable check-suite app", () => {
    const path = ["repository", "pullRequest", "commits", "nodes", 0, "commit"];
    expect(
      withoutToleratedErrors([
        { message: IP_ALLOW_LIST, path: [...path, "checkSuites", "nodes", 1, "app"] },
      ]),
    ).toBeUndefined();
  });

  it("drops it at the start of a path too", () => {
    expect(
      withoutToleratedErrors([{ message: "x", path: ["checkSuites", "nodes", 0, "app"] }]),
    ).toBeUndefined();
  });

  it("keeps errors elsewhere, without a path, or below the app", () => {
    const kept = [
      { message: "no path" },
      { message: "suite", path: ["repository", "checkSuites", "nodes", 1] },
      { message: "slug", path: ["checkSuites", "nodes", 1, "app", "slug"] },
      { message: "other app", path: ["repository", "pullRequest", "app"] },
      { message: "string path", path: "checkSuites.nodes.1.app" },
    ];
    const tolerated = { message: "app", path: ["checkSuites", "nodes", 2, "app"] };
    expect(withoutToleratedErrors([...kept, tolerated])).toEqual(kept);
  });
});
