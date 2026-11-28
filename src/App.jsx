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
import { mapSnapshotToTable, snapshotStatus } from './lib/liveState.js'
import { buildLiveOverlay, DEFAULT_CALIBRATION, overlayJson } from './lib/liveLines.js'
import { chooseShot, planHumanShot, planInputShot, queueSteps, shotSignature } from './lib/autoShots.js'
import { createHumanMotion } from './lib/humanMotion.js'
import { shouldCloseSession } from './lib/sessionGuard.js'

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
  const [liveOverlay, setLiveOverlay] = useState(false)
  const [liveOverlayInfo, setLiveOverlayInfo] = useState(null)
  const [screenCapture, setScreenCapture] = useState(false)
  const [calibration, setCalibration] = useState(() => ({ ...DEFAULT_CALIBRATION, ...(getPref('liveCalibration', {}) || {}) }))
  const [inputTaps, setInputTaps] = useState(() => getPref('inputTaps', { queue: null, tables: {} }) || { queue: null, tables: {} })
  const [inputProcess, setInputProcess] = useState('0')
  const [inputInfo, setInputInfo] = useState(null)
  const [autoLive, setAutoLive] = useState(false)
  const [autoLiveInfo, setAutoLiveInfo] = useState(null)
  const [nativeStatus, setNativeStatus] = useState({ inWindow: false, systemOverlay: false, native: native.isNative(), sessionActive: false })
  const [menuSignal, setMenuSignal] = useState(0)
  const [menuCloseSignal, setMenuCloseSignal] = useState(0)
  const [toast, setToast] = useState('')
  const [toastKind, setToastKind] = useState('info')
  const [sessionStatus, setSessionStatus] = useState({ state: 'idle', text: 'Ready' })
  const [guardInfo, setGuardInfo] = useState(null)
  const [testReport, setTestReport] = useState({ at: 0, items: [] })
  const bridgeRef = useRef(null)
  const handlersRef = useRef({})
  const liveTimerRef = useRef(null)
  const liveActiveRef = useRef(false)
  const liveLastRef = useRef('')
  const liveConfigRef = useRef(config)
  const liveCalibrationRef = useRef(calibration)
  const autoActiveRef = useRef(false)
  const autoTimerRef = useRef(null)
  const autoLastShotRef = useRef(0)
  const autoLastSigRef = useRef('')
  const autoStatsRef = useRef({ shots: 0, sent: 0, failed: 0 })
  const autoQueueDoneRef = useRef(false)
  const inputRef = useRef(null)
  const autoConfigRef = useRef(config)
  const humanMotionRef = useRef(null)
  const turnKeyRef = useRef('')
  const reactionRef = useRef(0)

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
      native.showNotification({ title: 'SNAKE ENGINE', text, status: state }).catch(() => {})
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
    // Core checks must pass. Device gates are informational: they depend on
    // permissions or hardware that the user grants after the app opens.
    const add = (name, ok, detail, group = 'core') =>
      items.push({ name, ok: !!ok, detail: String(detail || ''), group })
    pushStatus('testing', 'Running quick test...')
    let step = 'Quick test'
    try {
      step = 'Native bridge'
      const ping = await native.ping()
      add('Native bridge', ping?.ok !== false || !native.isNative(), native.isNative() ? (ping?.ok ? 'pong' : 'unavailable') : 'web mode')
      step = 'Installed game discovery'
      const discovery = await native.discoverGame(GAME_PACKAGES.eightBallPool)
      add('Installed game discovery', discovery?.installed === true || !native.isNative(),
        native.isNative()
          ? (discovery?.installed ? `${discovery.versionName || '?'} · ${discovery.splitCount || 0} splits · ${discovery.launchActivity || 'no activity'}` : (discovery?.reason || discovery?.error || 'not installed'))
          : 'web mode')
      step = 'Notification permission'
      const notif = await native.hasNotificationPermission()
      add('Notification permission', notif?.granted === true || !native.isNative(), notif?.granted ? 'granted' : 'pending until granted', 'device')
      step = 'Session service'
      const session = await native.getSessionStatus()
      add('Session service', true, session?.active ? 'active' : 'ready')
      step = 'Prediction engine'
      const table = bridge.getTable ? await bridge.getTable() : (liveState.table || createDefaultTable())
      const prediction = computePrediction({ table, aim: { x: table.cue.x, y: Math.max(80, table.cue.y - 220) }, power: 74, spin: 0 })
      add('Prediction engine', !!prediction?.ok && Array.isArray(prediction?.path) && prediction.path.length > 1, prediction?.ok ? `path ${prediction.path.length}` : (prediction?.reason || 'no path'))
      step = 'Ratimoda script'
      try {
        const src = await loadScriptSource('autoplay-ratimoda.js')
        add('Ratimoda script', typeof src === 'string' && src.includes('Ratimoda'), `len ${src?.length || 0}`)
      } catch (e) { add('Ratimoda script', false, e?.message || e) }
      step = 'Prediction script'
      try {
        const src2 = await loadScriptSource('prediction-lines.js')
        add('Prediction script', typeof src2 === 'string' && src2.includes('predict'), `len ${src2?.length || 0}`)
      } catch (e) { add('Prediction script', false, e?.message || e) }
      step = 'Config'
      add('Config', !!config && typeof config.power === 'number', `power ${config?.power}`)
      step = 'VM state bridge'
      try {
        const stateProbe = await native.vmState()
        add('VM state bridge', stateProbe?.ok !== false || !native.isNative(),
          native.isNative() ? (stateProbe?.ok ? 'ready' : (stateProbe?.reason || 'unavailable')) : 'web mode')
      } catch (e) { add('VM state bridge', false, e?.message || e) }
      step = 'Line geometry'
      try {
        const sample = {
          source: 'vm', simulated: true, width: 600, height: 900,
          ballRadius: 11, pocketRadius: 18, cueX: 300, cueY: 660,
          balls: [{ id: '1', x: 300, y: 300 }, { id: '2', x: 180, y: 420 }],
          pockets: [
            { id: 'TL', x: 0, y: 0 }, { id: 'TM', x: 300, y: 0 }, { id: 'TR', x: 600, y: 0 },
            { id: 'BL', x: 0, y: 900 }, { id: 'BM', x: 300, y: 900 }, { id: 'BR', x: 600, y: 900 }
          ]
        }
        const built = buildLiveOverlay(sample, { calibration: DEFAULT_CALIBRATION })
        add('Line geometry', built.ok && built.lines.length > 0 && built.simulated === true,
          built.ok ? `${built.balls} balls · ${built.source} (simulated)` : built.reason)
      } catch (e) { add('Line geometry', false, e?.message || e) }
      step = 'VM hooks'
      try {
        const hooks = await native.vmHooks()
        add('VM hooks', hooks?.ready === true, `${hooks?.state || 'PENDING'} · inst=${hooks?.instrumentation || '—'} am=${hooks?.activityManager || '—'} pm=${hooks?.packageManager || '—'}${hooks?.reason ? ` · ${hooks.reason}` : ''}`, 'device')
      } catch (e) { add('VM hooks', false, e?.message || e, 'device') }
    } catch (e) {
      add(step, false, e?.message || e)
    }
    const core = items.filter(i => i.group !== 'device')
    const gates = items.filter(i => i.group === 'device')
    const ok = core.every(i => i.ok)
    const failed = core.filter(i => !i.ok)
    const firstFailed = failed[0]
    const report = { at: Date.now(), ok, reason, items, core, gates, failed: failed.map(i => i.name) }
    setTestReport(report)
    const coreText = `${core.filter(i => i.ok).length}/${core.length}`
    const summary = ok
      ? `Quick test PASS · core ${coreText} · device gates ${gates.filter(i => i.ok).length}/${gates.length}`
      : `Quick test FAIL · core ${coreText} · ${firstFailed?.name || 'error'}: ${String(firstFailed?.detail || '').slice(0, 80)}`
    say(summary, ok ? 'ready' : 'error', ok ? 'pass' : 'fail')
    if (config.tempNotifications !== false) {
      native.showToast({ text: summary, kind: ok ? 'pass' : 'fail' }).catch(() => {})
      native.showNotification({ title: 'SNAKE ENGINE Test', text: summary, status: ok ? 'pass' : 'fail' }).catch(() => {})
    }
    return report
  }

  const handleStop = async () => {
    setConfigState(prev => ({ ...prev, autoPlay: false }))
    await stopLiveAuto()
    await stopLiveOverlay()
    bridge.stopSimulation()
    await native.stopSession().catch(() => {})
    await refreshNativeStatus()
    say('SNAKE ENGINE: safe stop · session halted', 'stopped')
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
      const drawn = Number(report?.lines || 0)
      const total = Number(report?.balls || 0)
      say(`LINES: ${report?.ok ? `${drawn}/${total} balls` : 'failed'} · simulated`, report?.ok ? 'ready' : 'error')
      if (!overlayMode && report?.ok) setTab('table')
    } catch (e) {
      log(`LINE TEST ERROR: ${e?.message || e}`)
      say(`LINES error: ${e?.message || e}`, 'error')
    } finally {
      setRunningLineScript(false)
    }
  }

  const runLiveLines = async () => {
    if (runningLineScript) return
    const res = await native.vmState().catch(() => ({ ok: false, error: 'STATE_CALL_FAILED' }))
    if (!res?.ok) {
      say(`LIVE LINES: ${res?.reason || res?.code || res?.error || 'state unavailable'}`, 'error')
      return
    }
    const status = snapshotStatus(res)
    if (!status.ok) {
      say(`LIVE LINES: ${status.reason}`, 'error')
      return
    }
    let table
    try {
      table = mapSnapshotToTable(res)
    } catch (e) {
      say(`LIVE LINES: ${e?.message || e}`, 'error')
      return
    }

    setRunningLineScript(true)
    try {
      await bridge.setConfig({ ...config, showLines: true, keepLines: true })
      await bridge.setState({ table, phase: 'YOUR_TURN', turn: 'you', result: null })
      if (bridge.api.clearLines) await bridge.api.clearLines()
      const source = await loadScriptSource('prediction-lines.js')
      const report = await runScriptSource(source, bridge.api, bridge.log)
      const drawn = Number(report?.lines || 0)
      const total = Number(report?.balls || 0)
      say(`LIVE LINES: ${report?.ok ? `${drawn}/${total} balls` : 'failed'} · ${res.source || 'unknown'}${status.simulated ? ' (simulated)' : ''}`, report?.ok ? 'ready' : 'error')
      if (!overlayMode && report?.ok) setTab('table')
    } catch (e) {
      say(`LIVE LINES error: ${e?.message || e}`, 'error')
    } finally {
      setRunningLineScript(false)
    }
  }

  const pushLiveOverlay = async () => {
    const res = await native.vmState().catch(() => ({ ok: false, reason: 'STATE_CALL_FAILED' }))
    if (!res?.ok) {
      setLiveOverlayInfo({ ok: false, reason: res?.reason || res?.code || 'STATE_UNAVAILABLE', lines: [] })
      await native.clearOverlayLines().catch(() => {})
      return
    }
    const built = buildLiveOverlay(res, {
      power: liveConfigRef.current.power,
      spin: liveConfigRef.current.lineSpin,
      calibration: liveCalibrationRef.current,
      finding: String(res.phase || '').toUpperCase().includes('FIND')
    })
    if (!built.ok) {
      setLiveOverlayInfo(built)
      await native.clearOverlayLines().catch(() => {})
      return
    }
    await native.setOverlayLines(overlayJson(built.lines)).catch(() => {})
    setLiveOverlayInfo(built)
    const key = `${built.source}:${built.balls}:${built.simulated}`
    if (liveLastRef.current !== key) {
      liveLastRef.current = key
      say(`LIVE OVERLAY: ${built.balls} balls · ${built.source}${built.simulated ? ' (simulated)' : ''}`, 'ready')
    }
  }

  const liveTick = async () => {
    if (!liveActiveRef.current) return
    try { await pushLiveOverlay() } catch (e) { log(`LIVE OVERLAY error: ${e?.message || e}`) }
    if (liveActiveRef.current) liveTimerRef.current = setTimeout(liveTick, 320)
  }

  const startLiveOverlay = async () => {
    if (liveActiveRef.current) return
    liveActiveRef.current = true
    liveLastRef.current = ''
    setLiveOverlay(true)
    say('LOCAL PREVIEW: simulated state only · no screen capture', 'running')
    await liveTick()
  }

  const stopLiveOverlay = async () => {
    liveActiveRef.current = false
    setLiveOverlay(false)
    if (liveTimerRef.current) {
      clearTimeout(liveTimerRef.current)
      liveTimerRef.current = null
    }
    await native.clearOverlayLines().catch(() => {})
    say('LOCAL PREVIEW: stopped', 'stopped')
  }

  const updateCalibration = patch => {
    const next = { ...liveCalibrationRef.current, ...(patch || {}) }
    liveCalibrationRef.current = next
    setCalibration(next)
  }

  const updateInputTap = (key, axis, value) => {
    setInputTaps(prev => {
      if (key === 'queue') {
        const current = prev.queue || {}
        return { ...prev, queue: { ...current, [axis]: Number(value) || 0 } }
      }
      const tables = { ...(prev.tables || {}) }
      const table = config.queueTable || config.tableProfile || 'London'
      tables[table] = { ...(tables[table] || {}), [axis]: Number(value) || 0 }
      return { ...prev, tables }
    })
  }

  const attachInput = async () => {
    const res = await native.vmAttachInput(Number(inputProcess) || 0)
    inputRef.current = res?.ready ? { ready: true, reason: '' } : { ready: false, reason: res?.reason || res?.message || 'INPUT_PENDING' }
    setInputInfo({ ...res, process: Number(res?.process ?? inputProcess) || 0 })
    say(`LIVE INPUT: ${res?.ready ? 'attached' : 'pending'} · :p${res?.process ?? inputProcess} · ${res?.reason || res?.message || '—'}`, res?.ready ? 'ready' : 'error')
    return res
  }

  const runQueueSteps = async () => {
    if (autoQueueDoneRef.current) return
    const steps = queueSteps(autoConfigRef.current, inputTaps)
    autoQueueDoneRef.current = true
    for (const step of steps) {
      const res = await native.vmInputTap(step.x, step.y).catch(() => ({ injected: false }))
      log(`queue tap ${Math.round(step.x)},${Math.round(step.y)} ${res?.injected ? 'ok' : 'blocked'}`)
      if (step.wait > 0) await new Promise(resolve => setTimeout(resolve, Math.min(5000, step.wait)))
    }
  }

  const autoTick = async () => {
    if (!autoActiveRef.current) return
    const stats = autoStatsRef.current
    const liveConfig = autoConfigRef.current
    try {
      if (liveConfig.autoQueue) await runQueueSteps()
      const res = await native.vmState().catch(() => ({ ok: false, reason: 'STATE_CALL_FAILED' }))
      if (!res?.ok) {
        setAutoLiveInfo({ ok: false, reason: res?.reason || 'STATE_UNAVAILABLE', stats: { ...stats } })
      } else {
        const built = buildLiveOverlay(res, {
          power: liveConfig.power,
          spin: liveConfig.lineSpin,
          calibration: liveCalibrationRef.current
        })
        if (!built.ok) {
          setAutoLiveInfo({ ok: false, reason: built.reason, source: res.source, stats: { ...stats } })
        } else {
          await native.setOverlayLines(overlayJson(built.lines)).catch(() => {})
          const chosen = chooseShot(built, liveConfig, res)
          const turnKey = String(res.turn || res.phase || '')
          const turn = turnKey.toLowerCase()
          const hasTurn = turnKey.length > 0
          const yourTurn = hasTurn && (turn.includes('you') || turn.includes('your') || turn.includes('your_turn'))
          const turnReason = hasTurn ? '' : 'turn unknown'
          const motion = humanMotionRef.current
          if (yourTurn && turnKeyRef.current !== turnKey) {
            turnKeyRef.current = turnKey
            const difficulty = chosen.ok && motion?.difficulty
              ? motion.difficulty(chosen.shot.distance, chosen.shot) : 0.5
            reactionRef.current = Date.now() + (motion?.reactionDelay
              ? motion.reactionDelay(difficulty) : 700)
          }
          const thinking = Date.now() < reactionRef.current
          const signature = chosen.ok ? shotSignature(chosen.shot, liveConfig) : ''
          const cooldown = Date.now() - autoLastShotRef.current > (liveConfig.autoPlayMode === 'Pro Player' ? 1600 : 900)
          if (chosen.ok && yourTurn && !thinking && cooldown && signature !== autoLastSigRef.current) {
            const planned = planHumanShot(built, chosen.shot, liveConfig, motion)
            if (planned.ok) {
              const usePath = planned.path?.points?.length > 2
              const sent = usePath
                ? await native.vmInputPath(JSON.stringify(planned.path)).catch(() => ({ injected: false }))
                : await native.vmInputSwipe(planned.swipe).catch(() => ({ injected: false }))
              stats.shots += 1
              if (sent?.injected) stats.sent += 1
              else stats.failed += 1
              autoLastShotRef.current = Date.now()
              autoLastSigRef.current = signature
              log(`live shot ${planned.target} · ${planned.profile || 'flat'}${planned.mistake ? ' · slip' : ''} → ${sent?.injected ? 'sent' : `blocked:${sent?.reason || 'unknown'}`}`)
            }
          }
          setAutoLiveInfo({
            ok: true,
            reason: chosen.ok ? (hasTurn ? (yourTurn ? (thinking ? 'thinking' : (cooldown ? 'shot planned' : 'cooldown')) : 'opponent turn') : turnReason) : chosen.reason,
            target: chosen.shot?.id || null,
            source: built.source,
            simulated: built.simulated,
            stats: { ...stats }
          })
        }
      }
    } catch (e) {
      setAutoLiveInfo({ ok: false, reason: e?.message || String(e), stats: { ...stats } })
      log(`LIVE AUTO error: ${e?.message || e}`)
    }
    if (autoActiveRef.current) autoTimerRef.current = setTimeout(autoTick, 380)
  }

  const startLiveAuto = async () => {
    if (autoActiveRef.current) return
    if (!inputRef.current?.ready) await attachInput()
    autoActiveRef.current = true
    autoQueueDoneRef.current = false
    autoLastShotRef.current = 0
    autoLastSigRef.current = ''
    autoStatsRef.current = { shots: 0, sent: 0, failed: 0 }
    if (!humanMotionRef.current) humanMotionRef.current = createHumanMotion(Date.now())
    turnKeyRef.current = ''
    reactionRef.current = 0
    setAutoLive(true)
    say('LIVE AUTO: starting · needs measured turn + bound activity', 'running')
    await autoTick()
  }

  const stopLiveAuto = async () => {
    autoActiveRef.current = false
    setAutoLive(false)
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current)
      autoTimerRef.current = null
    }
    await native.clearOverlayLines().catch(() => {})
    say('LIVE AUTO: stopped', 'stopped')
  }

  const startSession = async (packageName = GAME_PACKAGES.eightBallPool) => {
    const pkg = String(packageName || GAME_PACKAGES.eightBallPool)
    const game = SUPPORTED_GAMES.find(g => g.packageName === pkg)
    pushStatus('starting', `Starting ${game?.name || 'game'} session...`)
    if (native.isNative()) {
      const notif = await native.hasNotificationPermission().catch(() => ({ granted: true }))
      if (notif.granted !== true) {
        const asked = await native.requestNotificationPermission().catch(() => ({ granted: false }))
        if (asked?.granted !== true) say('Notification permission not granted · session status will be limited', 'starting')
      }
    }
    // No screen capture, no key, no server and no system overlay. Discover the
    // Play Store build by PackageManager, register its paths read-only, then
    // try to start the real game Activity inside our hosted window.
    const discovery = await native.discoverGame(pkg).catch(e => ({ ok: false, error: String(e?.message || e) }))
    if (native.isNative() && discovery?.installed !== true) {
      say(`${game?.name || pkg} not installed: ${discovery?.reason || discovery?.error || 'unknown'}`, 'error')
      return { ok: false, error: 'GAME_NOT_INSTALLED' }
    }
    await native.vmRegisterInstalled(pkg).catch(() => {})
    await native.vmAttach().catch(() => {})

    const session = await native.startSession({ packageName: pkg, launchGame: false })
      .catch(e => ({ ok: false, error: String(e?.message || e) }))
    if (session?.ok) setConfigState(prev => ({ ...prev, sessionActive: true }))

    let hosted = null
    if (native.isNative()) {
      hosted = await native.vmLaunch(pkg, discovery?.launchActivity || '').catch(() => ({ ok: false }))
    }
    if (hosted?.ok && hosted?.started === true) {
      say(`Hosted ${game?.name || pkg} · in-window controls active`, 'running')
      await refreshNativeStatus()
      if (config.runTestOnLaunch) runQuickTest('launch').catch(() => {})
      return { ...session, hosted: true, launched: true, discovery }
    }

    // Honest fallback: the real installed game still opens through this client,
    // but we do not claim an in-window game when the framework hook is not ready.
    const launch = await native.launchGame(pkg)
    const reason = hosted?.reason || hosted?.state || session?.error || launch?.error || 'unknown'
    say(launch?.ok
      ? `Session active · ${game?.name || pkg} launched externally (hosted: ${reason})`
      : `Launch failed: ${reason}`,
    launch?.ok ? 'ready' : 'error')
    await refreshNativeStatus()
    if (session?.ok && config.runTestOnLaunch) runQuickTest('launch').catch(() => {})
    return { ...launch, hosted: false, discovery, reason }
  }

  const requestNotifications = async () => {
    const res = await native.requestNotificationPermission()
    setNativeStatus(prev => ({ ...prev, notifications: res?.granted === true }))
    say(res?.granted ? 'Notification permission granted' : 'Notification permission not granted', res?.granted ? 'ready' : 'error')
  }

  const requestUsage = async () => {
    await native.requestUsageAccess()
    const res = await native.hasUsageAccess()
    setNativeStatus(prev => ({ ...prev, usageAccess: res?.granted === true }))
    say('Usage access is optional · only used for auto-stop', 'starting')
  }

  const stopSession = async () => {
    liveActiveRef.current = false
    if (liveTimerRef.current) {
      clearTimeout(liveTimerRef.current)
      liveTimerRef.current = null
    }
    await native.clearOverlayLines().catch(() => {})
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
    setToast('SNAKE ENGINE: app locked')
  }

  const refreshNativeStatus = async () => {
    const [hud, session, notif, usage] = await Promise.all([
      native.isInGameHudActive(),
      native.getSessionStatus(),
      native.hasNotificationPermission(),
      native.hasUsageAccess()
    ])
    setNativeStatus({
      inWindow: hud.inWindow === true,
      systemOverlay: false,
      sessionActive: session.sessionActive === true || hud.active === true,
      notifications: notif.granted === true,
      usageAccess: usage.granted === true,
      native: native.isNative()
    })
  }

  const reportSessionGuard = async () => {
    const res = await native.vmSessionWatch().catch(() => ({ ok: false, verdict: 'WATCH_UNAVAILABLE' }))
    setGuardInfo(res)
    const verdict = res?.verdict || res?.state || 'UNKNOWN'
    say(`SESSION GUARD: ${verdict} · ${res?.evidence || 'NONE'} · ${res?.topPackage || '—'}`,
      verdict === 'GAME_ALIVE' || verdict === 'UNKNOWN' ? 'ready' : 'error')
    return res
  }

  const reportVmStatus = async () => {
    const res = await native.vmStatus()
    const ready = res?.ready === true
    const reason = res?.reason || res?.message || (ready ? 'hook attached' : 'stub only')
    say(`VM HOST: ${ready ? 'HOOK READY' : 'SUBSTRATE ONLY'} · ${reason}`, res?.ok ? 'ready' : 'error')
    return res
  }

  const startVmHost = async () => {
    const res = await native.vmDaemon(true)
    say(`VM HOST: ${res?.ok ? 'daemon starting' : `failed · ${res?.code || res?.error || 'unknown'}`}`, res?.ok ? 'ready' : 'error')
    return res
  }

  const attachVmHooks = async () => {
    const res = await native.vmAttach()
    const attached = res?.ready === true
    say(`VM HOOKS: ${attached ? 'ATTACHED' : 'PENDING'} · ${res?.reason || res?.message || res?.code || 'unknown'}`, attached ? 'ready' : 'error')
    return res
  }

  const reportVmHooks = async () => {
    const res = await native.vmHooks()
    say(`VM HOOKS: ${res?.state || 'PENDING'} · redirect=${res?.redirect || 'UNAVAILABLE'} · inst=${res?.instrumentation || '—'} am=${res?.activityManager || '—'} pm=${res?.packageManager || '—'} · ${res?.reason || ''}`, res?.ready ? 'ready' : 'error')
    return res
  }

  const handleCommand = command => {
    const handlers = handlersRef.current
    if (command === 'play' || command === 'toggleAutoPlay') handlers.handlePlay?.()
    else if (command === 'start' || command === 'launch8bp') handlers.startSession?.(GAME_PACKAGES.eightBallPool)
    else if (command === 'autoplay') handlers.runRatimoda?.()
    else if (command === 'stop') handlers.handleStop?.()
    else if (command === 'runTest') handlers.runQuickTest?.('overlay')
    else if (command === 'runLineTest' || command === 'runLines') handlers.runLineTest?.()
    else if (command === 'runLiveLines') handlers.runLiveLines?.()
    else if (command === 'liveStart') handlers.startLiveOverlay?.()
    else if (command === 'liveStop') handlers.stopLiveOverlay?.()
    else if (command === 'autoLiveStart') handlers.startLiveAuto?.()
    else if (command === 'autoLiveStop') handlers.stopLiveAuto?.()
    else if (command === 'inputAttach') handlers.attachInput?.()
    else if (command === 'sessionGuard') handlers.reportSessionGuard?.()
    else if (command === 'vmStatus') handlers.reportVmStatus?.()
    else if (command === 'vmStart') handlers.startVmHost?.()
    else if (command === 'vmAttach') handlers.attachVmHooks?.()
    else if (command === 'vmHooks') handlers.reportVmHooks?.()
    else if (command === 'requestNotifications') handlers.requestNotifications?.()
    else if (command === 'requestUsage') handlers.requestUsage?.()
    else if (command === 'openMenu') { setTab('home'); setMenuSignal(n => n + 1); native.openApp() }
    else if (command === 'openTable') { setTab('table'); native.openApp() }
  }

  handlersRef.current = { handlePlay, startSession, runRatimoda, runLineTest, runLiveLines, startLiveOverlay, stopLiveOverlay, startLiveAuto, stopLiveAuto, attachInput, handleStop, runQuickTest, reportSessionGuard, reportVmStatus, startVmHost, attachVmHooks, reportVmHooks, requestNotifications, requestUsage }

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
    liveConfigRef.current = config
    autoConfigRef.current = config
  }, [bridge, config])

  useEffect(() => {
    liveCalibrationRef.current = calibration
    setPref('liveCalibration', calibration)
  }, [calibration])

  useEffect(() => () => {
    if (liveTimerRef.current) clearTimeout(liveTimerRef.current)
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current)
    liveActiveRef.current = false
    autoActiveRef.current = false
  }, [])

  useEffect(() => { setPref('inputTaps', inputTaps) }, [inputTaps])

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
      handles.push(await native.addListener('sessionEnded', data => {
        setSessionStatus({ state: 'stopped', text: 'Session stopped' })
        setGuardInfo(prev => ({ ...(prev || {}), verdict: 'SESSION_ENDED', reason: data?.reason || 'closed' }))
        setMenuCloseSignal(n => n + 1)
        handlersRef.current.stopLiveAuto?.()
        handlersRef.current.stopLiveOverlay?.()
        say(`SESSION ENDED: ${data?.reason || 'closed'}`, 'stopped')
        if (overlayMode) window.close?.()
      }))
      handles.push(await native.addListener('hostingFailed', data => {
        const reason = data?.reason || 'HOSTING_UNAVAILABLE'
        say(`In-window hosting unavailable · ${reason}`, 'error')
        setGuardInfo(prev => ({ ...(prev || {}), verdict: 'HOSTING_UNAVAILABLE', reason }))
        const pkg = data?.packageName || GAME_PACKAGES.eightBallPool
        native.launchGame(pkg).then(res => {
          say(res?.ok
            ? `Session active · ${pkg} opened externally (in-window hosting unavailable)`
            : `External launch failed: ${res?.error || 'unknown'}`,
          res?.ok ? 'ready' : 'error')
        }).catch(() => {})
      }))
      handles.push(await native.addListener('configChanged', patch => {
        if (!patch || typeof patch !== 'object') return
        const nextPatch = { ...patch }
        if (nextPatch.goldenTarget !== undefined) nextPatch.goldenTarget = Number(nextPatch.goldenTarget)
        if (nextPatch.power !== undefined) nextPatch.power = Number(nextPatch.power)
        setConfigState(prev => {
          const changed = Object.keys(nextPatch).some(key => prev[key] !== nextPatch[key])
          return changed ? { ...prev, ...nextPatch } : prev
        })
        if (nextPatch.autoPlay !== undefined && autoConfigRef.current.autoPlay !== nextPatch.autoPlay) {
          handlersRef.current.handlePlay?.(nextPatch.autoPlay === true)
        }
      }))
    })()
    return () => handles.forEach(handle => handle && handle.remove && handle.remove())
  }, [])

  useEffect(() => {
    if (!native.isNative() || (!liveOverlay && !autoLive)) return undefined
    let cancelled = false
    const check = async () => {
      const [session, watch] = await Promise.all([
        native.getSessionStatus().catch(() => ({ sessionActive: false })),
        native.vmSessionWatch().catch(() => ({ verdict: 'WATCH_UNAVAILABLE' }))
      ])
      if (cancelled) return
      setGuardInfo(watch)
      if (shouldCloseSession(session, watch)) {
        setSessionStatus({ state: 'stopped', text: 'Session stopped' })
        await handlersRef.current.stopLiveAuto?.()
        await handlersRef.current.stopLiveOverlay?.()
        return
      }
    }
    check()
    const timer = setInterval(check, 1200)
    return () => { cancelled = true; clearInterval(timer) }
  }, [liveOverlay, autoLive])

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
          onClose={() => { native.showNotification({ title: 'SNAKE ENGINE', text: 'Menu hidden · tap the floating rail to open', status: 'running' }).catch(() => {}); window.close?.() }}
          onPlay={handlePlay}
          onStartSession={startSession}
          onRunScript={runRatimoda}
          onStop={handleStop}
          onOpenTable={() => native.openApp().catch(() => {})}
          onRunLineScript={runLineTest}
          onRunQuickTest={runQuickTest}
          liveOverlay={liveOverlay}
          liveOverlayInfo={liveOverlayInfo}
          screenCapture={screenCapture}
          onStartLiveOverlay={startLiveOverlay}
          onStopLiveOverlay={stopLiveOverlay}
          autoLive={autoLive}
          autoLiveInfo={autoLiveInfo}
          inputInfo={inputInfo}
          onStartLiveAuto={startLiveAuto}
          onStopLiveAuto={stopLiveAuto}
          onRequestNotifications={requestNotifications}
          onRequestUsageAccess={requestUsage}
        />
        {toast ? <div className={`ingame-toast ${toastKind}`}><b>SNAKE ENGINE</b>{toast}</div> : null}
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
      menuCloseSignal={menuCloseSignal}
      onOpenSettings={() => setTab('settings')}
      onRunScript={runRatimoda}
      runningScript={runningScript}
      onRunLineScript={runLineTest}
      runningLineScript={runningLineScript}
      liveOverlay={liveOverlay}
      liveOverlayInfo={liveOverlayInfo}
      screenCapture={screenCapture}
      onStartLiveOverlay={startLiveOverlay}
      onStopLiveOverlay={stopLiveOverlay}
      autoLive={autoLive}
      autoLiveInfo={autoLiveInfo}
      inputInfo={inputInfo}
      onStartLiveAuto={startLiveAuto}
      onStopLiveAuto={stopLiveAuto}
      onPlay={handlePlay}
      onStartSession={startSession}
      onStop={handleStop}
      onOpenTable={() => setTab('table')}
      onRequestNotifications={requestNotifications}
      onRequestUsageAccess={requestUsage}
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
      onRunLiveLines={runLiveLines}
      liveOverlay={liveOverlay}
      liveOverlayInfo={liveOverlayInfo}
      screenCapture={screenCapture}
      onStartLiveOverlay={startLiveOverlay}
      onStopLiveOverlay={stopLiveOverlay}
      calibration={calibration}
      updateCalibration={updateCalibration}
      autoLive={autoLive}
      autoLiveInfo={autoLiveInfo}
      onStartLiveAuto={startLiveAuto}
      onStopLiveAuto={stopLiveAuto}
      inputInfo={inputInfo}
      onAttachInput={attachInput}
      inputProcess={inputProcess}
      setInputProcess={setInputProcess}
      inputTaps={inputTaps}
      updateInputTap={updateInputTap}
      guardInfo={guardInfo}
      onSessionGuard={reportSessionGuard}
      scriptLog={scriptLog}
      onClearLog={() => setScriptLog([])}
      onStartSession={startSession}
      onRequestNotifications={requestNotifications}
      onRequestUsageAccess={requestUsage}
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
      onRunLineScript={runLineTest}
      runningLineScript={runningLineScript}
    />
  )

  return (
    <>
      {tab === 'settings' ? settingsScreen : tab === 'table' ? tableScreen : homeScreen}
      {toast ? <div className={`ingame-toast ${toastKind}`}><b>SNAKE ENGINE</b>{toast}</div> : null}
    </>
  )
}

export default function App() {
  return <BundleGate><Main /></BundleGate>
}
