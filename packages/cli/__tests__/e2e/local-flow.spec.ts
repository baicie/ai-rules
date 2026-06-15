import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runAddCommand } from '../../src/commands/add'
import { runDiffCommand } from '../../src/commands/diff'
import { runDoctorCommand } from '../../src/commands/doctor'
import { runInitCommand } from '../../src/commands/init'
import { runPruneCommand } from '../../src/commands/prune'
import { runRemoveCommand } from '../../src/commands/remove'
import { runUpdateCommand } from '../../src/commands/update'

let currentTmpDir: string | null = null

function createProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-e2e-local-'))

  const packRoot = join(currentTmpDir, 'packs/react-shadcn')

  mkdirSync(join(packRoot, 'modules'), {
    recursive: true,
  })

  mkdirSync(join(packRoot, 'files/.cursor/rules'), {
    recursive: true,
  })

  mkdirSync(join(packRoot, 'skills/shadcn-page'), {
    recursive: true,
  })

  writeFileSync(
    join(packRoot, 'airules.pack.json'),
    JSON.stringify(
      {
        name: '@baicie/react-shadcn',
        version: '0.1.0',
        profiles: {
          default: {
            installs: ['codex-agents', 'cursor-shadcn', 'skill-shadcn-page'],
          },
        },
        modules: {
          core: 'modules/001-core.md',
        },
        installs: [
          {
            id: 'codex-agents',
            agent: 'codex',
            target: 'AGENTS.md',
            mode: 'modules',
            concat: ['core'],
            merge: 'managed-block',
          },
          {
            id: 'cursor-shadcn',
            agent: 'cursor',
            target: '.cursor/rules/shadcn.mdc',
            mode: 'file',
            from: 'files/.cursor/rules/shadcn.mdc',
            merge: 'overwrite-managed',
          },
          {
            id: 'skill-shadcn-page',
            agent: 'skill',
            target: '.agents/skills/shadcn-page',
            mode: 'directory',
            from: 'skills/shadcn-page',
            merge: 'overwrite-managed',
          },
        ],
      },
      null,
      2,
    ),
  )

  writeFileSync(
    join(packRoot, 'modules/001-core.md'),
    '## Core\n\n- Use pnpm.\n',
  )

  writeFileSync(
    join(packRoot, 'files/.cursor/rules/shadcn.mdc'),
    '---\ndescription: shadcn rules\n---\n\n# shadcn\n',
  )

  writeFileSync(
    join(packRoot, 'skills/shadcn-page/SKILL.md'),
    '---\nname: shadcn-page\n---\n\n# shadcn page skill\n',
  )

  return currentTmpDir
}

afterEach(() => {
  if (currentTmpDir) {
    rmSync(currentTmpDir, {
      recursive: true,
      force: true,
    })
    currentTmpDir = null
  }
})

describe('local airules flow', () => {
  it('runs init add doctor diff update remove prune', async () => {
    const cwd = createProject()

    await runInitCommand({
      cwd,
      force: true,
    })

    await runAddCommand({
      cwd,
      source: './packs/react-shadcn',
      agent: 'codex,cursor,skill',
    }).then(() => {
      expect('not listed in security.trustedSources').toHaveBeenWarned()
    })

    expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf8')).toContain(
      'airules:start',
    )
    expect(
      readFileSync(join(cwd, '.cursor/rules/shadcn.mdc'), 'utf8'),
    ).toContain('# shadcn')
    expect(
      readFileSync(join(cwd, '.agents/skills/shadcn-page/SKILL.md'), 'utf8'),
    ).toContain('shadcn page skill')

    await runDoctorCommand({
      cwd,
    })

    await runDiffCommand({
      cwd,
    })

    await runUpdateCommand({
      cwd,
    })

    await runRemoveCommand({
      cwd,
      pack: '@baicie/react-shadcn',
    })

    expect(existsSync(join(cwd, '.cursor/rules/shadcn.mdc'))).toBe(false)

    await runPruneCommand({
      cwd,
    })

    const lock = readFileSync(
      join(cwd, '.agents/agent/airules.lock.json'),
      'utf8',
    )

    expect(lock).not.toContain('@baicie/react-shadcn')
  })
})
