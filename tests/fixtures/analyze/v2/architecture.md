# Architecture
## Overview
Retry flow with scheduler improvements
## Components
- API
- Worker
- RetryScheduler
## Data Flow
Client -> API -> Scheduler -> Worker
## Key Design Decisions
Use dedicated scheduler component
## Failure Handling
Bounded retries with jitter
## Observability
Retry metrics per endpoint and status
## Risks and Trade-offs
Extra scheduler complexity
