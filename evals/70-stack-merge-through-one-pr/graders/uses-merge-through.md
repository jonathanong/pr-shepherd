---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

pr-shepherd\s+(?:stack\s+[^\n]*--merge-through\s+\S*632(?![0-9])|\S*632(?![0-9])\S*\s+[^\n]*--merge(?![-\w]))
