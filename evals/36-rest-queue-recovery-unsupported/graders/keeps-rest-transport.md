---
type: llm
focus: last_message
weight: 1
---

The plan's next pr-shepherd tick keeps the original options, including
`--transport rest` and `--merge`.

Passing responses rerun `pr-shepherd … --until-terminal --merge --transport rest`
(in any flag order), or say they rerun "with the same options" as the first tick.

Failing responses rerun pr-shepherd without `--transport rest` (for example with
only `--merge`), or switch to a different transport.
