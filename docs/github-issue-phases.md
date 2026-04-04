# Spec Forge Backlog Skeleton

## Phase 1
- Initialize Node.js CLI workspace and command entrypoint
- Implement root discovery and config loading
- Add global and project config validation
- Implement project initialization command
- Add shared path, slug, version, and artifact naming utilities
- Add structured logging and command execution telemetry

## Phase 2
- Implement provider adapter interface and execution contract
- Add Copilot provider adapter
- Add Claude provider adapter
- Implement provider timeout, retry, and stderr handling
- Add provider availability and working-directory resolution

## Phase 3
- Implement workflow and step schema loading
- Implement step resolution for workflow-or-step CLI input
- Implement prompt template variable resolution
- Implement shared artifact context assembly
- Implement asset lookup and loading for skills, instructions, and knowledge
- Implement output persistence, version creation, and step rerun rules
- Implement structural output validation and invalid-file recovery
- Implement full spec-to-tasks workflow execution

## Phase 4
- Implement sync target discovery and metadata header generation
- Implement sync preview status calculation
- Implement line-diff generation for sync updates
- Implement sync confirmation and .new file handling
- Implement overwrite-safe sync application flow

## Phase 5
- Implement harvest commit filtering and probe matching
- Implement pattern extraction prompt execution
- Implement harvested pattern persistence and normalized-title deduplication
- Implement candidate skill generation and validation
- Implement promote command for candidate skills
- Implement harvest report generation

## Phase 6
- Implement analyze-change artifact loading and version comparison
- Implement change classification for requirements, architecture, and task impact
- Implement markdown output generation for analyze-change
- Implement JSON output generation for analyze-change
- Implement deterministic overwrite behavior for analysis outputs

## Phase 7
- Add unit tests for config, naming, prompt resolution, and validation
- Add integration tests for spec-to-tasks workflow and rerun recovery
- Add integration tests for sync preview, diff, and confirmation flow
- Add integration tests for harvest, promote, and analyze-change commands
- Add Windows-focused provider adapter smoke tests
