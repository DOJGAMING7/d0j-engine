import React, { useEffect, useState } from 'react'
import ModMenu from '../components/ModMenu.jsx'
import SnakeLogo, { SnakeMark } from '../components/SnakeLogo.jsx'
import Icon from '../components/Icons.jsx'
import { GAME_PACKAGES, TARGET_BUILD } from '../lib/config.js'

export default function Home({
  config,
  setConfig,
  state,
  bundleStatus,
  nativeStatus,
  sessionStatus,
  testReport,
  menuSignal,
  menuCloseSignal,
  onOpenSettings,
  onRunScript,
  runningScript,
  onRunLineScript,
  runningLineScript,
  liveOverlay,
  liveOverlayInfo,
  screenCapture,
  onStartLiveOverlay,
  onStopLiveOverlay,
  autoLive,
  autoLiveInfo,
  inputInfo,
  onStartLiveAuto,
  onStopLiveAuto,
  onPlay,
  onStartSession,
  onStop,
  onOpenTable,
  onRequestNotifications,
  onRequestUsageAccess,
  onRunQuickTest
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const status = sessionStatus?.text || (config.autoPlay ? 'AUTO PLAY' : 'READY')
  const sessionOn = nativeStatus?.sessionActive === true

  useEffect(() => {
    if (menuSignal > 0) setMenuOpen(true)
  }, [menuSignal])

  useEffect(() => {
    if (menuCloseSignal > 0) setMenuOpen(false)
  }, [menuCloseSignal])

  return (
    <main className="app-shell snake-home">
      <header className="sg-top">
        <div className="sg-profile">
          <span className="sg-avatar"><SnakeMark size={38} /></span>
          <span className="sg-profile-copy">
            <b>LOCAL</b>
            <small>SINGLE USER · {TARGET_BUILD}</small>
          </span>
        </div>
        <div className="sg-top-actions">
          <button className="sg-icon-btn" onClick={onRequestNotifications} aria-label="Notification permission">
            <Icon name="bell" size={19} />
          </button>
          <button className="sg-icon-btn" onClick={onOpenSettings} aria-label="Settings">
            <Icon name="gear" size={20} />
          </button>
        </div>
      </header>

      <section className="sg-hero">
        <div className="sg-hero-copy">
          <span className="sg-hero-kicker">LOCAL SESSION CLIENT</span>
          <SnakeLogo className="sg-hero-logo" />
          <p>Opens the installed 8 Ball Pool · mod menu stays in this client · no key · no server</p>
          <button className="sg-hero-btn" onClick={() => onStartSession(GAME_PACKAGES.eightBallPool)}>
            <Icon name="play" size={16} /> START SESSION
          </button>
          <span className="sg-hero-note">LOCAL PREVIEW · SIMULATED</span>
        </div>
        <div className="sg-hero-balls" aria-hidden="true">
          <span className="sg-ball sg-ball-8">8</span>
          <span className="sg-ball sg-ball-9" />
          <span className="sg-ball sg-ball-3" />
        </div>
      </section>

      <section className="sg-quick">
        <button className="sg-quick-card" onClick={() => onStartSession(GAME_PACKAGES.eightBallPool)}>
          <b>8 BALL POOL</b>
          <small>{TARGET_BUILD} · installed Play Store build</small>
        </button>
        <button className="sg-quick-card" onClick={onRunQuickTest}>
          <b>QUICK TEST</b>
          <small>{testReport?.ok ? 'PASS' : testReport?.items?.length ? 'CHECK REPORT' : 'NON-BLOCKING'}</small>
        </button>
        <button className="sg-quick-card" onClick={() => setMenuOpen(true)}>
          <b>MOD MENU</b>
          <small>Lines · auto play · auto queue</small>
        </button>
      </section>

      <div className="sg-status-line">
        <span><i className={`sg-dot ${sessionOn ? 'on' : ''}`} /> {status}</span>
        <span>AUTO {config.autoPlay ? 'ON' : 'OFF'}</span>
        <span>TEST {testReport?.ok ? 'PASS' : testReport?.items?.length ? 'FAIL' : 'IDLE'}</span>
      </div>

      <nav className="sg-nav">
        <button className="active" onClick={() => setMenuOpen(false)}>
          <Icon name="grid" size={22} /><span>Home</span>
        </button>
        <button onClick={() => setMenuOpen(true)}>
          <Icon name="menu" size={22} /><span>Menu</span>
        </button>
        <button onClick={onOpenSettings}>
          <Icon name="list" size={22} /><span>Log</span>
        </button>
        <button onClick={onOpenSettings}>
          <Icon name="gear" size={22} /><span>Settings</span>
        </button>
      </nav>

      {menuOpen && (
        <ModMenu
          config={config}
          setConfig={setConfig}
          state={state}
          nativeStatus={nativeStatus}
          sessionStatus={sessionStatus}
          testReport={testReport}
          runningScript={runningScript}
          runningLineScript={runningLineScript}
          onClose={() => setMenuOpen(false)}
          onPlay={onPlay}
          onStartSession={() => onStartSession(GAME_PACKAGES.eightBallPool)}
          onRunScript={onRunScript}
          onStop={onStop}
          onOpenTable={() => { setMenuOpen(false); onOpenTable() }}
          onRunLineScript={onRunLineScript}
          onRunQuickTest={onRunQuickTest}
          liveOverlay={liveOverlay}
          liveOverlayInfo={liveOverlayInfo}
          screenCapture={screenCapture}
          onStartLiveOverlay={onStartLiveOverlay}
          onStopLiveOverlay={onStopLiveOverlay}
          autoLive={autoLive}
          autoLiveInfo={autoLiveInfo}
          inputInfo={inputInfo}
          onStartLiveAuto={onStartLiveAuto}
          onStopLiveAuto={onStopLiveAuto}
          onRequestNotifications={onRequestNotifications}
          onRequestUsageAccess={onRequestUsageAccess}
        />
      )}
    </main>
  )
}
