# Phase 1 Design

## Goal

Phase 1 turns the Phase 0 protocol into a usable local installer.

Supported:

- local source
- `airules.pack.json`
- profiles
- agent filtering
- modules mode
- managed-block merge
- lockfile update
- dry-run
- add / update / diff commands

Not supported yet:

- github source
- npm source
- template mode
- file mode
- directory mode
- remove
- registry

## Example

```bash
airules add ./packs/react-shadcn --profile strict --agent codex,copilot
```

## Local source

Phase 1 supports:

```txt
./packs/react-shadcn
local:./packs/react-shadcn
file:///absolute/path/to/pack
```

It rejects:

```txt
github:...
npm:...
https://...
```

## Pack structure

```txt
packs/react-shadcn/
├── airules.pack.json
└── modules/
    ├── core.md
    └── shadcn.md
```

## Install mode

Only `modules` mode is supported.

```json
{
  "id": "codex",
  "agent": "codex",
  "target": "AGENTS.md",
  "mode": "modules",
  "concat": ["core", "shadcn"],
  "merge": "managed-block"
}
```

## Merge strategy

Phase 1 only supports `managed-block`.

Generated content is wrapped like this:

```md
<!-- airules:start pack="@baicie/react-shadcn" install="codex" version="0.1.0" hash="sha256-..." -->

...

<!-- airules:end pack="@baicie/react-shadcn" install="codex" -->
```

## Lockfile

The installer writes:

```txt
.agents/agent/airules.lock.json
```

The lockfile records:

- pack name
- pack version
- source
- resolved local path
- selected agents
- selected profile
- installed targets
- installed modules
- generated content hash
