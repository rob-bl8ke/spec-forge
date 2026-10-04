# SpecForge CLI — Plan

## Problem Statement
Build an interactive CLI tool (`specforge`) that guides a developer through the day-shift phase of the SpecForge workflow: from raw idea → Grill Me Q&A → PRD → vertically-sliced GitHub/Markdown issues. Modelled on GitHub Copilot CLI / Claude Code UX. AFK Loop (Ralph) is out of scope for v1.

## Approach
- TypeScript + Node.js monorepo (no separate packages needed for v1)
- Ink (React TUI) for the interactive terminal UI
- Commander.js for subcommand parsing
- Adapter pattern for AI providers (Copilot SDK first; extensible later)
- Adapter pattern for issue exporters (Markdown + GitHub Issues via `gh` CLI)
- Skills are self-contained modules in `src/skills/`; exposed as CLI subcommands AND as an interactive TUI picker when run with no args

---

## Project Structure

```
spec-forge/
├── src/
│   ├── cli/
│   │   ├── index.ts              # Entry: commander setup; TUI picker if no args
│   │   └── commands/
│   │       ├── grill.ts          # `specforge grill`
│   │       ├── prd.ts            # `specforge prd`
│   │       └── issues.ts         # `specforge issues`
│   ├── skills/
│   │   ├── grill-me/
│   │   │   └── index.ts          # Sub-agent explores codebase; Q&A loop
│   │   ├── write-prd/
│   │   │   └── index.ts          # Produces PRD from Grill Me output
│   │   └── prd-to-issues/
│   │       └── index.ts          # Drafts vertically-sliced issues as DAG
│   ├── adapters/
│   │   ├── ai/
│   │   │   ├── types.ts          # AIAdapter interface (prompt, stream, etc.)
│   │   │   └── copilot.ts        # CopilotAIAdapter — GitHub Copilot SDK
│   │   └── issues/
│   │       ├── types.ts          # IssueExporter interface
│   │       ├── markdown.ts       # Writes .md files to ./specforge-issues/
│   │       └── github.ts         # Creates GitHub Issues via `gh` CLI
│   ├── ui/
│   │   └── components/
│   │       ├── SkillPicker.tsx   # Interactive TUI skill picker (Ink)
│   │       ├── QuestionPrompt.tsx# Single Q&A step (Grill Me)
│   │       └── StatusSpinner.tsx # Loading/streaming indicator
│   └── types/
│       └── index.ts              # Shared domain types: PRD, Issue, Question, etc.
├── package.json
├── tsconfig.json
└── .env.example                  # AI provider credentials
```

---

## Tech Stack

| Concern              | Library                      |
| -------------------- | ---------------------------- |
| Language             | TypeScript                   |
| CLI arg parsing      | Commander.js                 |
| TUI / interactive UI | Ink (React for terminal)     |
| AI provider (v1)     | GitHub Copilot SDK           |
| AI adapter interface | Custom `AIAdapter` interface |
| Issue exporter (v1a) | Custom Markdown writer       |
| Issue exporter (v1b) | `gh` CLI (GitHub Issues)     |
| Testing              | Jest + ts-jest               |
| Build                | tsc / tsx for dev            |

---

## Todos (ordered)

### Phase 1 — Scaffold
- [ ] `scaffold-project` — Init package.json, tsconfig, eslint, jest, bin entry
- [ ] `scaffold-types` — Define shared domain types (PRD, Issue, Question, SkillManifest)
- [ ] `scaffold-ai-adapter` — AIAdapter interface + CopilotAIAdapter stub

### Phase 2 — CLI Shell
- [ ] `cli-entry` — Entry point: Commander setup, no-args launches TUI SkillPicker
- [ ] `ui-skill-picker` — Ink SkillPicker component (arrow-key selection of skills)

### Phase 3 — Skills
- [ ] `skill-grill-me` — Grill Me: sub-agent explores codebase, one Q&A at a time with recommendations
- [ ] `skill-write-prd` — Write PRD: takes Grill Me session output, generates structured PRD
- [ ] `skill-prd-to-issues` — PRD to Issues: drafts vertically-sliced issues as DAG (blocking deps)

### Phase 4 — Issue Adapters
- [ ] `adapter-issues-interface` — IssueExporter interface
- [ ] `adapter-markdown` — Writes issues as .md files to `./specforge-issues/`
- [ ] `adapter-github` — Creates GitHub Issues via `gh` CLI

### Phase 5 — Polish
- [ ] `ui-streaming` — Streaming output display (StatusSpinner, streamed AI responses)
- [ ] `tests-unit` — Unit tests for skills, adapters, and types
- [ ] `docs-readme` — README with install, usage, and adding new skills/adapters

---

## Key Decisions

- **Adapter for AI**: `AIAdapter` interface with `ask(prompt): Promise<string>` and `stream(prompt): AsyncIterable<string>` methods. Future adapters: Anthropic, OpenAI.
- **Adapter for issues**: `IssueExporter` interface with `export(issues: Issue[]): Promise<void>`. Future adapters: Jira, Linear.
- **Skills are pure modules**: Each skill takes an `AIAdapter` and returns structured data. The CLI layer handles rendering and I/O.
- **Grill Me sub-agent**: Runs as a separate AI call that summarises the codebase; only the summary is returned to the orchestrator (token efficiency).
- **Grill Me is the interview**: The AI grills the developer with targeted questions (one at a time, with a recommended answer pre-filled). The developer answers/adjusts. `write-prd` does NOT ask further questions — it synthesises from the session output only.
- **Session persistence**: Grill Me writes its output to `specforge-session.json` in the working directory. `write-prd` reads from it. This makes sessions inspectable, resumable, and decoupled.
- **PRD persistence**: `write-prd` produces `specforge-prd.md` in the working directory using Matt Pocock's PRD template (Problem Statement, Solution, User Stories, Implementation Decisions, Testing Decisions, Out of Scope, Further Notes). Developer can edit it before running `prd-to-issues`.
- **Issues as DAG**: Issues have `blockedBy: string[]` field referencing sibling issue slugs (e.g., `setup-database-schema`). Issues are created in dependency order (leaves first). GitHub exporter resolves slugs to issue numbers post-creation; Markdown exporter uses slugs as filenames.
- **AFK Loop (Ralph)**: Out of scope for v1.

## Open Questions (resume here next session)

- How are issue slugs generated — AI-derived from the title, or developer-editable before export?

---

## Out of Scope (v1)
- AFK Implementation Loop (Ralph Loop)
- QA / Code Review automation
- Jira / Linear issue adapters
- Multi-model routing (Sonnet for impl, Opus for review)
