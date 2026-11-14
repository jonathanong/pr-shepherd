---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

pr-shepherd stack\s+(?:"?owner/repo#61"?|(?=[^\n]*611(?![0-9]))(?=[^\n]*612(?![0-9]))[^\n]*613)(?![0-9])[^\n]*--merge
