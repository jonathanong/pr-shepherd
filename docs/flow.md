# Shepherd — End-to-End Flow

```mermaid
flowchart TD
  U(["pr-shepherd skill"]) --> ITER[pr-shepherd<br/>iterate PR]

  ITER --> S1[1. runCheck autoResolve:true<br/>batch GraphQL<br/>classify + deriveMergeStatus + autoResolveOutdated]

  S1 --> S15{1.5 state != OPEN?}
  S15 -->|yes| A_CAN([action: cancel])
  S15 -->|no| S2[2. updateReadyDelay<br/>ready-since.txt]
  S2 --> S2C{shouldCancel?}
  S2C -->|yes| A_CAN
  S2C -->|no| S3{3. CONFLICTS or any<br/>failing CI / threads /<br/>comments / reviews?}
  S3 -->|yes| S3X[gh run cancel failing runIds]
  S3X --> A_FIX([action: fix_code<br/>+ fix payload with failedStep/conclusion])
  S3 -->|no| S4{4. READY + CLEAN<br/>+ isDraft<br/>+ !copilot?}
  S4 -->|yes| S4X[gh pr ready PR]
  S4X --> A_MR([action: mark_ready])
  S4 -->|no| A_W([action: wait])

  A_CAN --> DEC{Follow ## Instructions}
  A_FIX --> DEC
  A_MR --> DEC
  A_W --> DEC

  DEC -->|cancel/escalate| STOP["stop"]
  DEC -->|fix_code| FIX[gh run view --log-failed →<br/>rerun or edit+commit →<br/>fetch + rebase + push →<br/>pr-shepherd resolve --require-sha HEAD]
  FIX --> SLEEP[Schedule or sleep 30s-4m,<br/>then rerun]
  DEC -->|other| SLEEP
  SLEEP --> ITER
```
