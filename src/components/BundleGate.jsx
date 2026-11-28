import React, { useEffect, useState } from 'react'
import {
  getPref,
  setPref,
  loadSettings,
  saveSettings,
  isEmbeddedUi,
  KEYS,
  MIGRATION_VERSION
} from '../lib/storage.js'
import { checkAndUpdateBundle, getCachedBundleUrl, rollbackBundle } from '../lib/updater.js'

export default function BundleGate({ children }) {
  const [gate, setGate] = useState({ ready: false, cachedUrl: null, status: 'checking' })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Existing v2 installs had a cached OTA bundle plus auto-check enabled.
      // Clear that combination once so the built-in UI boots instead of an
      // iframe that reopens itself forever.
      if (Number(getPref(KEYS.migration, 0)) < MIGRATION_VERSION) {
        await rollbackBundle()
        saveSettings({ ...(getPref(KEYS.settings, {}) || {}), checkOnLaunch: false })
        setPref(KEYS.migration, MIGRATION_VERSION)
      }

      // The cached bundle contains this same gate. Never let it check OTA or
      // spawn another cached iframe, even if an older bundle is loaded.
      if (isEmbeddedUi()) {
        if (!cancelled) setGate({ ready: true, cachedUrl: null, status: 'embedded' })
        return
      }

      const settings = await loadSettings()
      const cachedUrl = await getCachedBundleUrl()
      if (!settings.updateUrl?.trim() || settings.checkOnLaunch === false) {
        if (!cancelled) setGate({ ready: true, cachedUrl: null, status: 'bundled' })
        return
      }

      const res = await checkAndUpdateBundle(settings.updateUrl)
      if (cancelled) return
      if (cachedUrl) {
        setGate({ ready: true, cachedUrl, status: res.status })
        return
      }
      setGate({ ready: true, cachedUrl: null, status: res.status })
    })().catch(e => {
      if (!cancelled) setGate({ ready: true, cachedUrl: null, status: String(e?.message || e) })
    })
    return () => { cancelled = true }
  }, [])

  if (!gate.ready) {
    return <div className="boot"><div className="boot-card"><div className="boot-mark">S</div><div>Starting SNAKE ENGINE…</div></div></div>
  }
  if (gate.cachedUrl) {
    const separator = gate.cachedUrl.includes('?') ? '&' : '?'
    return <iframe title="SNAKE ENGINE UI" src={`${gate.cachedUrl}${separator}ui=cache`} className="bundle-frame" />
  }
  return children
}
