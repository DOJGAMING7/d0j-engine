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
      <span className="game-open">OPEN →</span>
    </button>
  )
}

export default function Home({
  config,
  setConfig,
  state,
  bundleStatus,
  nativeStatus,
  menuSignal,
  onOpenSettings,
  onRunScript,
  runningScript,
  onRunLineScript,
  runningLineScript,
  onPlay,
  onStart,
  onStop,
  onOpenTable,
  onLaunchGame,
  onRequestOverlay,
  onToggleFloating,
  onRequestAccessibility
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const status = config.autoPlay ? 'AUTO PLAY' : 'READY'

  useEffect(() => {
    if (menuSignal > 0) setMenuOpen(true)
  }, [menuSignal])

  return (
    <main className="app-shell">
      <header className="topbar">
        <Logo compact />
        <div className="top-actions">
          <button className="icon-btn" onClick={onOpenSettings} aria-label="Settings">⚙</button>
        </div>
      </header>

      <section className="home-head">
        <small className="card-label">PRIVATE SINGLE-USER CLIENT</small>
        <h1>HOME MENU</h1>
        <p>Local runtime · no server · target {TARGET_BUILD}</p>
      </section>

      <section className="game-panel">
        <h2>SUPPORTED GAMES</h2>
        {SUPPORTED_GAMES.map(game => <GameCard key={game.id} game={game} onLaunch={onLaunchGame} />)}
        <div className="game-tip">Best For Carrom Pool</div>
      </section>

      <section className="status-card compact-status">
        <div className="status-grid four">
          <div><small>STATUS</small><b>{status}</b></div>
          <div><small>MODE</small><b>{config.autoPlayMode}</b></div>
          <div><small>QUEUE</small><b>{config.autoQueue ? config.queueMode : 'OFF'}</b></div>
          <div><small>BUNDLE</small><b>{bundleStatus?.version || 'BUILT-IN'}</b></div>
        </div>
      </section>

      <section className="action-grid home-actions">
        <button className={config.autoPlay ? 'action-btn active' : 'action-btn'} onClick={onPlay}><b>PLAY</b><small>{config.autoPlay ? 'STOP AUTO' : 'AUTO PLAY'}</small></button>
        <button className="action-btn" onClick={onStart}><b>START</b><small>OPEN 8BP</small></button>
        <button className="action-btn green" disabled={runningScript} onClick={onRunScript}><b>AUTOPLAY</b><small>RATIMODA</small></button>
        <button className="action-btn danger" onClick={onStop}><b>STOP</b><small>SAFE HALT</small></button>
      </section>

      <section className="home-buttons">
        <button className="menu-btn" onClick={() => setMenuOpen(true)}>OPEN MOD MENU</button>
        <button className="menu-btn green" onClick={onOpenTable}>LINE PREDICTION TEST</button>
        <button className="menu-btn" onClick={onRequestOverlay}>DISPLAY OVER GAME</button>
        <button className="menu-btn green" disabled={!nativeStatus?.overlay} onClick={onToggleFloating}>{nativeStatus?.floating ? 'STOP FLOATING D0J' : 'START FLOATING D0J'}</button>
      </section>

      <footer className="footer-readout">
        <span><i className="dot" /> {state.phase || 'YOUR_TURN'}</span>
        <span>AUTO {config.autoPlay ? 'ON' : 'OFF'}</span>
        <span>QUEUE {config.autoQueue ? config.queueMode : 'OFF'}</span>
        <span>PKG {GAME_PACKAGES.eightBallPool.split('.').pop()}</span>
      </footer>

      {menuOpen && (
        <ModMenu
          config={config}
          setConfig={setConfig}
          state={state}
          nativeStatus={nativeStatus}
          runningScript={runningScript}
          runningLineScript={runningLineScript}
          onClose={() => setMenuOpen(false)}
          onPlay={onPlay}
          onStart={onStart}
          onRunScript={onRunScript}
          onStop={onStop}
          onOpenTable={() => { setMenuOpen(false); onOpenTable() }}
          onRunLineScript={onRunLineScript}
          onLaunchGame={onLaunchGame}
          onRequestOverlay={onRequestOverlay}
          onToggleFloating={onToggleFloating}
          onRequestAccessibility={onRequestAccessibility}
        />
      )}
    </main>
  )
}
