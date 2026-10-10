---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

gh(?:[^\S\n]|\\\n)+pr(?:[^\S\n]|\\\n)+merge(?:[^\S\n]|\\\n)+42(?:[^\S\n]|\\\n)+--repo(?:[^\S\n]|\\\n)+owner/repo(?:[^\S\n]|\\\n)+--match-head-commit(?:[^\S\n]|\\\n)+abc123(?:[^\S\n]|\\\n)+--auto(?:[^\S\n]|\\\n)+--merge
