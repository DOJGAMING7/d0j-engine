import React, { useEffect, useState } from 'react'
import { loadSettings } from '../lib/storage.js'
import { checkAndUpdateBundle, getCachedBundleUrl, getBundleMeta } from '../lib/updater.js'

export default function BundleGate({ children }) {
  const [gate, setGate] = useState({ ready: false, cachedUrl: null, status: 'checking' })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
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
    return <div className="boot"><div className="boot-card"><div className="boot-mark">D0J</div><div>Checking UI bundle…</div></div></div>
  }
  if (gate.cachedUrl) {
    return <iframe title="D0J EnGine UI" src={gate.cachedUrl} className="bundle-frame" />
  }
  return children
}
