---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

gh run rerun\s+20[0-2](?![0-9])
