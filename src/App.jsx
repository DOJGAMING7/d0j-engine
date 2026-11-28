import React, { useEffect, useRef, useState } from 'react'
import BundleGate from './components/BundleGate.jsx'
import PassGate from './components/PassGate.jsx'
import Home from './screens/Home.jsx'
import Settings from './screens/Settings.jsx'
import TableDemo from './screens/TableDemo.jsx'
import { createBridge } from './lib/bridge.js'
import { loadScriptSource, runScriptSource } from './lib/scriptRunner.js'
import { getPref, setPref, loadSettings, saveSettings as persistSettings } from './lib/storage.js'
import { getBundleMeta } from './lib/updater.js'
import { DEFAULT_CONFIG, GAME_PACKAGES, SUPPORTED_GAMES, normalizeMode } from './lib/config.js'
import { isUnlocked } from './lib/apkPass.js'
import native from './lib/native.js'
import { computePrediction, createDefaultTable } from './lib/prediction.js'

function Main() {
  const overlayMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('overlay') === '1'
  const [unlocked, setUnlocked] = useState(() => isUnlocked())
  const [tab, setTab] = useState('home')
  const [config, setConfigState] = useState(() => ({ ...DEFAULT_CONFIG, ...(getPref('config', {}) || {}) }))
  const [liveState, setLiveState] = useState({ phase: 'YOUR_TURN', turn: 'you', result: null, power: 74, queue: {} })
  const [settings, setSettings] = useState(loadSettings())
  const [bundleStatus, setBundleStatus] = useState(null)
  const [scriptLog, setScriptLog] = useState([])
  const [runningScript, setRunningScript] = useState(false)
  const [runningLineScript, setRunningLineScript] = useState(false)
  const [nativeStatus, setNativeStatus] = useState({ overlay: false, floating: false, native: native.isNative(), sessionActive: false })
  const [menuSignal, setMenuSignal] = useState(0)
  const [toast, setToast] = useState('')
  const [toastKind, setToastKind] = useState('info')
  const [sessionStatus, setSessionStatus] = useState({ state: 'idle', text: 'Ready' })
  const [testReport, setTestReport] = useState({ at: 0, items: [] })
  const bridgeRef = useRef(null)
  const handlersRef = useRef({})

  if (!bridgeRef.current) {
    bridgeRef.current = createBridge({
      onLog: msg => setScriptLog(prev => [...prev, { at: Date.now(), msg }].slice(-120))
    })
  }
  const bridge = bridgeRef.current
  const log = msg => setScriptLog(prev => [...prev, { at: Date.now(), msg: String(msg) }].slice(-120))

  const setConfig = patch => {
    const next = { ...config, ...(patch || {}) }
    if (next.autoPlayMode) next.mode = normalizeMode(next.autoPlayMode)
    setConfigState(next)
  }

  const saveSettings = patch => {
    const next = { ...settings, ...(patch || {}) }
    setSettings(next)
    persistSettings(next)
  }

  const pushStatus = async (state, text, notify = true) => {
    setSessionStatus({ state, text })
    if (notify && config.notificationsEnabled) {
      native.showNotification({ title: 'D0J EnGine', text, status: state }).catch(() => {})
    }
  }

  const say = (message, state = null, kind = 'info') => {
    const text = String(message)
    if (config.tempNotifications !== false) {
      setToastKind(kind)
      setToast(text)
      if (nativeStatus?.sessionActive) native.showToast({ text, kind }).catch(() => {})
    }
    log(text)
    if (state) pushStatus(state, text, config.notificationsEnabled !== false)
  }

  const runQuickTest = async (reason = 'manual') => {
    const items = []
    const add = (name, ok, detail) => items.push({ name, ok: !!ok, detail: String(detail || '') })
    pushStatus('testing', 'Running quick test...')
    try {
      const ping = await native.ping()
      add('Native bridge', ping?.ok !== false || !native.isNative(), native.isNative() ? (ping?.ok ? 'pong' : 'unavailable') : 'web mode')
      const overlay = await native.hasOverlayPermission()
      add('Overlay permission', overlay?.granted === true || !native.isNative(), overlay?.granted ? 'granted' : 'not granted')
      const session = await native.getSessionStatus()
      add('Session service', true, session?.active ? 'active' : 'ready')
      const table = bridge.getTable ? bridge.getTable() : (liveState.table || createDefaultTable())
      const prediction = computePrediction({ table, aim: { x: table.cue.x, y: Math.max(80, table.cue.y - 220) }, power: 74, spin: 0 })
      add('Prediction engine', !!prediction?.ok && Array.isArray(prediction?.path) && prediction.path.length > 1, prediction?.ok ? `path ${prediction.path.length}` : (prediction?.reason || 'no path'))
      try {
        const src = await loadScriptSource('autoplay-ratimoda.js')
        add('Ratimoda script', typeof src === 'string' && src.includes('Ratimoda'), `len ${src?.length || 0}`)
      } catch (e) { add('Ratimoda script', false, e?.message || e) }
      try {
        const src2 = await loadScriptSource('prediction-lines.js')
        add('Prediction script', typeof src2 === 'string' && src2.includes('predict'), `len ${src2?.length || 0}`)
      } catch (e) { add('Prediction script', false, e?.message || e) }
      add('Config', !!config && typeof config.power === 'number', `power ${config?.power}`)
    } catch (e) {
      add('Quick test', false, e?.message || e)
    }
    const ok = items.every(i => i.ok)
    const report = { at: Date.now(), ok, reason, items }
    setTestReport(report)
    const summary = `Quick test ${ok ? 'PASS' : 'FAIL'} · ${items.filter(i => i.ok).length}/${items.length}`
    say(summary, ok ? 'ready' : 'error', ok ? 'pass' : 'fail')
    if (config.tempNotifications !== false) {
      native.showToast({ text: summary, kind: ok ? 'pass' : 'fail' }).catch(() => {})
      native.showNotification({ title: 'D0J Test', text: summary, status: ok ? 'pass' : 'fail' }).catch(() => {})
    }
    return report
  }

  const handleStop = async () => {
    setConfigState(prev => ({ ...prev, autoPlay: false }))
    bridge.stopSimulation()
    await native.stopSession().catch(() => {})
    await refreshNativeStatus()
    say('D0J: safe stop · session halted', 'stopped')
  }

  const handlePlay = async (forced) => {
    const nextValue = typeof forced === 'boolean' ? forced : !config.autoPlay
    const next = { ...config, autoPlay: nextValue }
    if (next.autoPlayMode) next.mode = normalizeMode(next.autoPlayMode)
    setConfigState(next)
    await bridge.setConfig(next)
    if (next.autoPlay) {
      bridge.startSimulation()
      say('Autoplay ON', 'running')
    } else {
      bridge.stopSimulation()
      say('Autoplay OFF', 'ready')
    }
  }

  const runRatimoda = async () => {
    if (runningScript) return
    setRunningScript(true)
    pushStatus('finding', 'Finding shot...')
    try {
      bridge.reset()
      await bridge.setConfig(config)
      bridge.startSimulation()
      const source = await loadScriptSource('autoplay-ratimoda.js')
      const report = await runScriptSource(source, bridge.api, bridge.log)
      const finalConfig = await bridge.getConfig()
      setConfigState(prev => ({ ...prev, ...finalConfig }))
      say(`RATIMODA: ${report?.ok ? 'complete' : 'stopped'} · ${report?.shots || 0} shots`, report?.ok ? 'ready' : 'stopped')
    } catch (e) {
      log(`RATIMODA ERROR: ${e?.message || e}`)
      say(`RATIMODA error: ${e?.message || e}`, 'error')
    } finally {
      bridge.stopSimulation()
      setRunningScript(false)
    }
  }

  const runLineTest = async () => {
    if (runningLineScript) return
    setRunningLineScript(true)
    pushStatus('finding', 'Finding shot...')
    try {
      bridge.reset()
      await bridge.setConfig(config)
      const source = await loadScriptSource('prediction-lines.js')
      const report = await runScriptSource(source, bridge.api, bridge.log)
      const finalConfig = await bridge.getConfig()
      setConfigState(prev => ({ ...prev, ...finalConfig }))
      say(`LINES: ${report?.ok ? '3/3 predictions' : 'failed'} · simulated`, report?.ok ? 'ready' : 'error')
    } catch (e) {
      log(`LINE TEST ERROR: ${e?.message || e}`)
      say(`LINES error: ${e?.message || e}`, 'error')
    } finally {
      setRunningLineScript(false)
    }
  }

  const startSession = async (packageName = GAME_PACKAGES.eightBallPool) => {
    const pkg = String(packageName || GAME_PACKAGES.eightBallPool)
    const game = SUPPORTED_GAMES.find(g => g.packageName === pkg)
    if (config.runTestOnLaunch) runQuickTest('launch').catch(() => {})
    pushStatus('starting', `Starting ${game?.name || 'game'} session...`)
    const perm = await native.hasOverlayPermission()
    if (!perm.granted) {
      await native.requestOverlayPermission()
      say('Enable Display over other apps for session overlay, then tap Launch again', 'error')
      return { ok: false, error: 'OVERLAY_PERMISSION_REQUIRED' }
    }
    const res = await native.startSession({ packageName: pkg, launchGame: true })
    if (res?.ok) {
      setConfigState(prev => ({ ...prev, sessionActive: true }))
      say(`Session active · ${game?.name || pkg}`, 'running')
      await refreshNativeStatus()
      return res
    }
    // Fallback: launch without overlay session
    const launch = await native.launchGame(pkg)
    if (launch?.ok) say(`Opened ${game?.name || pkg} (no overlay session)`, 'ready')
    else say(`Launch failed: ${res?.error || launch?.error || 'unknown'}`, 'error')
    await refreshNativeStatus()
    return res?.ok ? res : launch
  }

  const requestOverlay = async () => {
    const current = await native.hasOverlayPermission()
    if (current.granted) return say('Overlay permission already granted', 'ready')
    await native.requestOverlayPermission()
    say('Enable Display over other apps, then return', 'starting')
  }

  const stopSession = async () => {
    await native.stopSession().catch(() => {})
    setConfigState(prev => ({ ...prev, sessionActive: false, autoPlay: false }))
    bridge.stopSimulation()
    await refreshNativeStatus()
    say('Session stopped', 'stopped')
  }

  const lockApp = async () => {
    setPref('apkUnlocked', false)
    await native.setUnlocked(false)
    await native.stopSession().catch(() => {})
    setUnlocked(false)
    setToast('D0J: app locked')
  }

  const refreshNativeStatus = async () => {
    const [overlay, floating, session] = await Promise.all([
      native.hasOverlayPermission(),
      native.isFloatingActive(),
      native.getSessionStatus()
    ])
    setNativeStatus({
      overlay: overlay.granted === true,
      floating: floating.active === true,
      sessionActive: session.sessionActive === true || floating.active === true,
      native: native.isNative()
    })
  }

  const handleCommand = command => {
    const handlers = handlersRef.current
    if (command === 'play' || command === 'toggleAutoPlay') handlers.handlePlay?.()
    else if (command === 'start' || command === 'launch8bp') handlers.startSession?.(GAME_PACKAGES.eightBallPool)
    else if (command === 'autoplay') handlers.runRatimoda?.()
    else if (command === 'stop') handlers.handleStop?.()
    else if (command === 'runTest') handlers.runQuickTest?.('overlay')
    else if (command === 'openMenu') { setTab('home'); setMenuSignal(n => n + 1); native.openApp() }
    else if (command === 'openTable') { setTab('table'); native.openApp() }
  }

  handlersRef.current = { handlePlay, startSession, runRatimoda, handleStop, runQuickTest }

  useEffect(() => {
    const stored = getPref('config', {})
    if (stored && typeof stored === 'object') setConfigState(prev => ({ ...prev, ...stored }))
    getBundleMeta().then(setBundleStatus).catch(() => {})
    bridge.getState().then(setLiveState).catch(() => {})
    return bridge.subscribe(s => setLiveState(s))
  }, [bridge])

  useEffect(() => {
    setPref('config', config)
    bridge.setConfig(config).catch(() => {})
    native.syncConfig(config).catch(() => {})
  }, [bridge, config])

  useEffect(() => {
    refreshNativeStatus()
    window.__d0jOpenModMenu = () => { setTab('home'); setMenuSignal(n => n + 1) }
    const onFocus = () => refreshNativeStatus()
    const onVisibility = () => { if (!document.hidden) refreshNativeStatus() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      delete window.__d0jOpenModMenu
    }
  }, [])

  useEffect(() => {
    let handles = []
    ;(async () => {
      handles.push(await native.addListener('floatingTap', () => { setTab('home'); setMenuSignal(n => n + 1) }))
      handles.push(await native.addListener('menuCommand', data => handleCommand(data?.command)))
      handles.push(await native.addListener('configChanged', patch => {
        if (!patch || typeof patch !== 'object') return
        const nextPatch = { ...patch }
        if (nextPatch.goldenTarget !== undefined) nextPatch.goldenTarget = Number(nextPatch.goldenTarget)
        if (nextPatch.power !== undefined) nextPatch.power = Number(nextPatch.power)
        setConfigState(prev => ({ ...prev, ...nextPatch }))
      }))
    })()
    return () => handles.forEach(handle => handle && handle.remove && handle.remove())
  }, [])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(''), 4200)
    return () => clearTimeout(timer)
  }, [toast])

  if (!unlocked) return <PassGate onUnlock={() => { setUnlocked(true); refreshNativeStatus() }} />

  if (overlayMode) {
    return (
      <div className="overlay-mode-root">
        <ModMenu
          config={config}
          setConfig={setConfig}
          state={liveState}
          nativeStatus={nativeStatus}
          sessionStatus={sessionStatus}
          testReport={testReport}
          runningScript={runningScript}
          runningLineScript={runningLineScript}
          onClose={() => { native.showNotification({ title: 'D0J', text: 'Menu hidden · tap D0J button to open', status: 'running' }).catch(() => {}); window.close?.() }}
          onPlay={handlePlay}
          onStartSession={startSession}
          onRunScript={runRatimoda}
          onStop={handleStop}
          onOpenTable={() => native.openApp().catch(() => {})}
          onRunLineScript={runLineTest}
          onRunQuickTest={runQuickTest}
        />
        {toast ? <div className={`ingame-toast ${toastKind}`}><b>D0J ENGINE</b>{toast}</div> : null}
      </div>
    )
  }

  const homeScreen = (
    <Home
      config={config}
      setConfig={setConfig}
      state={liveState}
      bundleStatus={bundleStatus}
      nativeStatus={nativeStatus}
      sessionStatus={sessionStatus}
      testReport={testReport}
      menuSignal={menuSignal}
      onOpenSettings={() => setTab('settings')}
      onRunScript={runRatimoda}
      runningScript={runningScript}
      onRunLineScript={runLineTest}
      runningLineScript={runningLineScript}
      onPlay={handlePlay}
      onStartSession={startSession}
      onStop={handleStop}
      onOpenTable={() => setTab('table')}
      onRequestOverlay={requestOverlay}
      onRunQuickTest={runQuickTest}
    />
  )

  const settingsScreen = (
    <Settings
      settings={settings}
      saveSettings={saveSettings}
      bundleStatus={bundleStatus}
      nativeStatus={nativeStatus}
      sessionStatus={sessionStatus}
      testReport={testReport}
      onBack={() => setTab('home')}
      onRunScript={runRatimoda}
      runningScript={runningScript}
      onRunLineScript={runLineTest}
      runningLineScript={runningLineScript}
      scriptLog={scriptLog}
      onClearLog={() => setScriptLog([])}
      onStartSession={startSession}
      onRequestOverlay={requestOverlay}
      onStopSession={stopSession}
      onLockApp={lockApp}
      onRunQuickTest={runQuickTest}
    />
  )

  const tableScreen = (
    <TableDemo
      config={config}
      setConfig={setConfig}
      state={liveState}
      bridge={bridge}
      onBack={() => setTab('home')}
      onLog={bridge.log}
    />
  )

  return (
    <>
      {tab === 'settings' ? settingsScreen : tab === 'table' ? tableScreen : homeScreen}
      {toast ? <div className={`ingame-toast ${toastKind}`}><b>D0J ENGINE</b>{toast}</div> : null}
    </>
  )
}

export default function App() {
  return <BundleGate><Main /></BundleGate>
}
