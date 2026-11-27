---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

pr-shepherd stack\s+(?:["']?owner/repo#62["']?|(?=[^\n]*621(?![0-9]))[^\n]*622)(?![0-9])[^\n]*--merge
