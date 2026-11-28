import React, { useEffect, useState } from 'react'
import Logo from '../components/Logo.jsx'
import { checkAndUpdateBundle, rollbackBundle } from '../lib/updater.js'
import { GAME_PACKAGES, TARGET_BUILD } from '../lib/config.js'
import native from '../lib/native.js'

export default function Settings({
  settings,
  saveSettings,
  bundleStatus,
  nativeStatus,
  sessionStatus,
  testReport,
  onBack,
  onRunScript,
  runningScript,
  onRunLineScript,
  runningLineScript,
  onRunLiveLines,
  liveOverlay,
  liveOverlayInfo,
  onStartLiveOverlay,
  onStopLiveOverlay,
  calibration,
  updateCalibration,
  autoLive,
  autoLiveInfo,
  onStartLiveAuto,
  onStopLiveAuto,
  inputInfo,
  onAttachInput,
  inputProcess,
  setInputProcess,
  inputTaps,
  updateInputTap,
  guardInfo,
  onSessionGuard,
  scriptLog,
  onClearLog,
  onStartSession,
  onRequestOverlay,
  onRequestNotifications,
  onRequestUsageAccess,
  onStopSession,
  onLockApp,
  onRunQuickTest
}) {
  const [url, setUrl] = useState(settings.updateUrl || '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [vmPath, setVmPath] = useState('')
  const [vmInfo, setVmInfo] = useState(null)
  const [hookInfo, setHookInfo] = useState(null)
  const [liveInfo, setLiveInfo] = useState(null)
  const [bindingInfo, setBindingInfo] = useState(null)
  const [probeInfo, setProbeInfo] = useState(null)
  const [probeResult, setProbeResult] = useState(null)
  const [readerProcess, setReaderProcess] = useState('0')
  const [probeBase, setProbeBase] = useState('')
  const [probeLength, setProbeLength] = useState('4096')
  const [vmMsg, setVmMsg] = useState('')
  const [vmBusy, setVmBusy] = useState(false)

  useEffect(() => {
    Promise.all([native.vmStatus(), native.vmHooks(), native.vmState(), native.vmBindings(), native.vmProbe()])
      .then(([status, hooks, state, bindings, probe]) => {
        setVmInfo(status)
        setHookInfo(hooks)
        setLiveInfo(state)
        setBindingInfo(bindings)
        setProbeInfo(probe)
      })
      .catch(() => {})
  }, [])

  const refreshVm = async () => {
    const [status, hooks, state, bindings, probe] = await Promise.all([
      native.vmStatus(), native.vmHooks(), native.vmState(), native.vmBindings(), native.vmProbe()
    ])
    setVmInfo(status)
    setHookInfo(hooks)
    setLiveInfo(state)
    setBindingInfo(bindings)
    setProbeInfo(probe)
  }

  const attachReader = async () => {
    const res = await native.vmAttachReader(Number(readerProcess) || 0)
    setVmMsg(`Reader: ${res?.ready ? 'attached' : 'pending'} · process=:${res?.process ?? readerProcess} · ${res?.reason || res?.message || '—'}`)
    await refreshVm()
  }

  const setProvider = async name => {
    const res = await native.vmStateProvider(name)
    setVmMsg(`Provider: ${res?.provider || name}${res?.reason ? ` · ${res.reason}` : ''}`)
    await refreshVm()
  }

  const runProbe = async (action, label) => {
    const res = await native.vmProbe({
      action,
      label,
      before: 'before',
      after: 'after',
      base: parseInt(probeBase || '0', 16) || 0,
      length: Number(probeLength) || 4096,
      stride: 4,
      limit: 32
    })
    setVmMsg(`Probe ${action}: ${res?.ok ? 'ok' : (res?.code || res?.reason || 'failed')}${res?.totalChanges !== undefined ? ` · ${res.totalChanges} changes` : ''}`)
    if (Array.isArray(res?.changes) && res.changes.length) {
      setVmMsg(prev => `${prev} · first=${res.changes[0]?.address || '—'}`)
    }
    setProbeResult(res)
    await refreshVm()
  }

  const vmAction = async (action, label) => {
    setVmBusy(true)
    const res = await action().catch(e => ({ ok: false, error: String(e?.message || e) }))
    const detail = res?.ok ? 'ok' : (res?.code || res?.error || 'failed')
    setVmMsg(`${label}: ${detail}${res?.reason ? ` · ${res.reason}` : ''}`)
    await refreshVm()
    setVmBusy(false)
  }

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
    <main className="app-shell settings bw-home">
      <header className="topbar">
        <Logo compact />
        <button className="text-btn" onClick={onBack}>← Home</button>
      </header>

      <div className="settings-body">
        <section className="panel">
          <h2>SESSION / NATIVE</h2>
          <p>Session-scoped overlay. No Accessibility, no purchase guard (A1). Overlay permission is requested only for game session.</p>
          <div className="script-row">
            <div><b>Start 8BP session</b><small>{GAME_PACKAGES.eightBallPool} · {TARGET_BUILD}</small></div>
            <button className="btn primary" onClick={() => onStartSession(GAME_PACKAGES.eightBallPool)}>Start</button>
          </div>
          <div className="script-row">
            <div><b>Overlay permission</b><small>{nativeStatus?.overlay ? 'GRANTED' : 'Not granted'}</small></div>
            <button className="btn ghost" onClick={onRequestOverlay}>Open</button>
          </div>
          <div className="script-row">
            <div><b>Notification permission</b><small>{nativeStatus?.notifications ? 'GRANTED' : 'Not granted'}</small></div>
            <button className="btn ghost" onClick={onRequestNotifications}>Ask</button>
          </div>
          <div className="script-row">
            <div><b>Usage access (auto-stop)</b><small>{nativeStatus?.usageAccess ? 'GRANTED' : 'Optional'}</small></div>
            <button className="btn ghost" onClick={onRequestUsageAccess}>Open</button>
          </div>
          <div className="script-row">
            <div><b>Session</b><small>{nativeStatus?.sessionActive ? 'ACTIVE' : 'IDLE'} · {sessionStatus?.text || 'Ready'}</small></div>
            <button className="btn ghost" onClick={onStopSession}>Stop</button>
          </div>
          <div className="script-row">
            <div><b>Quick test</b><small>{testReport?.ok ? 'PASS' : testReport?.items?.length ? 'FAIL' : 'Not run'} · non-blocking</small></div>
            <button className="btn primary" onClick={onRunQuickTest}>Run</button>
          </div>
          <button className="btn ghost wide" onClick={onLockApp}>Lock app again (APK PASS)</button>
        </section>

        <section className="panel">
          <h2>VM Host (rootless) · step 2</h2>
          <p>APK parsing, DEX classloading and native-library extraction are real. The framework hook is not attached, so hosted activities cannot start yet.</p>
          <div className="script-row">
            <div><b>Host state</b><small>{vmInfo?.ready ? 'HOOK READY' : (vmInfo?.reason || 'SUBSTRATE ONLY')}</small></div>
            <button className="btn ghost" onClick={refreshVm}>Refresh</button>
          </div>
          <div className="script-row">
            <div><b>Framework hooks</b><small>{hookInfo?.state || 'PENDING'} · inst={hookInfo?.instrumentation || '—'} · am={hookInfo?.activityManager || '—'} · pm={hookInfo?.packageManager || '—'}</small></div>
            <button className="btn primary" disabled={vmBusy} onClick={() => vmAction(() => native.vmAttach(), 'Hooks')}>Attach</button>
          </div>
          <label className="field-label">APK path on device</label>
          <div className="input-row">
            <input value={vmPath} placeholder="/sdcard/8bp.apk" onChange={e => setVmPath(e.target.value)} />
          </div>
          <div className="btn-row">
            <button className="btn ghost" disabled={vmBusy} onClick={() => vmAction(() => native.vmDaemon(true), 'Daemon')}>Start daemon</button>
            <button className="btn primary" disabled={vmBusy} onClick={() => vmAction(() => native.vmInstall(vmPath), 'Install')}>Install APK</button>
          </div>
          <div className="btn-row">
            <button className="btn primary" disabled={vmBusy} onClick={() => vmAction(() => native.vmLaunch(GAME_PACKAGES.eightBallPool), 'Launch')}>Launch 8BP in VM</button>
            <button className="btn ghost" disabled={vmBusy} onClick={() => vmAction(() => native.vmDaemon(false), 'Daemon')}>Stop daemon</button>
          </div>
          <div className="meta-line">Registered: {vmInfo?.apps ?? 0} · Loaders: {vmInfo?.classLoaders ?? 0} · Processes: {(vmInfo?.processes || []).join(', ') || 'none'}</div>
          <div className="meta-line">Device verified: {hookInfo?.verifiedOnDevice === true ? 'yes' : 'no'} · hooks alone do not prove 8BP runs.</div>
          <div className="meta-line">Last action: {vmMsg || 'idle'}</div>
        </section>

        <section className="panel">
          <h2>Live State Probe · step 4</h2>
          <p>Bindings stay UNMEASURED until values are captured on a device. Demo state is labelled simulated, never shown as live 8BP.</p>
          <div className="script-row">
            <div><b>State source</b><small>{liveInfo?.provider || '—'} · {liveInfo?.state || '—'} · {liveInfo?.providerReason || ''}</small></div>
            <button className="btn ghost" onClick={refreshVm}>Refresh</button>
          </div>
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setProvider('demo')}>Use demo</button>
            <button className="btn primary" onClick={() => setProvider('probe')}>Use probe</button>
          </div>
          <div className="script-row">
            <div><b>Bindings</b><small>{bindingInfo?.status || 'UNMEASURED'} · usable={bindingInfo?.usable ? 'yes' : 'no'}</small></div>
          </div>
          <div className="script-row">
            <div><b>Memory reader</b><small>{probeInfo?.attached ? `attached :p${probeInfo?.process ?? '?'}` : (probeInfo?.reason || 'not attached')}</small></div>
          </div>
          <label className="field-label">Hosted process slot (:p0…:p3)</label>
          <div className="input-row">
            <input value={readerProcess} placeholder="0" onChange={e => setReaderProcess(e.target.value)} />
            <button className="btn ghost" disabled={vmBusy} onClick={attachReader}>Attach Reader</button>
          </div>
          <label className="field-label">Probe window (hex base, bytes)</label>
          <div className="input-row">
            <input value={probeBase} placeholder="7a000000" onChange={e => setProbeBase(e.target.value)} />
            <input value={probeLength} onChange={e => setProbeLength(e.target.value)} />
          </div>
          <div className="btn-row">
            <button className="btn ghost" disabled={vmBusy} onClick={() => runProbe('capture', 'before')}>Capture A</button>
            <button className="btn ghost" disabled={vmBusy} onClick={() => runProbe('capture', 'after')}>Capture B</button>
            <button className="btn primary" disabled={vmBusy} onClick={() => runProbe('diff', '')}>Diff</button>
            <button className="btn ghost" disabled={vmBusy} onClick={() => runProbe('clear', '')}>Clear</button>
          </div>
          <div className="btn-row">
            <button className="btn primary wide" disabled={vmBusy || runningLineScript} onClick={onRunLiveLines}>
              {runningLineScript ? 'PLANNING…' : 'RUN LINES FROM STATE'}
            </button>
          </div>
          <div className="meta-line">Diff result: {probeResult?.state || 'none'} · changes={probeResult?.totalChanges ?? 0}</div>
          <div className="meta-line">Last: {vmMsg || 'idle'}</div>
        </section>

        <section className="panel">
          <h2>Live Overlay Lines · step 5</h2>
          <p>Draws planner output over the game through the session overlay. Calibration maps measured table coordinates to your screen; no coordinates are guessed.</p>
          <div className="script-row">
            <div><b>Overlay</b><small>{liveOverlay ? 'running' : 'off'} · {liveOverlayInfo?.ok ? `${liveOverlayInfo.balls} balls · ${liveOverlayInfo.source}${liveOverlayInfo.simulated ? ' (simulated)' : ''}` : (liveOverlayInfo?.reason || 'idle')}</small></div>
            <button className={`btn ${liveOverlay ? 'ghost' : 'primary'}`} onClick={liveOverlay ? onStopLiveOverlay : onStartLiveOverlay}>
              {liveOverlay ? 'Stop Live Lines' : 'Start Live Lines'}
            </button>
          </div>
          <label className="field-label">Table rect on screen (x, y, width, height)</label>
          <div className="input-row">
            {['x', 'y', 'width', 'height'].map(key => (
              <input key={key} aria-label={key} value={calibration?.[key] ?? ''} onChange={e => updateCalibration({ [key]: e.target.value })} />
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Live Input + Auto Play · step 6</h2>
          <p>Touch events are dispatched inside the hosted activity. Tap coordinates must be measured by you; nothing is defaulted to a guessed button position.</p>
          <div className="mm-note">Motion profile: {settings.mode === 'Human' || settings.autoPlayMode === 'Pro Player' ? 'human-style' : 'assisted'} · bell-shaped aim speed, overshoot and correction, micro-adjustments, varied timing and power.</div>
          <div className="script-row">
            <div><b>Input injector</b><small>{inputInfo?.ready ? `ready :p${inputInfo?.process ?? '?'}` : (inputInfo?.reason || 'not attached')}</small></div>
            <button className="btn ghost" onClick={onAttachInput}>Attach Input</button>
          </div>
          <label className="field-label">Hosted process slot (:p0…:p3)</label>
          <div className="input-row">
            <input value={inputProcess} placeholder="0" onChange={e => setInputProcess(e.target.value)} />
            <button className={`btn ${autoLive ? 'ghost' : 'primary'}`} onClick={autoLive ? onStopLiveAuto : onStartLiveAuto}>
              {autoLive ? 'Stop Live Auto' : 'Start Live Auto'}
            </button>
          </div>
          <div className="script-row">
            <div><b>Auto status</b><small>{autoLive ? `${autoLiveInfo?.target || 'no target'} · sent ${autoLiveInfo?.stats?.sent || 0}/${autoLiveInfo?.stats?.shots || 0} · ${autoLiveInfo?.reason || ''}` : 'off'}</small></div>
          </div>
          <label className="field-label">Auto queue tap (screen x, y)</label>
          <div className="input-row">
            <input aria-label="queue x" placeholder="x" value={inputTaps?.queue?.x ?? ''} onChange={e => updateInputTap('queue', 'x', e.target.value)} />
            <input aria-label="queue y" placeholder="y" value={inputTaps?.queue?.y ?? ''} onChange={e => updateInputTap('queue', 'y', e.target.value)} />
          </div>
          <label className="field-label">Selected coin table tap (screen x, y)</label>
          <div className="input-row">
            <input aria-label="table x" placeholder="x" value={inputTaps?.tables?.[settings.queueTable || settings.tableProfile || 'London']?.x ?? ''} onChange={e => updateInputTap('table', 'x', e.target.value)} />
            <input aria-label="table y" placeholder="y" value={inputTaps?.tables?.[settings.queueTable || settings.tableProfile || 'London']?.y ?? ''} onChange={e => updateInputTap('table', 'y', e.target.value)} />
          </div>
        </section>

        <section className="panel">
          <h2>Session Guard · step 7</h2>
          <p>Overlay and live lines stop when the session closes or the hosted game exits. Exit detection uses activity lifecycle reports from the hosted process, or Usage access if you grant it — never Accessibility.</p>
          <div className="script-row">
            <div>
              <b>{guardInfo?.verdict || 'UNKNOWN'}</b>
              <small>evidence: {guardInfo?.evidence || 'NONE'} · top: {guardInfo?.topPackage || 'unknown'} · usage: {guardInfo?.usageAccess ? 'granted' : 'off'}</small>
            </div>
            <button className="btn ghost" onClick={onSessionGuard}>Check</button>
          </div>
          <div className="script-row">
            <div><b>Session</b><small>{sessionStatus?.state || 'idle'} · {sessionStatus?.text || ''}</small></div>
            <button className="btn ghost" onClick={onStopSession}>Stop Session</button>
          </div>
          <div className="mm-note">With no exit evidence the guard leaves the session running instead of guessing that the game closed.</div>
        </section>

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
        </section>

        <section className="panel">
          <h2>Script Integration</h2>
          <p>Scripts are versioned, hashed and run against the simulated/local bridge.</p>
          <div className="script-row">
            <div><b>autoplay-ratimoda.js</b><small>v2.1.0 · state machine</small></div>
            <button className="btn primary" disabled={runningScript} onClick={onRunScript}>{runningScript ? 'Running…' : 'Run test'}</button>
          </div>
          <div className="script-row">
            <div><b>prediction-lines.js</b><small>All-ball prediction lines · local engine</small></div>
            <button className="btn primary" disabled={runningLineScript} onClick={onRunLineScript}>{runningLineScript ? 'Running…' : 'Run test'}</button>
          </div>
          <div className="log-box">
            {scriptLog.length ? scriptLog.slice(-12).map((l, i) => <div key={i}>[{new Date(l.at).toLocaleTimeString()}] {l.msg}</div>) : <div className="muted">No script output yet.</div>}
          </div>
          <button className="text-btn" onClick={onClearLog}>Clear log</button>
        </section>

        <section className="panel">
          <h2>Build Info / Limits</h2>
          <div className="meta-line">D0J EnGine · private single-user build</div>
          <div className="meta-line">A1: No Accessibility, no purchase guard, no auto-back.</div>
          <div className="meta-line">2B fallback: session-scoped overlay permission only when game session starts.</div>
          <div className="meta-line">Prediction: demo table local/simulated. Real 8BP live lines need in-game bridge/patch.</div>
        </section>
      </div>
    </main>
  )
}
