import { Buffer } from 'node:buffer'
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
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createDryRunBlockForOperation,
  installLocalPack,
  installPack,
} from './installer'
import { readAirulesLockfile } from './lockfile'

let currentTmpDir: string | null = null

function createTempProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-install-'))

  mkdirSync(join(currentTmpDir, 'packs/react-shadcn/modules'), {
    recursive: true,
  })

  writeFileSync(
    join(currentTmpDir, 'packs/react-shadcn/airules.pack.json'),
    JSON.stringify(
      {
        name: '@baicie/react-shadcn',
        version: '0.1.0',
        profiles: {
          default: {
            installs: ['codex'],
          },
          strict: {
            extends: 'default',
            installs: ['copilot'],
          },
        },
        modules: {
          core: 'modules/core.md',
          shadcn: 'modules/shadcn.md',
          testing: 'modules/testing.md',
        },
        installs: [
          {
            id: 'codex',
            agent: 'codex',
            target: 'AGENTS.md',
            mode: 'modules',
            placement: {
              type: 'after-heading',
              heading: '## AI Rules',
              fallback: 'append',
            },
            concat: ['core', 'shadcn'],
            merge: 'managed-block',
          },
          {
            id: 'copilot',
            agent: 'copilot',
            target: '.github/copilot-instructions.md',
            mode: 'modules',
            concat: ['core', 'testing'],
            merge: 'managed-block',
          },
        ],
      },
      null,
      2,
    ),
  )

  writeFileSync(
    join(currentTmpDir, 'packs/react-shadcn/modules/core.md'),
    '## Core\n\n- Use TypeScript.',
  )

  writeFileSync(
    join(currentTmpDir, 'packs/react-shadcn/modules/shadcn.md'),
    '## shadcn\n\n- Use shadcn/ui.',
  )

  writeFileSync(
    join(currentTmpDir, 'packs/react-shadcn/modules/testing.md'),
    '## Testing\n\n- Run tests.',
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

describe('installLocalPack', () => {
  it('installs modules into AGENTS.md with managed block', () => {
    const cwd = createTempProject()

    writeFileSync(join(cwd, 'AGENTS.md'), '# AGENTS.md\n\n## AI Rules\n')

    const result = installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['codex'],
    })

    expect(result.packName).toBe('@baicie/react-shadcn')
    expect(result.operations).toHaveLength(1)
    expect(result.operations[0] && result.operations[0].action).toBe('update')

    const agents = readFileSync(join(cwd, 'AGENTS.md'), 'utf8')

    expect(agents).toContain('<!-- airules:start')
    expect(agents).toContain('pack="@baicie/react-shadcn"')
    expect(agents).toContain('install="codex"')
    expect(agents).toContain('## Core')
    expect(agents).toContain('## shadcn')

    const lockfile = readAirulesLockfile(cwd)

    expect(lockfile.packs[0] && lockfile.packs[0].name).toBe(
      '@baicie/react-shadcn',
    )
    expect(lockfile.installs[0] && lockfile.installs[0].installId).toBe('codex')
    expect(lockfile.installs[0] && lockfile.installs[0].modules).toEqual([
      'core',
      'shadcn',
    ])
  })

  it('creates target file when missing', () => {
    const cwd = createTempProject()

    installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['codex'],
    })

    expect(existsSync(join(cwd, 'AGENTS.md'))).toBe(true)

    const agents = readFileSync(join(cwd, 'AGENTS.md'), 'utf8')
    expect(agents).toContain('## Core')
  })

  it('supports dry-run without writing files or lockfile', () => {
    const cwd = createTempProject()

    const result = installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['codex'],
      dryRun: true,
    })

    expect(result.operations[0] && result.operations[0].action).toBe('create')
    expect(existsSync(join(cwd, 'AGENTS.md'))).toBe(false)
    expect(existsSync(join(cwd, '.agents/agent/airules.lock.json'))).toBe(false)
  })

  it('selects installs by profile and agent', () => {
    const cwd = createTempProject()

    installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      profile: 'strict',
      agents: ['copilot'],
    })

    const copilot = readFileSync(
      join(cwd, '.github/copilot-instructions.md'),
      'utf8',
    )

    expect(copilot).toContain('install="copilot"')
    expect(copilot).toContain('## Testing')

    const lockfile = readAirulesLockfile(cwd)
    const installIds = lockfile.installs.map(install => install.installId)
    expect(installIds).toEqual(['copilot'])
  })

  it('updates existing managed block instead of duplicating', () => {
    const cwd = createTempProject()

    installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['codex'],
    })

    writeFileSync(
      join(cwd, 'packs/react-shadcn/modules/shadcn.md'),
      '## shadcn\n\n- Updated rule.',
    )

    installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['codex'],
    })

    const agents = readFileSync(join(cwd, 'AGENTS.md'), 'utf8')
    const matches = agents.match(/airules:start/g)

    expect(matches).not.toBeNull()
    expect(matches && matches.length).toBe(1)
    expect(agents).toContain('- Updated rule.')
  })

  it('supports overwrite-managed merge in Phase 3', () => {
    const cwd = createTempProject()
    const packPath = join(cwd, 'packs/react-shadcn/airules.pack.json')
    const raw = readFileSync(packPath, 'utf8')
    const pack = JSON.parse(raw) as {
      installs: Array<{ merge?: string }>
    }

    if (pack.installs[0]) {
      pack.installs[0].merge = 'overwrite-managed'
    }

    writeFileSync(packPath, JSON.stringify(pack, null, 2))

    const result = installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['codex'],
    })

    expect(result.operations[0] && result.operations[0].action).toBe('create')
  })

  it('returns stable dry-run managed block content', () => {
    const cwd = createTempProject()

    const result = installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['codex'],
      dryRun: true,
    })

    const operation = result.operations[0]
    expect(operation).toBeDefined()
    if (!operation) {
      return
    }
    expect(operation.managedBlock).toContain('install="codex"')
    expect(operation.managedBlock).toContain('## Core')
    expect(operation.managedBlock).toContain('## shadcn')
    expect(operation.managedBlock).not.toContain('# AGENTS.md')
  })

  it('marks unchanged when running same install twice', () => {
    const cwd = createTempProject()

    installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['codex'],
    })

    const result = installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['codex'],
    })

    expect(result.operations[0] && result.operations[0].action).toBe(
      'unchanged',
    )
  })

  it('does not write skipped files into lockfile', () => {
    const cwd = createTempProject()

    mkdirSync(join(cwd, 'docs'), {
      recursive: true,
    })
    writeFileSync(join(cwd, 'docs/rules.md'), 'user content\n')

    const packPath = join(cwd, 'packs/react-shadcn/airules.pack.json')
    const pack = JSON.parse(readFileSync(packPath, 'utf8')) as {
      profiles: {
        default: {
          installs: string[]
        }
      }
      installs: unknown[]
    }

    pack.profiles.default.installs = ['docs']
    pack.installs = [
      {
        id: 'docs',
        agent: 'generic',
        target: 'docs/rules.md',
        mode: 'file',
        from: 'modules/core.md',
        merge: 'skip-if-exists',
      },
    ]

    writeFileSync(packPath, JSON.stringify(pack, null, 2))

    const result = installLocalPack({
      cwd,
      source: './packs/react-shadcn',
    })

    expect(result.operations[0] && result.operations[0].action).toBe('skipped')

    const lockfile = readAirulesLockfile(cwd)
    expect(lockfile.installs).toHaveLength(0)
  })

  it('createDryRunBlockForOperation returns the generated managed block only', () => {
    const cwd = createTempProject()

    const result = installLocalPack({
      cwd,
      source: './packs/react-shadcn',
      agents: ['codex'],
      dryRun: true,
    })

    const operation = result.operations[0]
    expect(operation).toBeDefined()
    if (!operation) {
      return
    }

    const block = createDryRunBlockForOperation(operation)

    expect(block).toBe(operation.managedBlock)
    expect(block).toContain('<!-- airules:start')
    expect(block).toContain('## Core')
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('installPack with github source', () => {
  it('installs github pack through cache', () => {
    const cwd = createTempProject()
    vi.stubGlobal('fetch', createInstallerGitHubMockFetch())

    return installPack({
      cwd,
      source: 'github:baicie/ai-rules/packs/react-shadcn#v0.1.0',
      agents: ['codex'],
    }).then(result => {
      expect(result.packName).toBe('@baicie/react-shadcn')
      expect(result.operations[0] && result.operations[0].action).toBe('create')

      const agents = readFileSync(join(cwd, 'AGENTS.md'), 'utf8')
      expect(agents).toContain('## Core')
      expect(agents).toContain('install="codex"')

      const lockfile = readAirulesLockfile(cwd)
      expect(lockfile.packs[0] && lockfile.packs[0].resolved).toEqual({
        type: 'github',
        owner: 'baicie',
        repo: 'ai-rules',
        path: 'packs/react-shadcn',
        ref: 'v0.1.0',
        commit: 'commit-sha-123',
      })
    })
  })
})

function createInstallerGitHubMockFetch(): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input)

    if (url === 'https://api.github.com/repos/baicie/ai-rules/commits/v0.1.0') {
      return createInstallerJsonResponse({
        sha: 'commit-sha-123',
        commit: {
          tree: {
            sha: 'tree-sha-123',
          },
        },
      })
    }

    if (
      url ===
      'https://api.github.com/repos/baicie/ai-rules/git/trees/tree-sha-123?recursive=1'
    ) {
      return createInstallerJsonResponse({
        truncated: false,
        tree: [
          {
            path: 'packs/react-shadcn/airules.pack.json',
            type: 'blob',
            sha: 'blob-pack',
          },
          {
            path: 'packs/react-shadcn/modules/core.md',
            type: 'blob',
            sha: 'blob-core',
          },
        ],
      })
    }

    if (
      url === 'https://api.github.com/repos/baicie/ai-rules/git/blobs/blob-pack'
    ) {
      return createInstallerJsonResponse({
        encoding: 'base64',
        content: Buffer.from(
          JSON.stringify({
            name: '@baicie/react-shadcn',
            version: '0.1.0',
            modules: {
              core: 'modules/core.md',
            },
            installs: [
              {
                id: 'codex',
                agent: 'codex',
                target: 'AGENTS.md',
                mode: 'modules',
                concat: ['core'],
                merge: 'managed-block',
              },
            ],
          }),
        ).toString('base64'),
      })
    }

    if (
      url === 'https://api.github.com/repos/baicie/ai-rules/git/blobs/blob-core'
    ) {
      return createInstallerJsonResponse({
        encoding: 'base64',
        content: Buffer.from('## Core\n\n- From GitHub.').toString('base64'),
      })
    }

    return createInstallerJsonResponse(
      {
        message: `Unexpected URL: ${url}`,
      },
      404,
    )
  }) as typeof fetch
}

function createInstallerJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Not Found',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response
}
