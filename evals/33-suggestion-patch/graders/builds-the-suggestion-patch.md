---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

build-suggestion-patches(?:[^\S\n]|\\\n)+https://github\.com/owner/repo/pull/42(?:[^\S\n]|\\\n)+--thread-id(?:[^\S\n]|\\\n)+["']?PRRT_suggest["']?(?:[^\S\n]|\\\n)+--message(?:[^\S\n]|\\\n)+(?:"\s*[^"\s][^"]*"|'\s*[^'\s][^']*'|[^\s"']\S*)
