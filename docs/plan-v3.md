## Plan: Spec Review Before Backlog

Assess the current spec-forge v0.3 specification for backlog readiness, identify blocking ambiguities and inconsistencies, and lock the minimum set of product and engineering decisions before generating GitHub tasks. Recommended approach: keep the core `spec-to-tasks` flow as the backbone, then explicitly decide which adjacent commands stay in MVP versus move to later phases so the backlog reflects a coherent first release.

**Steps**
1. Review the current specification in [docs/spec-v1.md](docs/spec-v1.md) for undefined behaviors in versioning, reruns, workflow execution, prompt composition, sync, harvest, and change analysis.
2. Normalize terminology and contracts that currently mix step IDs, variable names, output file names, and asset IDs so implementation tasks map cleanly to one data model.
3. Lock the missing operational decisions before estimation: runtime choice, provider strategy, `init` behavior, non-interactive overwrite behavior, asset lookup rules, and partial-failure state handling.
4. Split backlog work into phases with explicit dependencies:
   Phase 1: CLI/config foundation plus provider abstraction
   Phase 2: `spec-to-tasks` workflow execution, prompt resolution, artifact persistence, and validation
   Phase 3: sync command and overwrite/review UX
   Phase 4: harvest plus candidate skill promotion
   Phase 5: analyze-change output generation
5. Define verification gates for each phase so issue creation includes test expectations, not just coding tasks.

**Relevant files**
- `c:\Code\rob-bl8ke\spec-forge\docs\spec-v1.md` — authoritative v0.3 spec under review for ambiguity, consistency, and backlog-readiness

**Verification**
1. Confirm every CLI command in the spec has defined inputs, outputs, failure behavior, and persisted artifacts.
2. Confirm every config field and workflow field has clear semantics, validation expectations, and lookup rules.
3. Confirm no backlog item depends on undefined UX choices, hidden file formats, or unresolved provider/runtime assumptions.

**Decisions**
- Included: pre-backlog specification review, ambiguity identification, inconsistency identification, and decision checklist for backlog generation.
- Excluded: implementation, direct spec edits, and creation of GitHub issues.
- Confirmed with user: target the full v0.3 CLI surface in the first backlog, use Node.js, support both Copilot and Claude providers in the first build, allow downstream-only single-step reruns, and include both preview output and line-level diff UX for overwrite flows.
- New v0.4 refinement closes most earlier blockers by defining prompt assembly, explicit step execution, downstream-only reruns, asset lookup paths, `init`, harvest commit-window semantics, analyze-change persistence, naming normalization, sync confirmation flow, and invalid-output recovery.
- v0.5 closes the remaining contract-edge gaps by making `user_input` template-only, using one shared artifact context section, narrowing silent-overwrite rules, making analyze-change non-destructive to source artifacts, replacing fuzzy harvest dedupe with normalized exact-title match, defining exact `init` file contents, and defining stop-on-first-failure workflow behavior with preserved prior outputs.
- Remaining items are now implementation choices rather than spec blockers: provider CLI environment validation on Windows, diff library/format choice, config validation implementation style, and CLI root/bootstrap expectations if commands are run outside the spec-forge root.
- Recommendation: the spec is now backlog-ready. Build the GitHub task list around shared foundations first, then command-specific slices: CLI/config bootstrap, provider adapters, workflow engine, sync, harvest/promote, and analyze-change.

**Further Considerations**
1. Lock the exact `init` command output and project file layout so config/bootstrap tasks are estimable.
2. Lock asset lookup rules for `skills`, `instructions`, and `knowledge` IDs so sync and workflow tasks can share one resolution model.
3. Lock non-interactive overwrite semantics now if you expect automated usage later, otherwise keep the first task list explicitly local-interactive only.
