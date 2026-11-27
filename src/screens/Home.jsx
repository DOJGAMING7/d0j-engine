import React, { useState } from 'react'
import Logo from '../components/Logo.jsx'
import ModMenu from '../components/ModMenu.jsx'

export default function Home({ config, setConfig, state, bundleStatus, onOpenSettings, onRunScript, runningScript, onPlay, onOpenTable, onRunLineScript }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const status = config.autoPlay ? 'AUTO PLAY' : 'READY'

  return (
    <main className="app-shell">
      <header className="topbar">
        <Logo compact />
        <div className="top-actions">
          <button className="icon-btn" onClick={onOpenSettings} aria-label="Settings">⚙</button>
        </div>
      </header>

      <section className="hero">
        <div className="status-card">
          <div className="card-label">D0J ENGINE STATUS</div>
          <div className="status-value">{status}</div>
          <div className="status-sub">Target: 8 Ball Pool 56.34.0 · Simulated bridge</div>
          <div className="status-grid">
            <div><small>MODE</small><b>{config.mode}</b></div>
            <div><small>QUEUE</small><b>{config.autoQueue ? config.queueMode : 'OFF'}</b></div>
            <div><small>POWER</small><b>{config.power}%</b></div>
            <div><small>BUNDLE</small><b>{bundleStatus?.version || 'BUILT-IN'}</b></div>
          </div>
        </div>

        <button className={config.autoPlay ? 'play-btn active' : 'play-btn'} onClick={onPlay}>
          <span>{config.autoPlay ? 'STOP AUTO' : 'PLAY'}</span>
          <small>{config.autoPlay ? 'autopilot active' : 'start autopilot'}</small>
        </button>

        <button className="menu-btn" onClick={() => setMenuOpen(true)}>OPEN MOD MENU</button>
        <button className="menu-btn green" onClick={onOpenTable}>LINE PREDICTION TEST</button>
      </section>

      <footer className="footer-readout">
        <span><i className="dot" /> {state.turn === 'you' ? 'YOUR TURN' : 'OPPONENT'}</span>
        <span>AUTO PLAY {config.autoPlay ? 'ON' : 'OFF'}</span>
        <span>QUEUE {config.autoQueue ? config.queueMode : 'OFF'}</span>
        <span>SIMULATED</span>
      </footer>

      {menuOpen && (
        <ModMenu
          config={config}
          setConfig={setConfig}
          state={state}
          onRunScript={onRunScript}
          runningScript={runningScript}
          onOpenTable={onOpenTable}
          onRunLineScript={onRunLineScript}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </main>
  )
}
