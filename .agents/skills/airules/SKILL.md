---
name: airules
description: Use this skill when managing AI rule packs, AGENTS.md, Cursor rules, Copilot instructions, Claude instructions, and .agents/agent state with airules.
---

# airules Skill

## Purpose

Use this skill to maintain AI coding rules through airules.

airules installs reusable rule packs and AgentMD snippets into a repository. Local state is stored under `.agents/agent`.

## Core files

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

## Rules

- Prefer editing `.agents/agent/airules.config.ts` through airules commands.
- Do not manually edit `.agents/agent/airules.lock.json` unless repairing state.
- Preserve user content outside airules managed blocks.
- Use `airules doctor` after modifying installed rules.
- Use `airules diff` before large updates.
- Use `airules remove <pack>` instead of deleting generated files manually.
- Use registry aliases for public packs and pinned sources for reproducible installs.

## Common commands

```bash
airules add <source>
airules update
airules diff
airules doctor
airules remove <pack>
airules search <query>
airules registry list
airules pack validate <pack>
```

## Review checklist

When reviewing an airules repository:

1. Check `.agents/agent/airules.config.ts`.
2. Check `.agents/agent/airules.lock.json`.
3. Check generated targets such as `AGENTS.md`, `.cursor/rules/*.mdc`, `.github/copilot-instructions.md`, and `.agents/skills/*`.
4. Verify managed blocks are not duplicated.
5. Verify remote sources are trusted or pinned.
6. Run `airules doctor` when possible.
