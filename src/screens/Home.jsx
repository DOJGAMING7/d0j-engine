import React, { useEffect, useState } from 'react'
import ModMenu from '../components/ModMenu.jsx'
import { SnakeMark } from '../components/SnakeLogo.jsx'
import Icon from '../components/Icons.jsx'
import snakeLogo from '../assets/snake-lockup.png'
import { GAME_PACKAGES, SUPPORTED_GAMES, TARGET_BUILD } from '../lib/config.js'

function GameCard({ game, onLaunch }) {
  const target = game.id === 'eightBallPool'
  return (
    <button className={`sg-card ${target ? 'target' : 'locked'}`} onClick={() => onLaunch(game.packageName)}>
      <span className={`sg-art sg-art-${game.id}`}>
        <span className="sg-art-mark">{target ? '8' : game.name.charAt(0)}</span>
        {target ? <span className="sg-version">{TARGET_BUILD}</span> : (
          <span className="sg-warning"><Icon name="warning" size={20} /></span>
        )}
      </span>
      <span className="sg-copy">
        <b>{game.name}</b>
        <small>{target ? 'Main client · ready' : 'Launcher only'}</small>
      </span>
    </button>
  )
}

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
  onRequestOverlay,
  onRequestNotifications,
  onRequestUsageAccess,
  onRunQuickTest
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const status = sessionStatus?.text || (config.autoPlay ? 'AUTO PLAY' : 'READY')

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
          <span className="sg-hero-kicker">BEST FOR 8 BALL POOL</span>
          <img className="sg-hero-logo" src={snakeLogo} alt="SNAKE ENGINE" />
          <p>Rootless session client · target {TARGET_BUILD}</p>
          <button className="sg-hero-btn" onClick={() => onStartSession(GAME_PACKAGES.eightBallPool)}>
            <Icon name="play" size={16} /> START SESSION
          </button>
        </div>
        <div className="sg-hero-balls" aria-hidden="true">
          <span className="sg-ball sg-ball-8">8</span>
          <span className="sg-ball sg-ball-9" />
          <span className="sg-ball sg-ball-3" />
        </div>
      </section>

      <div className="sg-section-head">
        <span className="sg-section-plus"><Icon name="plus" size={16} /></span>
        <b>Supported Games</b>
        <i>{SUPPORTED_GAMES.length}</i>
      </div>

      <section className="sg-games">
        {SUPPORTED_GAMES.map(game => (
          <GameCard key={game.id} game={game} onLaunch={onStartSession} />
        ))}
      </section>

      <section className="sg-actions">
        <button className="sg-action primary" onClick={() => onStartSession(GAME_PACKAGES.eightBallPool)}>
          <b>START</b><small>SESSION + 8BP</small>
        </button>
        <button className="sg-action" onClick={onRunQuickTest}>
          <b>TEST</b><small>NO BLOCK</small>
        </button>
        <button className="sg-action" onClick={() => setMenuOpen(true)}>
          <b>MENU</b><small>MOD MENU</small>
        </button>
        <button className="sg-action danger" onClick={onStop}>
          <b>STOP</b><small>SESSION</small>
        </button>
      </section>

      <div className="sg-status-line">
        <span><i className={`sg-dot ${nativeStatus?.sessionActive ? 'on' : ''}`} /> {status}</span>
        <span>AUTO {config.autoPlay ? 'ON' : 'OFF'}</span>
        <span>TEST {testReport?.ok ? 'PASS' : testReport?.items?.length ? 'FAIL' : 'IDLE'}</span>
      </div>

      <nav className="sg-nav">
        <button className="active" onClick={() => setMenuOpen(false)}>
          <Icon name="grid" size={22} /><span>Games</span>
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
