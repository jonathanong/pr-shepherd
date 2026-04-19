# Shepherd — End-to-End Flow

```mermaid
flowchart TD
  U(["/pr-shepherd:monitor PR"]) --> SC["/pr-shepherd:monitor slash command"]
  SC -->|CronList| EX{Loop exists<br/>for this PR?}
  EX -->|yes| NOW[Run iterate once<br/>inline and act]
  EX -->|no| CREATE[CronCreate:<br/>every 4m,<br/>maxTurns 50,<br/>expires 8h]
  CREATE --> CRON[(cron tick)]
  NOW --> ITER
  CRON --> ITER[pr-shepherd<br/>iterate PR --format=json]

  ITER --> S1{1. last commit<br/>age lt cooldown?}
  S1 -->|yes| A_COOL([action: cooldown])
  S1 -->|no| S2[2. runCheck skipTriage:true autoResolve:true<br/>batch GraphQL + cache bypassed<br/>classify + deriveMergeStatus + autoResolveOutdated<br/>triage deferred to step 4]

  S2 --> S25{2.5 state != OPEN?}
  S25 -->|yes| A_CAN([action: cancel])
  S25 -->|no| S3[3. updateReadyDelay<br/>ready-since.txt]
  S3 --> S3C{shouldCancel?}
  S3C -->|yes| A_CAN
  S3C -->|no| S4{4. CONFLICTS or actionable<br/>threads/comments/CI/reviews?<br/>fix_code handler rebases too}
  S4 -->|yes| S4X[gh run cancel actionable runIds]
  S4X --> A_FIX([action: fix_code<br/>+ fix payload])
  S4 -->|no| S5{5. transient<br/>timeout/infra?}
  S5 -->|yes| S5X[gh run rerun runId --failed]
  S5X --> A_RR([action: rerun_ci])
  S5 -->|no| S6{6. flaky + BEHIND?}
  S6 -->|yes| A_REB([action: rebase])
  S6 -->|no| S7{7. READY + CLEAN<br/>+ isDraft<br/>+ !copilot?}
  S7 -->|yes| S7X[gh pr ready PR]
  S7X --> A_MR([action: mark_ready])
  S7 -->|no| A_W([action: wait])

  A_COOL --> DEC{Cron prompt<br/>acts on action}
  A_CAN --> DEC
  A_REB --> DEC
  A_FIX --> DEC
  A_RR --> DEC
  A_MR --> DEC
  A_W --> DEC

  DEC -->|cancel| STOP["/loop cancel"]
  DEC -->|rebase| REB[git fetch && rebase &&<br/>push --force-with-lease]
  DEC -->|fix_code| FIX[Edit files →<br/>git add + commit →<br/>fetch + rebase + push →<br/>pr-shepherd resolve --require-sha HEAD]
  FIX --> NEXT[Wait for next tick]
  REB --> NEXT
  DEC -->|other| NEXT
  NEXT --> CRON
```
