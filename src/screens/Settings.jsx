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
  screenCapture,
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
  const [apkUrl, setApkUrl] = useState(settings.apkUrl || '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [vmPath, setVmPath] = useState('')
  const [vmInfo, setVmInfo] = useState(null)
  const [vmApps, setVmApps] = useState([])
  const [vmActivity, setVmActivity] = useState('')
  const [hookInfo, setHookInfo] = useState(null)
  const [liveInfo, setLiveInfo] = useState(null)
  const [bindingInfo, setBindingInfo] = useState(null)
  const [probeInfo, setProbeInfo] = useState(null)
  const [vmMaps, setVmMaps] = useState([])
  const [probeResult, setProbeResult] = useState(null)
  const [probeCopied, setProbeCopied] = useState(false)
  const [readerProcess, setReaderProcess] = useState('0')
  const [probeBase, setProbeBase] = useState('')
  const [probeLength, setProbeLength] = useState('4096')
  const [vmMsg, setVmMsg] = useState('')
  const [vmBusy, setVmBusy] = useState(false)
  const [crashLog, setCrashLog] = useState('')
  const [crashCopied, setCrashCopied] = useState(false)

  useEffect(() => {
    native.getLastCrash().then(res => setCrashLog(res?.text || '')).catch(() => {})
  }, [])

  useEffect(() => {
    Promise.all([native.vmStatus(), native.vmHooks(), native.vmState(), native.vmBindings(), native.vmProbe(), native.vmList()])
      .then(([status, hooks, state, bindings, probe, list]) => {
        setVmInfo(status)
        setVmApps(Array.isArray(list?.apps) ? list.apps : [])
        setHookInfo(hooks)
        setLiveInfo(state)
        setBindingInfo(bindings)
        setProbeInfo(probe)
      })
      .catch(() => {})
  }, [])

  const refreshVm = async () => {
    const [status, hooks, state, bindings, probe, list] = await Promise.all([
      native.vmStatus(), native.vmHooks(), native.vmState(), native.vmBindings(), native.vmProbe(), native.vmList()
    ])
    setVmInfo(status)
    setVmApps(Array.isArray(list?.apps) ? list.apps : [])
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

  const loadMaps = async () => {
    const res = await native.vmMaps().catch(e => ({ ok: false, reason: String(e?.message || e) }))
    const maps = Array.isArray(res?.maps) ? res.maps : []
    setVmMaps(maps)
    setVmMsg(`Maps: ${res?.ok ? `${maps.length} real regions` : (res?.reason || res?.error || 'failed')}`)
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

  const copyProbe = async () => {
    if (!probeResult) return
    const text = JSON.stringify(probeResult, null, 2)
    try {
      await navigator.clipboard.writeText(text)
      setProbeCopied(true)
    } catch (e) {
      setVmMsg(`Copy failed: ${e?.message || e}`)
    }
  }

  const vmAction = async (action, label) => {
    setVmBusy(true)
    const res = await action().catch(e => ({ ok: false, error: String(e?.message || e) }))
    const detail = res?.ok ? 'ok' : (res?.code || res?.error || 'failed')
    setVmMsg(`${label}: ${detail}${res?.reason ? ` · ${res.reason}` : ''}`)
    await refreshVm()
    setVmBusy(false)
  }

  const pickApk = async () => {
    setVmBusy(true)
    const picked = await native.pickApk().catch(e => ({ ok: false, error: String(e?.message || e) }))
    if (picked?.ok && picked.path) {
      setVmPath(picked.path)
      const installed = await native.vmInstall(picked.path).catch(e => ({ ok: false, error: String(e?.message || e) }))
      const detail = installed?.ok ? 'ok' : (installed?.error || installed?.reason || installed?.code || 'failed')
      setVmMsg(`Picked: ${picked.name || picked.path} · Install: ${detail}`)
    } else {
      setVmMsg(`Pick: ${picked?.error || picked?.reason || 'cancelled'}`)
    }
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

  const copyCrash = async () => {
    if (!crashLog) return
    try {
      await navigator.clipboard.writeText(crashLog)
      setCrashCopied(true)
    } catch (e) {
      setMsg(`Crash copy failed: ${e?.message || e}`)
    }
  }

  const installApk = async () => {
    setBusy(true)
    let target = apkUrl.trim()
    if (!target || target.includes('/latest/')) {
      try {
        const releases = await fetch('https://api.github.com/repos/DOJGAMING7/d0j-engine/releases?per_page=1').then(r => r.json())
        target = releases?.[0]?.assets?.find(asset => String(asset.name).endsWith('.apk'))?.browser_download_url || ''
      } catch { target = '' }
    }
    if (!target.startsWith('https://')) {
      setMsg('No APK URL found')
      setBusy(false)
      return
    }
    saveSettings({ apkUrl })
    const res = await native.installApkFromUrl(target).catch(e => ({ ok: false, error: String(e?.message || e) }))
    setMsg(res?.ok ? 'Installing · app will restart when done' : `APK install: ${res?.error || res?.reason || 'failed'}`)
    setBusy(false)
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
          <p>APK parsing, DEX classloading and native-library extraction are real. Activity redirect can work from the instrumentation hook even when ActivityManager/PackageManager hooks fail; the detail line shows exactly why.</p>
          <div className="script-row">
            <div><b>Host state</b><small>{vmInfo?.ready ? 'HOOK READY' : (vmInfo?.reason || 'SUBSTRATE ONLY')}</small></div>
            <button className="btn ghost" onClick={refreshVm}>Refresh</button>
          </div>
          <div className="script-row">
            <div><b>Framework hooks</b><small>{hookInfo?.state || 'PENDING'} · redirect={hookInfo?.redirect || 'UNAVAILABLE'} · inst={hookInfo?.instrumentation || '—'} · am={hookInfo?.activityManager || '—'} · pm={hookInfo?.packageManager || '—'}</small></div>
            <button className="btn primary" disabled={vmBusy} onClick={() => vmAction(() => native.vmAttach(), 'Hooks')}>Attach</button>
          </div>
          {hookInfo?.reason ? <div className="meta-line">Hook detail: {hookInfo.reason}</div> : null}
          <label className="field-label">APK path on device (or use the picker)</label>
          <div className="input-row">
            <input value={vmPath} placeholder="/sdcard/8bp.apk" onChange={e => setVmPath(e.target.value)} />
          </div>
          <div className="btn-row">
            <button className="btn primary wide" disabled={vmBusy} onClick={pickApk}>Pick + Install APK</button>
          </div>
          <div className="btn-row">
            <button className="btn ghost" disabled={vmBusy} onClick={() => vmAction(() => native.vmDaemon(true), 'Daemon')}>Start daemon</button>
            <button className="btn ghost" disabled={vmBusy} onClick={() => vmAction(() => native.vmInstall(vmPath), 'Install typed path')}>Install typed path</button>
          </div>
          <label className="field-label">Activity override (optional)</label>
          <div className="input-row">
            <input value={vmActivity} placeholder="auto · use MAIN/LAUNCHER" onChange={e => setVmActivity(e.target.value)} />
          </div>
          <div className="meta-line">Auto activity: {vmApps[0]?.launchActivity || '—'}</div>
          <div className="meta-line">Activities: {(vmApps[0]?.activities || []).join(', ') || 'none'}</div>
          <div className="btn-row">
            <button className="btn primary" disabled={vmBusy} onClick={() => vmAction(() => native.vmLaunch(GAME_PACKAGES.eightBallPool, vmActivity.trim()), 'Launch')}>Launch 8BP in VM</button>
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
          <div className="btn-row">
            <button className="btn ghost" disabled={vmBusy} onClick={loadMaps}>Show memory bases</button>
          </div>
          {vmMaps.length > 0 && (
            <>
              <label className="field-label">Real readable regions — select a base</label>
              <div className="input-row">
                <select className="probe-select" value={probeBase} onChange={e => setProbeBase(e.target.value)}>
                  <option value="">Choose a region…</option>
                  {vmMaps.map((region, index) => (
                    <option key={`${region.start}-${index}`} value={region.start}>
                      0x{region.start}–0x{region.end} · {region.perms} · {Math.round((region.size || 0) / 1024)}KB{region.path ? ` · ${region.path}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
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
          <label className="field-label">Export probe JSON (send to developer)</label>
          <textarea className="probe-export" readOnly value={probeResult ? JSON.stringify(probeResult, null, 2) : 'Run Capture A, Capture B, then Diff to generate a report.'} />
          <button className="btn primary wide" disabled={!probeResult} onClick={copyProbe}>{probeCopied ? 'COPIED ✓' : 'COPY PROBE JSON'}</button>
          <div className="meta-line">Last: {vmMsg || 'idle'}</div>
        </section>

        <section className="panel">
          <h2>Live Overlay Lines · step 5</h2>
          <p>Draws planner output over the game through the session overlay. Calibration maps measured table coordinates to your screen; no coordinates are guessed.</p>
          <div className="script-row">
            <div><b>Overlay</b><small>{liveOverlay ? 'running' : 'off'} · screen reading {screenCapture ? 'on' : 'off'} · {liveOverlayInfo?.ok ? `${liveOverlayInfo.balls} balls · ${liveOverlayInfo.source}${liveOverlayInfo.simulated ? ' (simulated)' : ''}` : (liveOverlayInfo?.reason || 'idle')}</small></div>
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
          <h2>APK Updates</h2>
          <p>Downloads the newest GitHub release APK, opens the system installer, then relaunches the app. Leave the URL blank for the latest release.</p>
          <label className="field-label">APK URL (blank = latest release)</label>
          <div className="input-row">
            <input value={apkUrl} placeholder="https://github.com/.../D0J-ENGINE-V1.apk" onChange={e => setApkUrl(e.target.value)} />
            <button className="btn ghost" onClick={() => saveSettings({ apkUrl })}>Save</button>
          </div>
          <div className="btn-row">
            <button className="btn primary wide" disabled={busy} onClick={installApk}>Download + Install + Restart</button>
          </div>
          <div className="meta-line">Last: {msg || 'idle'}</div>
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
          <h2>Diagnostics</h2>
          <p>If the app crashes, restart it and copy the saved stack trace here. Nothing is uploaded automatically.</p>
          <textarea className="probe-export" readOnly value={crashLog || 'No crash recorded.'} />
          <div className="btn-row">
            <button className="btn ghost" disabled={!crashLog} onClick={copyCrash}>{crashCopied ? 'COPIED ✓' : 'COPY CRASH LOG'}</button>
            <button className="btn ghost" disabled={!crashLog} onClick={async () => { await native.clearLastCrash().catch(() => {}); setCrashLog(''); setCrashCopied(false) }}>Clear</button>
          </div>
        </section>

        <section className="panel">
          <h2>Build Info / Limits</h2>
          <div className="meta-line">SNAKE ENGINE · private single-user build</div>
          <div className="meta-line">A1: No Accessibility, no purchase guard, no auto-back.</div>
          <div className="meta-line">2B fallback: session-scoped overlay permission only when game session starts.</div>
          <div className="meta-line">Live lines: on-device screen reading during an active session. Demo table stays local/simulated.</div>
        </section>
      </div>
    </main>
  )
}
