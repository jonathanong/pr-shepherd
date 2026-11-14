---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

pr-shepherd\s+stack\s+(?=[^\n]*631(?![0-9]))(?=[^\n]*632(?![0-9]))[^\n]*--merge-through\s+\S*632(?![0-9])
