# Phase 4 Design

## Goal

Phase 4 adds lifecycle management for installed airules packs.

It includes:

- remove
- prune
- deep doctor

## Remove

```bash
airules remove @baicie/react-shadcn
airules remove @baicie/react-shadcn --dry-run
airules remove @baicie/react-shadcn --force
```

Rules:

- managed-block installs remove only the generated managed block.
- overwrite-managed installs delete files only if their current content hash matches lockfile.
- modified files are skipped unless `--force` is used.
- lockfile entries are removed after successful non-dry-run remove.

## Prune

```bash
airules prune
airules prune --dry-run
```

Rules:

- remove lock installs whose files are missing.
- remove lock installs whose managed block no longer exists.
- remove pack records that no longer have install entries.

## Doctor

```bash
airules doctor
```

Checks:

- config exists
- config schema is valid
- lockfile schema is valid
- managed block exists
- generated files exist
- generated files match lock hash
- modified generated files are reported as warning

## Safety

Phase 4 never removes user-modified files unless `--force` is used.
