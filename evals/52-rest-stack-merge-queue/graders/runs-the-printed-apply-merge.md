---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

pr-shepherd\s+apply\s+merge\s+https://github\.com/owner/repo/pull/342(?![0-9])(?=(?:[^\n;&|]|\\\n)*--transport[=\s]+rest)
