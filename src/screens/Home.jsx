import React, { useEffect, useState } from 'react'
import Logo from '../components/Logo.jsx'
import ModMenu from '../components/ModMenu.jsx'
import { GAME_PACKAGES, SUPPORTED_GAMES, TARGET_BUILD } from '../lib/config.js'

function GameCard({ game, onLaunch }) {
  return (
    <button className="game-card" onClick={() => onLaunch(game.packageName)}>
      <span className="game-icon">{game.name.charAt(0)}</span>
      <span className="game-copy">
        <b>{game.name}</b>
        <small>{game.note}</small>
      </span>
      <span className="game-badge">{game.badge}</span>
      <span className="game-open">OPEN</span>
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
  onPlay,
  onStartSession,
  onStop,
  onOpenTable,
  onRequestOverlay,
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
    <main className="app-shell bw-home">
      <header className="topbar">
        <Logo compact />
        <div className="top-actions">
          <button className="icon-btn" onClick={onOpenSettings} aria-label="Settings">⚙</button>
        </div>
      </header>

      <section className="home-head clean">
        <small className="card-label">PRIVATE SINGLE-USER CLIENT</small>
        <h1>HOME MENU</h1>
        <p>Clean client · session overlay · target {TARGET_BUILD}</p>
      </section>

      <section className="status-card compact-status">
        <div className="status-grid four">
          <div><small>STATUS</small><b>{status}</b></div>
          <div><small>SESSION</small><b>{nativeStatus?.sessionActive ? 'ACTIVE' : 'IDLE'}</b></div>
          <div><small>OVERLAY</small><b>{nativeStatus?.overlay ? 'READY' : 'NEEDS PERM'}</b></div>
          <div><small>BUNDLE</small><b>{bundleStatus?.version || 'BUILT-IN'}</b></div>
        </div>
      </section>

      <section className="game-panel">
        <h2>SUPPORTED GAMES</h2>
        {SUPPORTED_GAMES.map(game => <GameCard key={game.id} game={game} onLaunch={onStartSession} />)}
      </section>

      <section className="action-grid home-actions clean-actions">
        <button className="action-btn" onClick={() => onStartSession(GAME_PACKAGES.eightBallPool)}><b>START</b><small>SESSION + 8BP</small></button>
        <button className="action-btn" onClick={onRunQuickTest}><b>TEST</b><small>NO BLOCK</small></button>
        <button className="action-btn" onClick={() => setMenuOpen(true)}><b>MENU</b><small>MOD MENU</small></button>
        <button className="action-btn danger" onClick={onStop}><b>STOP</b><small>SESSION</small></button>
      </section>

      <section className="home-buttons">
        <button className="menu-btn" onClick={onRequestOverlay}>OVERLAY PERMISSION</button>
        <button className="menu-btn" onClick={onOpenTable}>LINE PREDICTION TEST</button>
      </section>

      <footer className="footer-readout">
        <span><i className={`dot ${nativeStatus?.sessionActive ? 'on' : ''}`} /> {status}</span>
        <span>AUTO {config.autoPlay ? 'ON' : 'OFF'}</span>
        <span>TEST {testReport?.ok ? 'PASS' : testReport?.items?.length ? 'FAIL' : 'IDLE'}</span>
      </footer>

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
        />
      )}
    </main>
  )
}
