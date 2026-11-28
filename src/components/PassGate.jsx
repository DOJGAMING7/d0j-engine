import React, { useState } from 'react'
import Logo from './Logo.jsx'
import { markUnlocked, verifyPass } from '../lib/apkPass.js'
import native from '../lib/native.js'

export default function PassGate({ onUnlock }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async e => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const ok = await verifyPass(value)
      if (!ok) {
        setError('Wrong APK pass. Try again.')
        return
      }
      markUnlocked(true)
      await native.setUnlocked(true)
      onUnlock()
    } catch (e) {
      setError(`Unlock error: ${e?.message || e}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="app-shell pass-shell">
      <header className="topbar pass-top"><Logo compact /></header>
      <form className="pass-card" onSubmit={submit}>
        <small className="card-label">PRIVATE CLIENT</small>
        <h1>APK PASS</h1>
        <p>Enter your local access key to open SNAKE ENGINE.</p>
        <input
          className="pass-input"
          type="password"
          value={value}
          autoFocus
          placeholder="Access key"
          onChange={e => setValue(e.target.value)}
        />
        {error ? <div className="pass-error">{error}</div> : null}
        <button className="btn primary wide" disabled={busy || !value}>{busy ? 'Checking…' : 'UNLOCK'}</button>
        <div className="pass-note">Offline check · salted hash · no server · no device binding</div>
      </form>
    </main>
  )
}
