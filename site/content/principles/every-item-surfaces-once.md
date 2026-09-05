---
title: "Every item surfaces at least once"
description: "Outdated, resolved, and minimized review items are never silently dropped — filtering them before the agent sees them discards reviewer intent."
order: 5
docs:
  - path: "CLAUDE.md#comment-visibility-invariant"
    label: "CLAUDE.md — the comment visibility invariant, in full"
  - path: "docs/comments.md"
    label: "comments.md — threads, comments, summaries, seen markers, mutations"
---

# Every item surfaces at least once

A natural design for a review-comment bot is to only show what's still "live" — filter
out anything resolved, outdated, or minimized, and present a clean list of open items. On
a PR that's had real review, that filter throws away information the agent needs:

> Every review thread and PR comment must be surfaced to the agent at least once, even if
> it is outdated, resolved, or minimized. Filtering those out before the agent sees them
> silently discards reviewer intent.

An outdated thread might still describe a real problem the diff moved past without fixing.
A resolved thread records what a human already decided. Dropping either before the agent
ever sees it isn't tidying — it's deleting review history the agent has no other way to
recover.

One scope note: a `COMMENTED` or `APPROVED` review summary that is already minimized
*before* Shepherd ever observes it is filtered out upstream, ahead of the seen-marker
gate — so the at-least-once guarantee below covers active, outdated, resolved, and
later-minimized items, but not a summary that arrived pre-minimized. That gap is
documented as future work, not silently accepted.

## How "at least once" is enforced

Every review thread, comment, and review summary carries a status: `outdated`, `resolved`,
or `minimized`. The first time Shepherd surfaces an item, it writes a small per-item
marker to local state — one file per id, its existence the marker itself. The filename is
the SHA-256 hash of the item's id, not the id itself, so it stays filesystem-safe and
case-collision-free regardless of what GitHub's ID looks like:

```
$PR_SHEPHERD_STATE_DIR/<owner>-<repo>/<pr>/seen/<sha256-of-id>.json
```

The marker's JSON body is intentionally minimal and intentionally open-ended, and carries
the original id so lookups can key off it rather than the hashed filename:

```json
{ "id": "IC_kwDOSGizTs8AAAABSsxwqg", "seenAt": 1732000000, "bodyHash": "3f9a1c2b7e4d5a6f" }
```

`bodyHash` is a truncated SHA-256 of the item's body. On every later fetch, if the
stored hash no longer matches the item's current body, Shepherd re-surfaces it as
**edited** — under a dedicated section, with the original `seenAt` preserved — instead of
treating "already seen" as "nothing left to say."

## Why the format stays this simple

The schema is deliberately non-clever:

> One file per id — file existence is the marker... Do not adopt formats that lock the
> schema (empty touch files, a single shared list).

A single shared list would need locking to be safe under concurrent Shepherd runs on the
same PR; one file per id doesn't. Under a genuine race, the last writer's hash wins — which
is fine, because both writes describe valid current state, and the marker's job is only to
suppress *repetition*, never to gate whether an item was safe to show in the first place.

## The gate this creates, everywhere else

Any code path that would filter threads or comments by `isResolved`, `isOutdated`, or
`isMinimized` has to route through this seen-marker gate before it can suppress anything —
suppression is never allowed to be the first thing that happens to an item. Debounce ticks
follow the same discipline in the other direction: they defer writing seen markers until
the settle window closes, so a comment that arrives mid-debounce isn't marked seen before
the agent-facing result that should have included it.
