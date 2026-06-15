# Phase 3 Design

## Goal

Phase 3 adds template, block, file, and directory install support.

Phase 1 implemented local module installs.
Phase 2 implemented GitHub source and cache.
Phase 3 turns airules into a multi-agent rule generator and distributor.

## Supported install modes

### modules

Concatenate markdown modules.

### template

Render a template with blocks and variables.

Supported syntax:

```md
{{block "core"}}
{{block:shadcn}}
{{packageManager}}
{{#if requireTests}}
{{block "testing"}}
{{/if}}
```

### file

Copy one file into a target file.

Default merge:

```txt
overwrite-managed
```

### directory

Copy a directory into a target directory.

This is mainly for installing skills:

```txt
skills/shadcn-page -> .agents/skills/shadcn-page
```

Default merge:

```txt
overwrite-managed
```

## Merge strategies

### managed-block

Used for AGENTS.md / CLAUDE.md.

Wraps content in:

```md
<!-- airules:start ... -->

...

<!-- airules:end ... -->
```

### overwrite-managed

Used for Copilot files, generated docs, and Skill directories.

The target file content is not modified with a managed marker. Instead, the lockfile records per-file hashes.

### skip-if-exists

If target exists, do not overwrite.

### manual

Write generated content to:

```txt
.agents/agent/staged/<pack>/<install>/<target>
```

## Lockfile

Phase 3 adds:

```json
{
  "files": [
    {
      "target": "docs/ai/shadcn.md",
      "contentHash": "sha256-..."
    }
  ]
}
```

This allows airules to know whether a file was previously generated without polluting frontmatter-sensitive files.
