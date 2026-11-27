const PREFIX = 'd0j_engine_'

// Bump this when a migration must run once on an existing install.
export const MIGRATION_VERSION = 2

export const KEYS = {
  settings: 'settings',
  uiBundleMeta: 'ui_bundle_meta',
  uiBundleCache: 'ui_bundle_cache',
  migration: 'migration_version'
}

export const DEFAULT_SETTINGS = {
  updateUrl: 'https://raw.githubusercontent.com/DOJGAMING7/d0j-engine/main/updates',
  updateLocked: false,
  // OTA is manual-only. Auto-checking allowed a cached bundle to reopen itself
  // inside an iframe and recursively nest until the WebView stopped painting.
  checkOnLaunch: false,
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

export function isEmbeddedUi() {
  try {
    if (typeof window === 'undefined') return false
    if (window.self !== window.top) return true
    return new URLSearchParams(window.location.search).get('ui') === 'cache'
  } catch {
    return true
  }
}
