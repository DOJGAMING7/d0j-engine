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

function Main() {
  const [unlocked, setUnlocked] = useState(() => isUnlocked())
  const [tab, setTab] = useState('home')
  const [config, setConfigState] = useState(() => ({ ...DEFAULT_CONFIG, ...(getPref('config', {}) || {}) }))
  const [liveState, setLiveState] = useState({ phase: 'YOUR_TURN', turn: 'you', result: null, power: 74, queue: {} })
  const [settings, setSettings] = useState(loadSettings())
  const [bundleStatus, setBundleStatus] = useState(null)
  const [scriptLog, setScriptLog] = useState([])
  const [runningScript, setRunningScript] = useState(false)
  const [runningLineScript, setRunningLineScript] = useState(false)
  const [nativeStatus, setNativeStatus] = useState({ overlay: false, floating: false, accessibility: false, native: native.isNative() })
  const [menuSignal, setMenuSignal] = useState(0)
  const [toast, setToast] = useState('')
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

  const say = message => {
    setToast(String(message))
    log(String(message))
  }

  const handleStop = () => {
    setConfigState(prev => ({ ...prev, autoPlay: false, autoQueue: false }))
    bridge.stopSimulation()
    say('D0J: safe stop · autoplay and queue OFF')
  }

  const handlePlay = async () => {
    const next = { ...config, autoPlay: !config.autoPlay }
    if (next.autoPlayMode) next.mode = normalizeMode(next.autoPlayMode)
    setConfigState(next)
    await bridge.setConfig(next)
    if (next.autoPlay) bridge.startSimulation()
    else bridge.stopSimulation()
    say(`D0J: auto play ${next.autoPlay ? 'ON' : 'OFF'}`)
  }

  const runRatimoda = async () => {
    if (runningScript) return
    setRunningScript(true)
    try {
      bridge.reset()
      await bridge.setConfig(config)
      bridge.startSimulation()
      const source = await loadScriptSource('autoplay-ratimoda.js')
      const report = await runScriptSource(source, bridge.api, bridge.log)
      const finalConfig = await bridge.getConfig()
      setConfigState(prev => ({ ...prev, ...finalConfig }))
      say(`RATIMODA: ${report?.ok ? 'complete' : 'stopped'} · ${report?.shots || 0} shots`)
    } catch (e) {
      log(`RATIMODA ERROR: ${e?.message || e}`)
      say(`RATIMODA: error · ${e?.message || e}`)
    } finally {
      bridge.stopSimulation()
      setRunningScript(false)
    }
  }

  const runLineTest = async () => {
    if (runningLineScript) return
    setRunningLineScript(true)
    try {
      bridge.reset()
      await bridge.setConfig(config)
      const source = await loadScriptSource('prediction-lines.js')
      const report = await runScriptSource(source, bridge.api, bridge.log)
      const finalConfig = await bridge.getConfig()
      setConfigState(prev => ({ ...prev, ...finalConfig }))
      say(`LINES: ${report?.ok ? '3/3 predictions' : 'failed'} · simulated`)
    } catch (e) {
      log(`LINE TEST ERROR: ${e?.message || e}`)
      say(`LINES: error · ${e?.message || e}`)
    } finally {
      setRunningLineScript(false)
    }
  }

  const launchGame = async packageName => {
    const pkg = String(packageName || GAME_PACKAGES.eightBallPool)
    const game = SUPPORTED_GAMES.find(g => g.packageName === pkg)
    const res = await native.launchGame(pkg)
    if (res?.ok === true) say(`D0J: opening ${game?.name || pkg}`)
    else if (String(res?.error || '').includes('NOT_INSTALLED')) say(`D0J: ${game?.name || pkg} is not installed`)
    else say(`D0J: launch failed · ${res?.error || 'unknown'}`)
    return res
  }

  const requestOverlay = async () => {
    const current = await native.hasOverlayPermission()
    if (current.granted) return say('D0J: Display over other apps already granted')
    await native.requestOverlayPermission()
    say('D0J: enable Display over other apps, then return')
  }

  const toggleFloating = async () => {
    const permission = await native.hasOverlayPermission()
    if (!permission.granted) {
      await native.requestOverlayPermission()
      return say('D0J: enable Display over other apps first')
    }
    const current = await native.isFloatingActive()
    const res = current.active ? await native.stopFloating() : await native.startFloating()
    if (res?.ok === false) say(`D0J: floating button failed · ${res.error}`)
    else say(`D0J: floating button ${current.active ? 'OFF' : 'ON'}`)
    const fresh = await native.isFloatingActive()
    setNativeStatus(prev => ({ ...prev, floating: fresh.active === true }))
  }

  const requestAccessibility = async () => {
    await native.requestAccessibility()
    say('D0J: enable D0J Purchase Guard in accessibility settings')
  }

  const lockApp = async () => {
    setPref('apkUnlocked', false)
    await native.setUnlocked(false)
    await native.stopFloating()
    setUnlocked(false)
    setToast('D0J: app locked')
  }

  const refreshNativeStatus = async () => {
    const [overlay, floating, accessibility] = await Promise.all([
      native.hasOverlayPermission(),
      native.isFloatingActive(),
      native.isAccessibilityEnabled()
    ])
    if (!overlay.granted && floating.active) await native.stopFloating()
    setNativeStatus({
      overlay: overlay.granted === true,
      floating: floating.active === true,
      accessibility: accessibility.enabled === true,
      native: native.isNative()
    })
  }

  const handleCommand = command => {
    const handlers = handlersRef.current
    if (command === 'play') handlers.handlePlay?.()
    else if (command === 'start' || command === 'launch8bp') handlers.launchGame?.(GAME_PACKAGES.eightBallPool)
    else if (command === 'autoplay') handlers.runRatimoda?.()
    else if (command === 'stop') handlers.handleStop?.()
    else if (command === 'openTable') { setTab('table'); native.openApp() }
    else if (command === 'openFullMenu') { setTab('home'); setMenuSignal(n => n + 1); native.openApp() }
  }

  handlersRef.current = { handlePlay, launchGame, runRatimoda, handleStop }

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
    native.syncConfig(config)
    native.setGuards({ purchaseGuard: config.purchaseGuard !== false })
  }, [bridge, config])

  useEffect(() => {
    refreshNativeStatus()
    window.__d0jOpenModMenu = () => { setTab('home'); setMenuSignal(n => n + 1) }
    const onFocus = () => refreshNativeStatus()
    const onVisibility = () => {
      if (document.hidden) {
        bridge.stopSimulation()
        log('D0J: app focus lost · simulated autopilot paused')
      } else {
        refreshNativeStatus()
      }
    }
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
      handles.push(await native.addListener('floatingTap', () => {
        setTab('home')
        setMenuSignal(n => n + 1)
      }))
      handles.push(await native.addListener('purchaseBlocked', data => {
        say(`D0J: purchase screen blocked${data?.text ? ` · ${data.text.slice(0, 42)}` : ''}`)
      }))
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

  const homeScreen = (
    <Home
      config={config}
      setConfig={setConfig}
      state={liveState}
      bundleStatus={bundleStatus}
      nativeStatus={nativeStatus}
      menuSignal={menuSignal}
      onOpenSettings={() => setTab('settings')}
      onRunScript={runRatimoda}
      runningScript={runningScript}
      onRunLineScript={runLineTest}
      runningLineScript={runningLineScript}
      onPlay={handlePlay}
      onStart={() => launchGame(GAME_PACKAGES.eightBallPool)}
      onStop={handleStop}
      onOpenTable={() => setTab('table')}
      onLaunchGame={launchGame}
      onRequestOverlay={requestOverlay}
      onToggleFloating={toggleFloating}
      onRequestAccessibility={requestAccessibility}
    />
  )

  const settingsScreen = (
    <Settings
      settings={settings}
      saveSettings={saveSettings}
      bundleStatus={bundleStatus}
      nativeStatus={nativeStatus}
      onBack={() => setTab('home')}
      onRunScript={runRatimoda}
      runningScript={runningScript}
      onRunLineScript={runLineTest}
      runningLineScript={runningLineScript}
      scriptLog={scriptLog}
      onClearLog={() => setScriptLog([])}
      onLaunchGame={launchGame}
      onRequestOverlay={requestOverlay}
      onToggleFloating={toggleFloating}
      onRequestAccessibility={requestAccessibility}
      onLockApp={lockApp}
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
      {toast ? <div className="native-toast">{toast}</div> : null}
    </>
  )
}

export default function App() {
  return <BundleGate><Main /></BundleGate>
}
