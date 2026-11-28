import React, { useEffect, useMemo, useState } from 'react'
import { AUTOPLAY_MODES, GAME_PACKAGES, GOLDEN_TARGETS } from '../lib/config.js'

const TABS = [
  { id: 'status', label: 'Status', icon: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg> },
  { id: 'lines', label: 'Lines', icon: <svg viewBox="0 0 24 24"><path d="M4 20L20 4"/><path d="M14 4h6v6"/><circle cx="7" cy="17" r="2"/></svg> },
  { id: 'autoplay', label: 'Auto', icon: <svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/><path d="M4 5v14"/></svg> },
  { id: 'eightball', label: '8 Ball', icon: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.2"/><path d="M12 8.8v6.4"/></svg> },
  { id: 'settings', label: 'Settings', icon: <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="11" cy="17" r="2"/></svg> }
]

function Section({ title }) {
  return <div className="mm-section"><span className="mm-mark" /><b>{title}</b></div>
}

function Row({ label, hint, children }) {
  return (
    <div className="mm-row">
      <div className="mm-label-wrap">
        <div className="mm-label">{label}</div>
        {hint ? <div className="mm-hint">{hint}</div> : null}
      </div>
      {children}
    </div>
  )
}

function Toggle({ checked, onChange, label, hint }) {
  return (
    <Row label={label} hint={hint}>
      <button type="button" className={`mm-switch ${checked ? 'on' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
        <i />
      </button>
    </Row>
  )
}

function Slider({ label, value, min, max, step = 1, suffix = '', onChange }) {
  return (
    <div className="mm-row mm-slider">
      <div className="mm-slider-head"><div className="mm-label">{label}</div><div className="mm-value">{value}{suffix}</div></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
    </div>
  )
}

function Chips({ label, value, options, onChange }) {
  return (
    <div className="mm-row mm-chips-row">
      <div className="mm-label">{label}</div>
      <div className="mm-chips">
        {options.map(opt => (
          <button key={String(opt)} type="button" className={`mm-chip ${String(value) === String(opt) ? 'active' : ''}`} onClick={() => onChange(opt)}>{String(opt)}</button>
        ))}
      </div>
    </div>
  )
}

function StatusRow({ label, value }) {
  return (
    <div className="mm-row">
      <div className="mm-label-wrap">
        <div className="mm-label">{label}</div>
        <div className="mm-hint">{value}</div>
      </div>
      <span className="mm-dot" aria-hidden="true" />
    </div>
  )
}

export default function ModMenu({
  config,
  setConfig,
  state,
  nativeStatus,
  sessionStatus,
  testReport,
  runningScript,
  runningLineScript,
  onClose,
  onPlay,
  onStartSession,
  onRunScript,
  onStop,
  onOpenTable,
  onRunLineScript,
  onRunQuickTest
}) {
  const [tab, setTab] = useState('status')
  const update = patch => setConfig({ ...config, ...patch })
  const findingShot = sessionStatus?.state === 'finding' || sessionStatus?.state === 'testing'
  const statusText = sessionStatus?.text || (config.autoPlay ? 'Auto play active' : 'Ready')
  const queueHidden = true

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const content = useMemo(() => {
    if (tab === 'status') return (
      <>
        <Section title="Session" />
        <StatusRow label="Client status" value={statusText} />
        <StatusRow label="Target" value={GAME_PACKAGES.eightBallPool} />
        <StatusRow label="Overlay session" value={nativeStatus?.floating ? 'Active (session-scoped)' : 'Inactive'} />
        <Section title="Quick Actions" />
        <div className="mm-actions">
          <button className="mm-action primary" onClick={onStartSession}><b>LAUNCH 8BP</b><span>Session start</span></button>
          <button className="mm-action" onClick={onRunQuickTest}><b>RUN TEST</b><span>No block</span></button>
          <button className="mm-action" onClick={onStop}><b>STOP</b><span>Safe halt</span></button>
          <button className="mm-action" onClick={onOpenTable}><b>LINE TEST</b><span>Demo table</span></button>
        </div>
        <Section title="Quick Test" />
        <div className="mm-note">
          {testReport?.items?.length ? testReport.items.map(i => (
            <div key={i.name} className="mm-test-item"><span>{i.ok ? 'PASS' : 'FAIL'}</span><b>{i.name}</b><small>{i.detail}</small></div>
          )) : <div className="mm-hint">No test report yet. Run quick test or launch 8BP.</div>}
        </div>
        <div className="mm-note">Quick test runs on 8BP launch but does not block launch. Live 8BP lines need an in-game bridge/patch; demo table prediction works locally.</div>
      </>
    )
    if (tab === 'lines') return (
      <>
        <Section title="Line Prediction" />
        <Toggle label="Show lines" hint="Draw prediction path" checked={!!config.showLines} onChange={v => update({ showLines: v })} />
        <Toggle label="Keep lines after shot" hint="Keep guide visible" checked={!!config.keepLines} onChange={v => update({ keepLines: v })} />
        <Toggle label="Power lock" hint="Lock power value" checked={!!config.powerLock} onChange={v => update({ powerLock: v })} />
        <Slider label="Default power" value={config.power} min={0} max={100} suffix="%" onChange={v => update({ power: v })} />
        <Toggle label="Show pockets" hint="Highlight selected pocket" checked={!!config.showPockets} onChange={v => update({ showPockets: v })} />
        <Slider label="Spin" value={config.lineSpin} min={-100} max={100} onChange={v => update({ lineSpin: v })} />
        <Slider label="Line opacity" value={config.lineOpacity} min={10} max={100} suffix="%" onChange={v => update({ lineOpacity: v })} />
        <div className="mm-actions">
          <button className="mm-action" disabled={runningLineScript} onClick={onRunLineScript}><b>{runningLineScript ? 'TESTING...' : 'RUN 3 SHOTS'}</b><span>Prediction script</span></button>
          <button className="mm-action" onClick={onOpenTable}><b>OPEN DEMO</b><span>Table test</span></button>
        </div>
        <div className="mm-note">Demo table prediction is local/simulated. Real 8BP live lines require an in-game bridge/patch.</div>
      </>
    )
    if (tab === 'autoplay') return (
      <>
        <Section title="Auto Play" />
        <Toggle label="Enable auto play" hint="Local/simulated engine control" checked={!!config.autoPlay} onChange={v => { update({ autoPlay: v }); onPlay?.(v) }} />
        <Chips label="Auto play mode" value={config.autoPlayMode} options={AUTOPLAY_MODES} onChange={v => update({ autoPlayMode: v, mode: v === 'Pro Player' ? 'Human' : 'Fast' })} />
        <Toggle label="Failed break" hint="Break handling behavior" checked={!!config.failedBreak} onChange={v => update({ failedBreak: v })} />
        <Section title="Live Feedback" />
        <StatusRow label="Shot search" value={findingShot ? 'Finding shot...' : statusText} />
        <StatusRow label="Temp notifications" value={config.tempNotifications ? 'Enabled' : 'Disabled'} />
        <div className="mm-actions">
          <button className="mm-action primary" disabled={runningScript} onClick={onRunScript}><b>{runningScript ? 'RUNNING...' : 'RUN RATIMODA'}</b><span>State machine</span></button>
          <button className="mm-action" onClick={onStop}><b>STOP</b><span>Safe halt</span></button>
        </div>
      </>
    )
    if (tab === 'eightball') return (
      <>
        <Section title="8 Ball Play" />
        <Toggle label="Prioritize 9th ball" checked={!!config.prioritize9} onChange={v => update({ prioritize9: v })} />
        <Toggle label="Paralysis opponent turn" checked={!!config.paralysisOpponent} onChange={v => update({ paralysisOpponent: v })} />
        <Toggle label="Clean up shot" checked={!!config.cleanUpShot} onChange={v => update({ cleanUpShot: v })} />
        <Section title="Golden Shot" />
        <Chips label="Golden shot target" value={config.goldenTarget} options={GOLDEN_TARGETS} onChange={v => update({ goldenTarget: Number(v) })} />
        <div className="mm-note">Golden target: center [1] to last ring [4]. {queueHidden ? 'Auto queue UI is hidden/removed from client.' : ''}</div>
      </>
    )
    return (
      <>
        <Section title="Client Behavior" />
        <Toggle label="Persistent notification" hint="Show D0J working status" checked={!!config.notificationsEnabled} onChange={v => update({ notificationsEnabled: v })} />
        <Toggle label="Temp cheat notifications" hint="Finding shot, shot found, etc." checked={!!config.tempNotifications} onChange={v => update({ tempNotifications: v })} />
        <Toggle label="Run quick test on 8BP launch" hint="Does not block launch" checked={!!config.runTestOnLaunch} onChange={v => update({ runTestOnLaunch: v })} />
        <Toggle label="Show test report in menu" checked={config.showTestReport !== false} onChange={v => update({ showTestReport: v })} />
        <Section title="Clean Build" />
        <StatusRow label="Home screen" value="Clean — no cheat clutter" />
        <StatusRow label="Auto queue UI" value="Hidden/removed" />
        <StatusRow label="A1 policy" value="No accessibility / no auto-back" />
      </>
    )
  }, [tab, config, statusText, nativeStatus, findingShot, runningScript, runningLineScript, testReport, onPlay, onRunScript, onStop, onOpenTable, onRunLineScript, onStartSession, onRunQuickTest, queueHidden])

  return (
    <div className="mm-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mm-shell" role="dialog" aria-label="D0J Mod Menu">
        <section className="mm-main">
          <header className="mm-header">
            <div className="mm-brand">
              <div className="mm-logo">D0J</div>
              <div className="mm-brand-copy">
                <b>D0J ENGINE</b>
                <span>8 Ball Pool · session mod menu</span>
              </div>
            </div>
            <div className={`mm-status ${findingShot ? 'searching' : ''}`}>
              {findingShot ? <span className="mm-spinner" aria-hidden="true" /> : <span className="mm-status-dot" aria-hidden="true" />}
              <span>{statusText}</span>
            </div>
          </header>
          <div className="mm-content">{content}</div>
        </section>
        <aside className="mm-side">
          <div className="mm-app">8BP</div>
          <div className="mm-hr" />
          <div className="mm-tabs">
            {TABS.map(t => (
              <button key={t.id} type="button" className={`mm-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)} aria-label={t.label} title={t.label}>
                {t.icon}
              </button>
            ))}
          </div>
          <div className="mm-hr" />
          <button type="button" className="mm-close" onClick={onClose} aria-label="Close menu" title="Close">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </aside>
      </div>
    </div>
  )
}
