---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

pr-shepherd stack\s+[^\n]*#60[^\n]*--merge-ready
