// @ts-nocheck
import { describe, it, expect, vi } from "vitest";
import {
  buildSessionHeader,
  formatRequestEntry,
  formatResponseEntry,
  formatOutputEntry,
} from "./session.mts";

describe("formatRequestEntry", () => {
  it("formats a GraphQL request with operation name and variables", () => {
    const out = formatRequestEntry({
      n: 1,
      kind: "GraphQL",
      method: "POST",
      url: "https://api.github.com/graphql",
      body: { query: "query GetViewer { viewer { login } }", variables: { owner: "acme" } },
    });
    expect(out).toContain("### #1 GraphQL request");
    expect(out).toContain("operation: `GetViewer`");
    expect(out).not.toContain("viewer { login }");
    expect(out).toContain('"owner":"acme"');
  });

  it("omits empty variables block for GraphQL", () => {
    const out = formatRequestEntry({
      n: 2,
      kind: "GraphQL",
      method: "POST",
      url: "https://api.github.com/graphql",
      body: { query: "query { viewer { login } }", variables: {} },
    });
    expect(out).not.toContain("variables:");
  });

  it("emits alias count for dynamic documents with no variables", () => {
    const doc = `mutation BulkApply {\n  r0: resolveReviewThread(input: { threadId: "a" }) { thread { isResolved } }\n  r1: resolveReviewThread(input: { threadId: "b" }) { thread { isResolved } }\n}`;
    const out = formatRequestEntry({
      n: 3,
      kind: "GraphQL",
      method: "POST",
      url: "https://api.github.com/graphql",
      body: { query: doc, variables: {} },
    });
    expect(out).toContain("aliases: 2");
    expect(out).not.toContain("variables:");
  });

  it("formats a REST request with body", () => {
    const out = formatRequestEntry({
      n: 3,
      kind: "REST",
      method: "POST",
      url: "https://api.github.com/repos/acme/foo/issues",
      body: { title: "Bug" },
    });
    expect(out).toContain("### #3 REST request — POST");
    expect(out).toContain('"title":"Bug"');
  });

  it("formats a REST request without body as (no body)", () => {
    const out = formatRequestEntry({
      n: 4,
      kind: "REST",
      method: "GET",
      url: "https://api.github.com/repos/acme/foo",
    });
    expect(out).toContain("(no body)");
  });

  it("formats a restText request with no body logged", () => {
    const out = formatRequestEntry({
      n: 5,
      kind: "restText",
      method: "GET",
      url: "https://api.github.com/logs/123",
    });
    expect(out).toContain("### #5 restText request");
    expect(out).toContain("(body omitted: log artifact)");
  });
});
