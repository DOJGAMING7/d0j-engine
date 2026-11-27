import React, { useState } from 'react'

const TABS = ['AUTO PLAY', 'AUTO QUEUE', 'AIM', 'CONTROLS', 'TABLE']

function Toggle({ checked, onChange, label, hint }) {
  return (
    <button className={`toggle-row ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <span><b>{label}</b>{hint ? <small>{hint}</small> : null}</span>
      <span className="switch"><i /></span>
    </button>
  )
}

function Slider({ label, value, min, max, step = 1, unit = '', onChange }) {
  return (
    <label className="slider-row">
      <span className="slider-head"><b>{label}</b><em>{value}{unit}</em></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
    </label>
  )
}

function Chips({ options, value, onChange }) {
  return (
    <div className="chips">
      {options.map(o => <button key={o} className={value === o ? 'chip active' : 'chip'} onClick={() => onChange(o)}>{o}</button>)}
    </div>
  )
}

export default function ModMenu({ config, setConfig, state, onRunScript, runningScript, onClose }) {
  const [tab, setTab] = useState('AUTO PLAY')
  const c = config
  const set = patch => setConfig(patch)
  const q = state.queue || {}

  return (
    <section className="modmenu">
      <header className="modmenu-head">
        <div><small>MOD MENU</small><strong>D0J ENgine</strong></div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
      </header>
      <nav className="tabs">
        {TABS.map(t => <button key={t} className={tab === t ? 'tab active' : 'tab'} onClick={() => setTab(t)}>{t}</button>)}
      </nav>
      <div className="modmenu-body">
        {tab === 'AUTO PLAY' && (
          <div className="card-list">
            <Toggle checked={c.autoPlay} onChange={v => set({ autoPlay: v })} label="Auto Play" hint="Simulated state bridge" />
            <div className="field"><label>Mode</label><Chips options={['Slow', 'Fast', 'Human']} value={c.mode} onChange={v => set({ mode: v })} /></div>
            <div className="field"><label>Timing profile</label><div className="readout-line"><span>Mode {c.mode}</span><span>{c.mode === 'Human' ? 'variance ±180ms' : c.mode === 'Fast' ? 'fixed 120ms' : 'fixed 650ms'}</span></div></div>
            <button className="btn primary wide" disabled={runningScript} onClick={onRunScript}>{runningScript ? 'Running Ratimoda…' : 'Run Ratimoda Autoplay Test'}</button>
            <p className="note">Test runs on a simulated bridge. No game memory is touched until 56.34.0 validation.</p>
          </div>
        )}

        {tab === 'AUTO QUEUE' && (
          <div className="card-list">
            <Toggle checked={c.autoQueue} onChange={v => set({ autoQueue: v })} label="Auto Queue" hint="Requeue after result screen" />
            <div className="field"><label>Queue mode</label><Chips options={['ONE', 'SESSION', 'INFINITE']} value={c.queueMode} onChange={v => set({ queueMode: v })} /></div>
            <Slider label="Match limit" value={c.matchLimit} min={1} max={20} onChange={v => set({ matchLimit: v })} />
            <Slider label="Start delay" value={c.queueDelay} min={0.5} max={10} step={0.5} unit="s" onChange={v => set({ queueDelay: v })} />
            <Slider label="Jitter" value={c.jitter} min={0} max={2} step={0.1} unit="s" onChange={v => set({ jitter: v })} />
            <Slider label="Retries" value={c.retries} min={0} max={5} onChange={v => set({ retries: v })} />
            <Toggle checked={c.stopOnManual} onChange={v => set({ stopOnManual: v })} label="Stop on manual input" />
            <div className="counters">
              <div><small>QUEUED</small><b>{q.queued || 0}</b></div>
              <div><small>MATCHED</small><b>{q.matched || 0}</b></div>
              <div><small>COMPLETED</small><b>{q.completed || 0}</b></div>
              <div><small>FAILED</small><b>{q.failed || 0}</b></div>
            </div>
          </div>
        )}

        {tab === 'AIM' && (
          <div className="card-list">
            <Toggle checked={c.aimGuide} onChange={v => set({ aimGuide: v })} label="Aim guide line" />
            <Toggle checked={c.targetPreview} onChange={v => set({ targetPreview: v })} label="Target preview" />
            <Slider label="Guide opacity" value={c.guideOpacity} min={10} max={100} unit="%" onChange={v => set({ guideOpacity: v })} />
            <div className="guide-preview" style={{ opacity: c.guideOpacity / 100 }}><i /></div>
            <p className="note">Guide colour: #00E6A6 → #00C8FF.</p>
          </div>
        )}

        {tab === 'CONTROLS' && (
          <div className="card-list">
            <Slider label="Power" value={c.power} min={0} max={100} unit="%" onChange={v => set({ power: v })} />
            <Slider label="Side spin" value={c.sideSpin} min={-1} max={1} step={0.05} onChange={v => set({ sideSpin: v })} />
            <Slider label="Top / back spin" value={c.topSpin} min={-1} max={1} step={0.05} onChange={v => set({ topSpin: v })} />
            <div className="readout-line"><span>Power</span><b>{c.power}%</b></div>
            <div className="readout-line"><span>Spin</span><b>{c.sideSpin} / {c.topSpin}</b></div>
          </div>
        )}

        {tab === 'TABLE' && (
          <div className="card-list">
            <div className="readout-line"><span>Target build</span><b>8 Ball Pool 56.34.0</b></div>
            <div className="readout-line"><span>State schema</span><b className="ok">UNSET</b></div>
            <div className="readout-line"><span>Turn</span><b>{state.turn}</b></div>
            <div className="readout-line"><span>Result</span><b>{state.result || '—'}</b></div>
            <div className="readout-line"><span>Power</span><b>{state.power}%</b></div>
            <div className="readout-line"><span>Queue</span><b>{c.queueMode}</b></div>
            <p className="note">All offsets/RVAs remain unset until measured on the pinned build.</p>
          </div>
        )}
      </div>
    </section>
  )
}
