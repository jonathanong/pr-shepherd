---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

pr-shepherd\b(?=[^\n;&|]*\biterate\b)(?=[^\n;&|]*\b41\b)
