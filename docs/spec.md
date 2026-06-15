# airules Specification

airules is an AI rules pack manager for coding agents.

It installs reusable AI coding rules into repository-level agent instruction targets such as:

- `AGENTS.md`
- `CLAUDE.md`
- `.cursor/rules/*.mdc`
- `.github/copilot-instructions.md`
- `.agents/skills/*`
- `docs/ai/*`

## Goals

- Keep reusable AI rules in versioned packs.
- Install rules safely through managed blocks or managed files.
- Preserve user-authored content.
- Track installed content in `.agents/agent/airules.lock.json`.
- Support local, GitHub, npm, registry alias, and AgentMD snippet sources.

## Local state

```txt
.agents/
├── agent/
│   ├── airules.config.ts
│   ├── airules.lock.json
│   ├── cache/
│   └── staged/
└── skills/
    └── airules/
        └── SKILL.md
```

## Source kinds

```txt
./packs/react-shadcn
local:./packs/react-shadcn
github:baicie/ai-rules/packs/react-shadcn#v0.1.0
npm:@baicie/airules-react-shadcn@0.1.0
shadcn
@baicie/react-shadcn
agents/code-splitting
```

## Install modes

- `modules`: concatenate markdown modules.
- `template`: render a template with variables and blocks.
- `file`: copy one file.
- `directory`: copy one directory.

## Merge strategies

- `managed-block`
- `overwrite-managed`
- `skip-if-exists`
- `manual`

## Safety

airules must not execute pack scripts by default. Remote sources should be trusted or pinned. User content outside managed blocks must be preserved.
