# ai-rules

Reusable AI coding rule packs and the `airules` CLI.

## Goals

`airules` is a rule pack manager for coding agents. It installs reusable rule modules, generated blocks, direct files, and skills into a target repository.

Local configuration and lock state live under:

```txt
.agents/agent
```

## Phase 0

Phase 0 provides:

- Pack / Config / Lockfile schema.
- TypeScript definitions.
- Config loading from `.agents/agent`.
- Profile resolution.
- Managed block helpers.
- CLI skeleton.

## Packages

| Package                  | Description                                                        |
| ------------------------ | ------------------------------------------------------------------ |
| `@baicie/airules-schema` | Zod schemas and TypeScript types for packs, configs and lockfiles. |
| `@baicie/airules-core`   | Config loading, profile resolution, managed block helpers.         |
| `@baicie/airules`        | The `airules` CLI.                                                 |

## Commands

```bash
pnpm install
pnpm check
```

The CLI provides:

```bash
airules init
airules doctor
airules list
```
