import React, { useState } from 'react'
import Logo from '../components/Logo.jsx'
import { checkAndUpdateBundle, getBundleMeta, rollbackBundle } from '../lib/updater.js'

export default function Settings({ settings, saveSettings, bundleStatus, onBack, onRunScript, runningScript, onRunLineScript, runningLineScript, scriptLog, onClearLog }) {
  const [url, setUrl] = useState(settings.updateUrl || '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const check = async () => {
    if (!url.trim()) return setMsg('Set a GitHub URL first')
    setBusy(true)
    const res = await checkAndUpdateBundle(url)
    setBusy(false)
    setMsg(`${res.status}${res.version ? ` · ${res.version}` : ''}`)
  }

  const apply = async () => {
    if (!url.trim()) return setMsg('Set a GitHub URL first')
    setBusy(true)
    const res = await checkAndUpdateBundle(url)
    setBusy(false)
    setMsg(`${res.status}${res.version ? ` · ${res.version}` : ''}`)
    if (res.status === 'updated') {
      const entry = { at: Date.now(), status: res.status, version: res.version }
      saveSettings({ updateUrl: url, updateLog: [entry, ...(settings.updateLog || [])].slice(0, 30) })
      setTimeout(() => window.location.reload(), 600)
    } else {
      saveSettings({ updateUrl: url })
    }
  }

  const doRollback = async () => {
    setBusy(true)
    await rollbackBundle()
    setBusy(false)
    setMsg('rolled-back')
    setTimeout(() => window.location.reload(), 600)
  }

  return (
    <main className="app-shell settings">
      <header className="topbar">
        <Logo compact />
        <button className="text-btn" onClick={onBack}>← Home</button>
      </header>

      <div className="settings-body">
        <section className="panel">
          <h2>UI Updates</h2>
          <p>OTA UI bundle from your GitHub URL. No APK download needed for UI changes.</p>
          <label className="field-label">GitHub raw / Pages URL</label>
          <div className="input-row">
            <input value={url} disabled={settings.updateLocked} placeholder="https://raw.githubusercontent.com/DOJGAMING7/d0j-engine/main/updates" onChange={e => setUrl(e.target.value)} />
            <button className="btn ghost" onClick={() => saveSettings({ updateUrl: url })}>Save</button>
          </div>
          <div className="btn-row">
            <button className="btn ghost" disabled={busy} onClick={check}>Check</button>
            <button className="btn primary" disabled={busy} onClick={apply}>Download & Apply</button>
            <button className="btn ghost" disabled={busy} onClick={doRollback}>Rollback</button>
          </div>
          <div className="meta-line">Installed: {bundleStatus?.version || 'built-in'} · {msg || 'idle'}</div>
          <div className="meta-line">SHA: {bundleStatus?.sha256 ? String(bundleStatus.sha256).slice(0, 16) + '…' : '—'}</div>
          {settings.updateLog?.length ? (
            <details><summary>Update history</summary>{settings.updateLog.map((l, i) => <div key={i} className="meta-line">{new Date(l.at).toLocaleString()} · {l.status} · {l.version || ''}</div>)}</details>
          ) : null}
        </section>

        <section className="panel">
          <h2>Script Integration</h2>
          <p>Scripts are versioned, hashed and run against the simulated bridge.</p>
          <div className="script-row">
            <div><b>autoplay-ratimoda.js</b><small>8 Ball Pool 56.34.0 · v2.0.0 · state machine</small></div>
            <button className="btn primary" disabled={runningScript} onClick={onRunScript}>{runningScript ? 'Running…' : 'Run test'}</button>
          </div>
          <div className="script-row">
            <div><b>prediction-lines.js</b><small>3-shot prediction guide test · local engine</small></div>
            <button className="btn primary" disabled={runningLineScript} onClick={onRunLineScript}>{runningLineScript ? 'Running…' : 'Run test'}</button>
          </div>
          <div className="log-box">
            {scriptLog.length ? scriptLog.slice(-12).map((l, i) => <div key={i}>[{new Date(l.at).toLocaleTimeString()}] {l.msg}</div>) : <div className="muted">No script output yet.</div>}
          </div>
          <button className="text-btn" onClick={onClearLog}>Clear log</button>
        </section>

        <section className="panel">
          <h2>Build Info</h2>
          <div className="meta-line">D0J EnGine · v1.2.0 · private single-user build</div>
          <div className="meta-line">Target reference: 8 Ball Pool 56.34.0</div>
          <div className="meta-line">No seller · no key · no licence · no device binding</div>
          <div className="meta-line">State offsets/RVAs: <b>UNSET</b></div>
        </section>
      </div>
    </main>
  )
}
