# airules Pack

A pack is a reusable set of AI coding rules.

## Layout

```txt
packs/react-shadcn/
├── airules.pack.json
├── modules/
├── blocks/
├── templates/
├── files/
├── skills/
└── references/
```

## Example

```json
{
  "$schema": "https://baicie.github.io/airules/schema/pack.schema.json",
  "name": "@baicie/react-shadcn",
  "version": "0.1.0",
  "description": "React + shadcn/ui AI coding rules",
  "keywords": ["react", "shadcn"],
  "profiles": {
    "default": {
      "installs": ["codex-agents"],
      "variables": {
        "packageManager": "pnpm"
      }
    }
  },
  "modules": {
    "core": "modules/001-core.md"
  },
  "installs": [
    {
      "id": "codex-agents",
      "agent": "codex",
      "target": "AGENTS.md",
      "mode": "modules",
      "concat": ["core"],
      "merge": "managed-block"
    }
  ]
}
```

## Install modes

### modules

Concatenate markdown files.

```json
{
  "mode": "modules",
  "concat": ["core", "testing"]
}
```

### template

Render template with variables and blocks.

```json
{
  "mode": "template",
  "template": "templates/AGENTS.md.hbs",
  "blocks": ["core"]
}
```

### file

Copy a file.

```json
{
  "mode": "file",
  "from": "files/.cursor/rules/shadcn.mdc"
}
```

### directory

Copy a directory, usually a skill.

```json
{
  "mode": "directory",
  "from": "skills/shadcn-page"
}
```
