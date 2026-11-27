const PREFIX = 'd0j_engine_'

export const KEYS = {
  settings: 'settings',
  uiBundleMeta: 'ui_bundle_meta',
  uiBundleCache: 'ui_bundle_cache'
}

export const DEFAULT_SETTINGS = {
  updateUrl: '',
  updateLocked: false,
  checkOnLaunch: true,
  updateLog: [],
  targetBuild: '56.34.0'
}

export function getPref(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw === null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function setPref(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {}
  return value
}

export function removePref(key) {
  try { localStorage.removeItem(PREFIX + key) } catch {}
}

export function loadSettings() {
  const stored = getPref(KEYS.settings, {})
  return { ...DEFAULT_SETTINGS, ...(stored || {}) }
}

export function saveSettings(patch) {
  const next = { ...loadSettings(), ...(patch || {}) }
  return setPref(KEYS.settings, next)
}
