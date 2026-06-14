---
name: airules
description: Use this skill when managing, installing, updating, reviewing, or authoring AI rule packs for a repository with airules.
---

# airules Skill

## Purpose

Use this skill to manage AI coding rules through the airules system.

airules is a rule pack manager for coding agents. It installs reusable rule modules, generated blocks, direct files, and skills into a target repository. Local configuration and lock state live under `.agents/agent`.

## Core directories

```txt
.agents/
├── agent/
│   ├── airules.config.ts
│   ├── airules.lock.json
│   ├── cache/
│   ├── staged/
│   └── state.json
└── skills/
    └── <skill-name>/
        └── SKILL.md
```

## Config lookup order

```txt
.agents/agent/airules.config.ts
.agents/agent/airules.config.mts
.agents/agent/airules.config.cts
.agents/agent/airules.config.js
.agents/agent/airules.config.mjs
.agents/agent/airules.config.cjs
.agents/agent/airules.config.json
```

## Pack concepts

An airules pack may contain four install modes:

1. `modules`
   - Concatenate markdown modules in order.
   - Best for AGENTS.md and CLAUDE.md.

2. `template`
   - Render a template with blocks and variables.
   - Best for adapting content to a new agent format.

3. `file`
   - Copy one source file to one target file.
   - Best for Cursor rules, Copilot instructions, and docs.

4. `directory`
   - Copy a source directory to a target directory.
   - Best for installing skills.

## Managed block format

```md
<!-- airules:start pack="<pack-name>" install="<install-id>" version="<version>" hash="<hash>" -->

...

<!-- airules:end pack="<pack-name>" install="<install-id>" -->
```

Only modify content inside airules managed blocks when updating.

Do not overwrite user-authored content outside managed blocks.

## Placement rules

Supported placement strategies:

- `append`
- `prepend`
- `after-heading`
- `before-heading`
- `replace-file`

## Merge rules

Supported merge strategies:

- `managed-block`
- `overwrite-managed`
- `skip-if-exists`
- `manual`

## Commands

```bash
airules init
airules doctor
airules list
```

Phase 1 will add:

```bash
airules add <source>
airules update
airules remove <pack-name>
airules diff
```

## Safety rules

1. Prefer pinned tag or commit sources.
2. Do not run remote scripts by default.
3. Preserve user-authored content outside managed blocks.
4. Check `.agents/agent/airules.lock.json` after installation.
5. If generated content conflicts with user edits, write to `.agents/agent/staged`.
