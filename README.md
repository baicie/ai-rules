# ai-rules

AI Rules Pack Manager for coding agents.

`airules` installs reusable AI coding rules into:

- `AGENTS.md`
- `CLAUDE.md`
- `.cursor/rules/*.mdc`
- `.github/copilot-instructions.md`
- `.agents/skills/*`
- `docs/ai/*`

## Install

```bash
pnpm dlx @baicie/airules init
```

## Add local pack

```bash
pnpm dlx @baicie/airules add ./packs/react-shadcn --agent codex,cursor,skill
```

## Add registry alias

```bash
pnpm dlx @baicie/airules add shadcn --agent codex,cursor
```

## Commands

```bash
airules init
airules add <source>
airules update
airules diff
airules doctor
airules remove <pack>
airules prune
airules list

airules search [query]
airules registry list
airules registry publish <pack>

airules pack validate <pack>
airules pack build <pack>

airules create pack <name>
airules create skill <name>
airules create registry
```

## Source formats

```txt
./packs/react-shadcn
local:./packs/react-shadcn
github:baicie/ai-rules/packs/react-shadcn#v0.1.0
npm:@baicie/airules-react-shadcn@0.1.0
shadcn
@baicie/react-shadcn
```

## Local state

```txt
.agents/
├── agent/
│   ├── airules.config.ts
│   ├── airules.lock.json
│   ├── cache/
│   ├── staged/
│   └── state.json
└── skills/
```

## Release

This repository uses `@baicie/release`.

```bash
pnpm release:precheck
pnpm release 0.1.0-beta.0 --publish --yes
```

Tag publishing is handled by GitHub Actions.
