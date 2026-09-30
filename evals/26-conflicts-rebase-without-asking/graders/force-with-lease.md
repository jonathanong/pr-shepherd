---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

push[^\n]*--force-with-lease
