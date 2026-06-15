# AgentMD Snippets

AgentMD snippets are lightweight markdown rule fragments.

They are useful when a full pack is too heavy.

## Layout

```txt
agents/
├── code-splitting.md
├── testing.md
└── review.md
```

## Install

```bash
airules add agents/code-splitting
airules add agents/testing.md
```

The snippet is installed into `AGENTS.md` as a managed block.

## Allowed sources

Allowed:

```txt
agents/code-splitting
agents/code-splitting.md
```

Rejected:

```txt
agents
agents/
agents/foo/bar
agents/../secret
./README.md
docs/rules.md
```

## Generated pack

An AgentMD snippet is internally wrapped as a virtual pack:

```txt
name: @local/agentmd-code-splitting
target: AGENTS.md
mode: modules
merge: managed-block
```

## When to use

Use AgentMD snippets for:

- small project rules
- one-off conventions
- local team rules
- quick AGENTS.md additions

Use full packs for:

- multi-agent installs
- Cursor/Copilot/Claude files
- skills
- templates
- registry distribution
