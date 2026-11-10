import { describe, expect, it } from "vitest";
import {
  authTargetFromGraphqlVars,
  authTargetFromRestPath,
  currentAuthTarget,
  runWithAuthScope,
  setAuthTarget,
} from "./auth-target.mts";

describe("auth target derivation", () => {
  it("reads owner and repo from a REST path", () => {
    expect(authTargetFromRestPath("/repos/Acme/widgets/pulls/1?x=1")).toEqual({
      owner: "Acme",
      repo: "widgets",
    });
    expect(authTargetFromRestPath("/user")).toBeUndefined();
    expect(authTargetFromRestPath("/rate_limit")).toBeUndefined();
  });

  it("reads owner with repo or name from GraphQL variables", () => {
    expect(authTargetFromGraphqlVars({ owner: "a", repo: "b" })).toEqual({ owner: "a", repo: "b" });
    expect(authTargetFromGraphqlVars({ owner: "a", name: "b" })).toEqual({ owner: "a", repo: "b" });
    expect(authTargetFromGraphqlVars({ owner: "a" })).toBeUndefined();
    expect(authTargetFromGraphqlVars({ owner: 1, repo: "b" })).toBeUndefined();
    expect(authTargetFromGraphqlVars({ id: "PR_x" })).toBeUndefined();
  });
});

describe("auth scope", () => {
  it("has no target outside a scope and ignores writes there", () => {
    setAuthTarget({ owner: "a", name: "b" }, "explicit");
    expect(currentAuthTarget()).toBeUndefined();
  });

  it("lets an explicit target win over the checkout, whatever the order", async () => {
    await runWithAuthScope(async () => {
      setAuthTarget({ owner: "cwd", name: "repo" }, "inferred");
      expect(currentAuthTarget()).toEqual({ owner: "cwd", repo: "repo" });
      setAuthTarget({ owner: "named", name: "repo" }, "explicit");
      setAuthTarget({ owner: "cwd2", name: "repo" }, "inferred");
      expect(currentAuthTarget()).toEqual({ owner: "named", repo: "repo" });
    });
  });

  it("isolates concurrent scopes", async () => {
    const seen = await Promise.all(
      ["one", "two"].map((owner) =>
        runWithAuthScope(async () => {
          setAuthTarget({ owner, name: "r" }, "explicit");
          await new Promise((resolve) => setTimeout(resolve, owner === "one" ? 10 : 1));
          return currentAuthTarget()?.owner;
        }),
      ),
    );
    expect(seen).toEqual(["one", "two"]);
  });
});
