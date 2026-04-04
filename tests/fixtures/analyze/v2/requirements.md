# Requirements
## Feature Summary
Retry support with jitter
## Functional Requirements
- Keep retries bounded
- Add jitter to retry backoff
## Non-Functional Requirements
- Preserve latency budget
## Constraints
- No external queue
## Assumptions
- Existing retry hooks are available
## Open Questions
- Should jitter be configurable?
