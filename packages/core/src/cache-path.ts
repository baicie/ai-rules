import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'

export const AIRULES_CACHE_ENV = 'AIRULES_CACHE_DIR'

export function getAirulesCacheDir(): string {
  const override = process.env[AIRULES_CACHE_ENV]
  if (override && override.trim().length > 0) {
    return resolve(override)
  }

  const xdgCacheHome = process.env.XDG_CACHE_HOME
  if (xdgCacheHome && xdgCacheHome.trim().length > 0) {
    return join(xdgCacheHome, 'airules')
  }

  const home = homedir()
  if (process.platform === 'darwin') {
    return join(home, 'Library', 'Caches', 'airules')
  }

  return join(home, '.cache', 'airules')
}

export function getAirulesPackCacheDir(): string {
  return join(getAirulesCacheDir(), 'packs')
}
