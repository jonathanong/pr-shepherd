import { describe, expect, it } from "vitest";
import { fixture, matches, variant } from "../../../test-helpers/standard-rule-variants.mts";

describe("passing scanner report edges", () => {
  const snyk = fixture("snyk-no-issues");
  const header = snyk.body.split("\n")[0]!;

  it("keeps a bare Snyk header or a header without a table visible", () => {
    expect(matches(snyk, header)).toEqual([]);
    expect(matches(snyk, `${header}\n\nNo scans ran.`)).toEqual([]);
    expect(matches(snyk, variant(snyk.body, `${header}\n\n`, `${header}\nNote.\n`))).toEqual([]);
  });

  it("keeps a Snyk table with a broken separator or no rows visible", () => {
    expect(matches(snyk, variant(snyk.body, "|---|---|", "|-|-|"))).toEqual([]);
    const [head, separator] = snyk.body.split("\n").slice(2, 4);
    expect(matches(snyk, `${header}\n\n${head}\n${separator}`)).toEqual([]);
  });

  it("accepts a Snyk summary without the IDE-plugin footer", () => {
    const body = snyk.body.slice(0, snyk.body.indexOf("\n\n:computer:"));
    expect(matches(snyk, body)).toEqual(["snyk-no-issues"]);
  });

  const sonar = fixture("sonarqube-gate-passed");

  it("keeps a SonarQube header without the analysis link visible", () => {
    expect(matches(sonar, sonar.body.split("\n")[0]!)).toEqual([]);
  });

  it("accepts non-zero accepted issues but not a failed metric icon", () => {
    expect(
      matches(sonar, variant(sonar.body, "[0 Accepted issues]", "[3 Accepted issues]")),
    ).toEqual(["sonarqube-gate-passed"]);
    const failed = variant(
      sonar.body,
      "passed-16px.png '') [0.0% Coverage",
      "failed-16px.png '') [0.0% Coverage",
    );
    expect(matches(sonar, failed)).toEqual([]);
  });

  it("keeps an unknown SonarQube metric line visible", () => {
    const body = variant(sonar.body, "Measures  \n", "Measures  \nSomething new  \n");
    expect(matches(sonar, body)).toEqual([]);
  });

  it("accepts a Dependency Review pass without the Scorecard clause", () => {
    const review = fixture("dependency-review-no-files");
    const body = variant(review.body, " or OpenSSF Scorecard issues found.", " found.");
    expect(matches(review, body)).toEqual(["dependency-review-no-issues"]);
  });
});
