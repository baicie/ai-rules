# ai-rules

AI Rules Pack Manager for coding agents.

`airules` installs reusable AI coding rules into:

- `AGENTS.md`
- `CLAUDE.md`
- `.cursor/rules/*.mdc`
- `.github/copilot-instructions.md`
- `.agents/skills/*`
- `docs/ai/*`

## Quick start

airules can work without running `init` first. The first successful `airules add` will create local state automatically.

```bash
pnpm dlx @baicie/airules add ./packs/react-shadcn --agent codex,cursor
```

To initialize explicitly:

```bash
pnpm dlx @baicie/airules init
```

## Config

Minimal config:

```ts
export default {
  packs: [],
}
```

Add a pack:

```ts
export default {
  packs: [
    {
      name: '@baicie/react-shadcn',
      source: 'shadcn',
      agents: ['codex', 'cursor', 'skill'],
    },
  ],
}
```

## Add local pack

```bash
pnpm dlx @baicie/airules add ./packs/react-shadcn --agent codex,copilot,skill
```

## Add registry alias

```bash
pnpm dlx @baicie/airules add shadcn --agent codex,copilot
```

## Add AgentMD snippet

Markdown files under `agents/` can be installed directly into `AGENTS.md`:

```bash
pnpm dlx @baicie/airules add agents/code-splitting
pnpm dlx @baicie/airules add agents/testing
pnpm dlx @baicie/airules add agents/code-review
```

## Add remote pack

```bash
pnpm dlx @baicie/airules add baicie/ai-rules/packs/react-shadcn#v0.1.0
pnpm dlx @baicie/airules add https://github.com/baicie/ai-rules/tree/v0.1.0/packs/react-shadcn
pnpm dlx @baicie/airules add @baicie/airules-react-shadcn@0.1.0
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
agents/code-splitting
baicie/ai-rules/packs/react-shadcn#v0.1.0
https://github.com/baicie/ai-rules/tree/v0.1.0/packs/react-shadcn
@baicie/airules-react-shadcn@0.1.0
shadcn
@baicie/react-shadcn
```

The explicit `github:` and `npm:` source protocols remain supported for
backward compatibility.

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

Remote pack cache is shared across projects:

```txt
~/.cache/airules/packs/
├── github/<owner>/<repo>/<commit>/<pathHash>/
└── npm/<package>/<version>/
```

Set `AIRULES_CACHE_DIR` to override the global cache directory.

## Release

This repository uses `@baicie/release`.

```bash
pnpm release:precheck
pnpm release 0.1.0-beta.0 --publish --yes
```

Tag publishing is handled by GitHub Actions.
