import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runSearchCommand } from './search'

let currentTmpDir: string | null = null

function createProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-cli-search-'))
  mkdirSync(join(currentTmpDir, '.agents/agent'), {
    recursive: true,
  })

  writeFileSync(
    join(currentTmpDir, '.agents/agent/airules.config.json'),
    JSON.stringify({
      version: 1,
      registries: [
        {
          source: './registry.json',
        },
      ],
      packs: [],
    }),
  )

  writeFileSync(
    join(currentTmpDir, 'registry.json'),
    JSON.stringify({
      packs: [
        {
          name: '@baicie/react-shadcn',
          source: './packs/react-shadcn',
          description: 'React shadcn rules',
          tags: ['react', 'shadcn'],
          aliases: ['shadcn'],
        },
      ],
    }),
  )

  return currentTmpDir
}

afterEach(() => {
  vi.restoreAllMocks()

  if (currentTmpDir) {
    rmSync(currentTmpDir, {
      recursive: true,
      force: true,
    })
    currentTmpDir = null
  }
})

describe('runSearchCommand', () => {
  it('prints registry search results', async () => {
    const cwd = createProject()
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    await runSearchCommand({
      cwd,
      query: 'shadcn',
    })

    const output = info.mock.calls.map(call => call.join(' ')).join('\n')
    expect(output).toContain('@baicie/react-shadcn')
    expect(output).toContain('React shadcn rules')
  })
})
