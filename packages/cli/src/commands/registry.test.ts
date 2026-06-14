import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runRegistryListCommand } from './registry'

let currentTmpDir: string | null = null

function createProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-cli-registry-'))
  mkdirSync(join(currentTmpDir, '.agents/agent'), {
    recursive: true,
  })

  writeFileSync(
    join(currentTmpDir, '.agents/agent/airules.config.json'),
    JSON.stringify({
      version: 1,
      registries: [
        {
          name: 'local',
          source: './registry.json',
        },
      ],
      packs: [],
    }),
  )

  writeFileSync(
    join(currentTmpDir, 'registry.json'),
    JSON.stringify({
      name: '@baicie/default',
      version: '0.1.0',
      packs: [
        {
          name: '@baicie/react-shadcn',
          source: './packs/react-shadcn',
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

describe('runRegistryListCommand', () => {
  it('prints configured registries', async () => {
    const cwd = createProject()
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    await runRegistryListCommand({
      cwd,
    })

    const output = info.mock.calls.map(call => call.join(' ')).join('\n')
    expect(output).toContain('@baicie/default')
    expect(output).toContain('packs: 1')
  })
})
