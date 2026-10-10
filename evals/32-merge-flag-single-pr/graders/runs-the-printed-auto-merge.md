---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

gh(?:\s|\\\n)+pr(?:\s|\\\n)+merge(?:\s|\\\n)+42(?:\s|\\\n)+--repo(?:\s|\\\n)+owner/repo(?:\s|\\\n)+--match-head-commit(?:\s|\\\n)+abc123(?:\s|\\\n)+--auto(?:\s|\\\n)+--merge
