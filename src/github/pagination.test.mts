import { describe, it, expect } from "vitest";
import { paginateForward, paginateBackward, type Connection } from "./pagination.mts";

// ---------------------------------------------------------------------------
// paginateForward
// ---------------------------------------------------------------------------

describe("paginateForward", () => {
  it("collects all nodes across three pages", async () => {
    const pages: Connection<string>[] = [
      { pageInfo: { hasNextPage: true, endCursor: "cursor1" }, nodes: ["a", "b"] },
      { pageInfo: { hasNextPage: true, endCursor: "cursor2" }, nodes: ["c"] },
      { pageInfo: { hasNextPage: false, endCursor: null }, nodes: ["d", "e"] },
    ];
    const cursors: Array<string | null> = [];
    let i = 0;

    const result = await paginateForward((cursor) => {
      cursors.push(cursor);
      return Promise.resolve(pages[i++]!);
    });

    expect(result).toEqual(["a", "b", "c", "d", "e"]);
    expect(cursors).toEqual([null, "cursor1", "cursor2"]);
  });

  it("stops after a single page when hasNextPage is false", async () => {
    let calls = 0;
    const result = await paginateForward(() => {
      calls++;
      return Promise.resolve({
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: ["x", "y"],
      });
    });

    expect(result).toEqual(["x", "y"]);
    expect(calls).toBe(1);
  });

  it("returns an empty array for an empty first page", async () => {
    const result = await paginateForward(() =>
      Promise.resolve({
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [] as string[],
      }),
    );

    expect(result).toEqual([]);
  });

  it("starts from initialCursor to avoid re-fetching the already-known page", async () => {
    // Simulates the batch.mts use case: the initial query already returned page
    // ending at 'cur-first'. paginateForward should start from that endCursor
    // so it only fetches pages *after* it.
    const pages: Record<string, Connection<string>> = {
      "cur-first": {
        pageInfo: { hasNextPage: true, endCursor: "cur-second" },
        nodes: ["c", "d"],
      },
      "cur-second": {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: ["e"],
      },
    };
    const cursors: Array<string | null> = [];

    const result = await paginateForward((cursor) => {
      cursors.push(cursor);
      return Promise.resolve(pages[cursor ?? ""]!);
    }, "cur-first");

    // Should fetch pages after 'cur-first', not re-fetch it.
    expect(cursors).toEqual(["cur-first", "cur-second"]);
    expect(result).toEqual(["c", "d", "e"]);
  });
});

// ---------------------------------------------------------------------------
// paginateBackward
// ---------------------------------------------------------------------------

describe("paginateBackward", () => {
  it("collects nodes across pages and returns oldest-first", async () => {
    // Backward pagination: newest page first, oldest last.
    const pages: Connection<string>[] = [
      { pageInfo: { hasPreviousPage: true, startCursor: "cur1" }, nodes: ["newer", "newest"] },
      { pageInfo: { hasPreviousPage: true, startCursor: "cur2" }, nodes: ["older"] },
      { pageInfo: { hasPreviousPage: false, startCursor: null }, nodes: ["oldest"] },
    ];
    const cursors: Array<string | null> = [];
    let i = 0;

    const result = await paginateBackward((cursor) => {
      cursors.push(cursor);
      return Promise.resolve(pages[i++]!);
    });

    // unshift inserts older pages at the front.
    expect(result).toEqual(["oldest", "older", "newer", "newest"]);
    expect(cursors).toEqual([null, "cur1", "cur2"]);
  });

  it("returns single-page nodes unchanged", async () => {
    const result = await paginateBackward(() =>
      Promise.resolve({
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: ["a", "b"],
      }),
    );

    expect(result).toEqual(["a", "b"]);
  });

  it("starts from initialCursor to avoid re-fetching the already-known page", async () => {
    // Simulates the batch.mts use case: the initial query already returned the
    // "newest" page (cur-newest). paginateBackward should start from that
    // startCursor so it only fetches pages *before* it.
    const pages: Record<string, Connection<string>> = {
      "cur-newest": {
        pageInfo: { hasPreviousPage: true, startCursor: "cur-middle" },
        nodes: ["middle"],
      },
      "cur-middle": {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: ["oldest"],
      },
    };
    const cursors: Array<string | null> = [];

    const result = await paginateBackward((cursor) => {
      cursors.push(cursor);
      return Promise.resolve(pages[cursor ?? ""]!);
    }, "cur-newest");

    // Should fetch pages before 'cur-newest', not re-fetch 'cur-newest' itself.
    expect(cursors).toEqual(["cur-newest", "cur-middle"]);
    expect(result).toEqual(["oldest", "middle"]);
  });
});
