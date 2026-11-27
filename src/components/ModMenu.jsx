import React from 'react'
import {
  AUTOPLAY_MODES,
  GAME_PACKAGES,
  GOLDEN_TARGETS,
  QUEUE_MODES,
  TABLE_PROFILES,
  TARGET_BUILD
} from '../lib/config.js'

function Section({ title, note, children }) {
  return (
    <section className="menu-section">
      <h3>{title}</h3>
      {note ? <p className="section-note">{note}</p> : null}
      <div className="section-rows">{children}</div>
    </section>
  )
}

function Toggle({ checked, onChange, label, hint }) {
  return (
    <button className={`toggle-row ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <span>
        <b>{label}</b>
        <small>{hint || (checked ? 'ON' : 'OFF')}</small>
      </span>
      <span className="switch"><i /></span>
    </button>
  )
}

function Slider({ label, value, min, max, step = 1, unit = '', disabled = false, onChange }) {
  return (
    <label className={`slider-row ${disabled ? 'disabled' : ''}`}>
      <span className="slider-head"><b>{label}</b><em>{value}{unit}</em></span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={e => onChange(Number(e.target.value))} />
    </label>
  )
}

function Chips({ options, value, onChange, small = false }) {
  return (
    <div className={`chips ${small ? 'small' : ''}`}>
      {options.map(option => (
        <button key={option} className={value === option ? 'chip active' : 'chip'} onClick={() => onChange(option)}>{option}</button>
      ))}
    </div>
  )
}

function Readout({ label, value, accent = false }) {
  return (
    <div className="readout-line"><span>{label}</span><b className={accent ? 'accent' : ''}>{value ?? '—'}</b></div>
  )
}

function Counters({ queue = {} }) {
  return (
    <div className="counters">
      <div><small>QUEUED</small><b>{queue.queued || 0}</b></div>
      <div><small>MATCHED</small><b>{queue.matched || 0}</b></div>
      <div><small>COMPLETED</small><b>{queue.completed || 0}</b></div>
      <div><small>FAILED</small><b>{queue.failed || 0}</b></div>
    </div>
  )
}

export default function ModMenu({
  config,
  setConfig,
  state,
  nativeStatus,
  onClose,
  onPlay,
  onStart,
  onRunScript,
  runningScript,
  onStop,
  onOpenTable,
  onRunLineScript,
  runningLineScript,
  onLaunchGame,
  onRequestOverlay,
  onToggleFloating,
  onRequestAccessibility
}) {
  const c = config
  const set = patch => setConfig(patch)
  const q = state.queue || {}

  return (
    <section className="modmenu" role="dialog" aria-label="HOME MENU">
      <header className="modmenu-head">
        <div>
          <small>PRIVATE CLIENT</small>
          <strong>HOME MENU</strong>
          <em>8 BALL POOL · {TARGET_BUILD} · SIM</em>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
      </header>

      <div className="action-grid">
        <button className={c.autoPlay ? 'action-btn active' : 'action-btn'} onClick={onPlay}><b>PLAY</b><small>{c.autoPlay ? 'STOP' : 'TOGGLE'}</small></button>
        <button className="action-btn" onClick={onStart}><b>START</b><small>LAUNCH 8BP</small></button>
        <button className="action-btn green" disabled={runningScript} onClick={onRunScript}><b>AUTOPLAY</b><small>RATIMODA</small></button>
        <button className="action-btn danger" onClick={onStop}><b>STOP</b><small>SAFE HALT</small></button>
      </div>

      <div className="modmenu-body">
        <Section title="BASIC SETTINGS">
          <Toggle checked={c.showLines !== false} onChange={v => set({ showLines: v })} label="Show lines" />
          <Toggle checked={c.keepLines !== false} onChange={v => set({ keepLines: v })} label="Keep lines after shot" />
          <Toggle checked={c.powerLock === true} onChange={v => set({ powerLock: v })} label="Power lock" />
        </Section>

        <Section title="OTHER SETTINGS">
          <Slider label="Default power" value={c.power} min={0} max={100} unit="%" disabled={c.powerLock} onChange={v => set({ power: v })} />
          <Toggle checked={c.showPockets !== false} onChange={v => set({ showPockets: v })} label="Show pockets" />
          <Toggle checked={c.purchaseGuard !== false} onChange={v => set({ purchaseGuard: v })} label="Purchase guard" hint="Press BACK on coin/store screens" />
        </Section>

        <Section title="AUTO PLAY SETTINGS">
          <Toggle checked={c.autoPlay === true} onChange={v => set({ autoPlay: v })} label="Enable auto play" />
          <div className="field"><label>Auto play mode</label><Chips options={AUTOPLAY_MODES} value={c.autoPlayMode} onChange={v => set({ autoPlayMode: v })} /></div>
          <div className="field"><label>Break settings</label><Toggle checked={c.failedBreak === true} onChange={v => set({ failedBreak: v })} label="Failed break" /></div>
          <button className="btn primary wide" disabled={runningScript} onClick={onRunScript}>{runningScript ? 'Running Ratimoda…' : 'Run Ratimoda Autoplay Test'}</button>
        </Section>

        <Section title="8 BALL PLAY SETTINGS">
          <Toggle checked={c.prioritize9 === true} onChange={v => set({ prioritize9: v })} label="Prioritize 9th ball" />
          <Toggle checked={c.paralysisOpponent === true} onChange={v => set({ paralysisOpponent: v })} label="Paralysis opponent turn" />
          <Toggle checked={c.cleanUpShot === true} onChange={v => set({ cleanUpShot: v })} label="Clean up shot" />
        </Section>

        <Section title="GOLDEN SHOT SETTINGS" note="You can pick where the golden shot will land in auto play, from center [1] to last ring [4], pick your target .">
          <div className="field"><label>Golden shot target</label><Chips options={GOLDEN_TARGETS} value={c.goldenTarget} onChange={v => set({ goldenTarget: v })} small /></div>
        </Section>

        <Section title="D0J AUTO QUEUE">
          <Toggle checked={c.autoQueue === true} onChange={v => set({ autoQueue: v })} label="Auto queue" />
          <div className="field"><label>Queue count</label><Chips options={QUEUE_MODES} value={c.queueMode} onChange={v => set({ queueMode: v })} small /></div>
          <Slider label="Match limit" value={c.matchLimit} min={1} max={20} onChange={v => set({ matchLimit: v })} />
          <Slider label="Delay" value={c.queueDelay} min={0.5} max={10} step={0.5} unit="s" onChange={v => set({ queueDelay: v })} />
          <Slider label="Jitter" value={c.jitter} min={0} max={2} step={0.1} unit="s" onChange={v => set({ jitter: v })} />
          <Slider label="Retries" value={c.retries} min={0} max={5} onChange={v => set({ retries: v })} />
          <Toggle checked={c.stopOnManual !== false} onChange={v => set({ stopOnManual: v })} label="Stop on manual input" />
          <Counters queue={q} />
        </Section>

        <Section title="TABLE / STATE">
          <div className="field"><label>Table profile</label><Chips options={TABLE_PROFILES} value={c.tableProfile} onChange={v => set({ tableProfile: v })} small /></div>
          <Readout label="Queue state" value={state.phase || 'IDLE'} accent />
          <Readout label="phase" value={state.phase} />
          <Readout label="turn" value={state.turn} />
          <Readout label="result" value={state.result} />
          <Readout label="power" value={`${state.power ?? c.power}%`} />
          <Readout label="aimError" value={Number(state.aimError || 0).toFixed(2)} />
          <p className="note">IDLE → FIND_MATCH → MATCHED → PLAYING → RESULT → COOLDOWN → FIND_MATCH</p>
        </Section>

        <Section title="LINE PREDICTION">
          <Toggle checked={c.showLines !== false} onChange={v => set({ showLines: v })} label="Show lines" />
          <Toggle checked={c.keepLines !== false} onChange={v => set({ keepLines: v })} label="Keep lines after shot" />
          <Toggle checked={c.powerLock === true} onChange={v => set({ powerLock: v })} label="Power lock" />
          <Slider label="Spin" value={c.lineSpin ?? 0} min={-1} max={1} step={0.05} onChange={v => set({ lineSpin: v, sideSpin: v })} />
          <Slider label="Line opacity" value={c.lineOpacity ?? 85} min={10} max={100} unit="%" onChange={v => set({ lineOpacity: v })} />
          <button className="btn primary wide" onClick={onOpenTable}>Open Line Prediction Test</button>
          <button className="btn ghost wide" disabled={runningLineScript} onClick={onRunLineScript}>{runningLineScript ? 'Running test…' : 'Run 3-Shot Line Script'}</button>
        </Section>

        <Section title="DISPLAY OVER GAME">
          <Readout label="Permission" value={nativeStatus?.overlay ? 'GRANTED' : 'NOT GRANTED'} accent={nativeStatus?.overlay} />
          <Readout label="Floating D0J" value={nativeStatus?.floating ? 'ON' : 'OFF'} />
          <Readout label="Target package" value={GAME_PACKAGES.eightBallPool} />
          <button className="btn ghost wide" onClick={onRequestOverlay}>Open Display Permission</button>
          <button className="btn primary wide" disabled={!nativeStatus?.overlay} onClick={onToggleFloating}>{nativeStatus?.floating ? 'Stop Floating Button' : 'Start Floating Button'}</button>
          <button className="btn ghost wide" onClick={onRequestAccessibility}>Open Accessibility Settings</button>
          <p className="note">Floating button is draggable. Tap it to open this menu over 8BP. Purchase guard requires accessibility permission and only presses system BACK.</p>
        </Section>

        <p className="menu-footer">D0J EnGine · local runtime · no server · simulated bridge</p>
      </div>
    </section>
  )
}
