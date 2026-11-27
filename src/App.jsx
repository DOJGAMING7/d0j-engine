import React, { useEffect, useRef, useState } from 'react'
import BundleGate from './components/BundleGate.jsx'
import Home from './screens/Home.jsx'
import Settings from './screens/Settings.jsx'
import { createBridge } from './lib/bridge.js'
import { loadScriptSource, runScriptSource } from './lib/scriptRunner.js'
import { getPref, setPref, loadSettings, saveSettings as persistSettings } from './lib/storage.js'
import { getBundleMeta } from './lib/updater.js'

const DEFAULT_CONFIG = {
  autoPlay: false,
  mode: 'Slow',
  autoQueue: false,
  queueMode: 'ONE',
  matchLimit: 3,
  queueDelay: 2,
  jitter: 0.4,
  retries: 2,
  stopOnManual: true,
  aimGuide: false,
  targetPreview: false,
  guideOpacity: 70,
  power: 74,
  sideSpin: 0,
  topSpin: 0
}

function Main() {
  const [tab, setTab] = useState('home')
  const [config, setConfigState] = useState(DEFAULT_CONFIG)
  const [liveState, setLiveState] = useState({ turn: 'you', result: null, power: 74, queue: {} })
  const [settings, setSettings] = useState(loadSettings())
  const [bundleStatus, setBundleStatus] = useState(null)
  const [scriptLog, setScriptLog] = useState([])
  const [runningScript, setRunningScript] = useState(false)
  const bridgeRef = useRef(null)

  if (!bridgeRef.current) {
    bridgeRef.current = createBridge({
      onLog: msg => setScriptLog(prev => [...prev, { at: Date.now(), msg }].slice(-120))
    })
  }
  const bridge = bridgeRef.current

  useEffect(() => {
    const stored = getPref('config', {})
    if (stored && typeof stored === 'object') setConfigState(prev => ({ ...prev, ...stored }))
    getBundleMeta().then(setBundleStatus).catch(() => {})
    return bridge.subscribe(s => setLiveState(s))
  }, [bridge])

  useEffect(() => { setPref('config', config) }, [config])

  const setConfig = patch => setConfigState(prev => ({ ...prev, ...(patch || {}) }))

  const saveSettings = patch => {
    const next = { ...settings, ...(patch || {}) }
    setSettings(next)
    persistSettings(next)
  }

  const handlePlay = async () => {
    const next = { ...config, autoPlay: !config.autoPlay }
    setConfig({ autoPlay: next.autoPlay })
    await bridge.setConfig(next)
    if (next.autoPlay) bridge.startSimulation()
    else bridge.stopSimulation()
  }

  const runRatimoda = async () => {
    setRunningScript(true)
    try {
      bridge.reset()
      await bridge.setConfig(config)
      bridge.startSimulation()
      const source = await loadScriptSource('autoplay-ratimoda.js')
      await runScriptSource(source, bridge.api, bridge.log)
      const finalConfig = await bridge.getConfig()
      setConfigState(prev => ({ ...prev, ...finalConfig }))
    } catch (e) {
      bridge.log(`ERROR: ${e?.message || e}`)
    } finally {
      bridge.stopSimulation()
      setRunningScript(false)
    }
  }

  if (tab === 'settings') {
    return (
      <Settings
        settings={settings}
        saveSettings={saveSettings}
        bundleStatus={bundleStatus}
        onBack={() => setTab('home')}
        onRunScript={runRatimoda}
        runningScript={runningScript}
        scriptLog={scriptLog}
        onClearLog={() => setScriptLog([])}
      />
    )
  }

  return (
    <Home
      config={config}
      setConfig={setConfig}
      state={liveState}
      bundleStatus={bundleStatus}
      onOpenSettings={() => setTab('settings')}
      onRunScript={runRatimoda}
      runningScript={runningScript}
      onPlay={handlePlay}
    />
  )
}

export default function App() {
  return <BundleGate><Main /></BundleGate>
}
