# Phase 0 Design

## Scope

Phase 0 establishes the protocol and minimal implementation foundation for `airules`.

It does not install remote packs yet. It only defines and validates the core model.

## Local state directory

All airules-local files live under:

```txt
.agents/agent
```

Important files:

```txt
.agents/agent/airules.config.ts
.agents/agent/airules.lock.json
.agents/agent/staged
```

Remote pack cache is not project-local. It is shared across projects under
`~/.cache/airules/packs` by default, or under `AIRULES_CACHE_DIR` when that
environment variable is set.

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

## Pack install modes

### modules

Concatenate markdown modules in order.

### template

Render a template using blocks and variables.

### file

Copy a single file.

### directory

Copy a directory.

## Merge strategies

### managed-block

Only replace an airules-managed block inside a target markdown file.

### overwrite-managed

Overwrite a full target file only if the file is already marked as airules-managed.

### skip-if-exists

Do not overwrite an existing target.

### manual

Write generated output to `.agents/agent/staged`.

## Phase 0 deliverables

- `@baicie/airules-schema`
- `@baicie/airules-core`
- `@baicie/airules`
- Unit tests for schema, profile, config lookup, and managed blocks.
