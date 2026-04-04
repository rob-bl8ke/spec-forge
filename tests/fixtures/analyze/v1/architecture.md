# Architecture
## Overview
Base retry flow
## Components
- API
- Worker
## Data Flow
Client -> API -> Worker
## Key Design Decisions
Use in-process scheduler
## Failure Handling
Bounded retries
## Observability
Retry metrics per endpoint
## Risks and Trade-offs
Extra in-process complexity
