import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AUTOPLAY_MODES, GAME_PACKAGES, GOLDEN_TARGETS, QUEUE_MODES, TABLE_PROFILES } from '../lib/config.js'

const TABS = [
  { id: 'status', label: 'Status', icon: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg> },
  { id: 'lines', label: 'Lines', icon: <svg viewBox="0 0 24 24"><path d="M4 20L20 4"/><path d="M14 4h6v6"/><circle cx="7" cy="17" r="2"/></svg> },
  { id: 'autoplay', label: 'Auto', icon: <svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/><path d="M4 5v14"/></svg> },
  { id: 'queue', label: 'Queue', icon: <svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="3" rx="1"/><rect x="4" y="10.5" width="16" height="3" rx="1"/><rect x="4" y="16" width="10" height="3" rx="1"/></svg> },
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
      <button type="button" className={`mm-switch ${checked ? 'on' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}><i /></button>
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
      <div className="mm-label-wrap"><div className="mm-label">{label}</div><div className="mm-hint">{value}</div></div>
      <span className="mm-dot" aria-hidden="true" />
    </div>
  )
}
function Counters({ queue = {} }) {
  return (
    <div className="mm-counters">
      {['queued','matched','completed','failed'].map(k => (
        <div key={k} className="mm-counter"><small>{k.toUpperCase()}</small><b>{queue[k] || 0}</b></div>
      ))}
    </div>
  )
}

export default function ModMenu({
  config, setConfig, state, nativeStatus, sessionStatus, testReport,
  runningScript, runningLineScript,
  onClose, onPlay, onStartSession, onRunScript, onStop, onOpenTable, onRunLineScript, onRunQuickTest,
  liveOverlay, onStartLiveOverlay, onStopLiveOverlay, liveOverlayInfo,
  autoLive, autoLiveInfo, onStartLiveAuto, onStopLiveAuto, inputInfo,
  onRequestNotifications, onRequestUsageAccess
}) {
  const [tab, setTab] = useState('status')
  const [pos, setPos] = useState(() => ({ x: Number(config.menuX ?? 18), y: Number(config.menuY ?? 18) }))
  const dragRef = useRef(null)
  const shellRef = useRef(null)

  const update = patch => setConfig({ ...config, ...patch })
  const c = config
  const q = state?.queue || {}
  const findingShot = sessionStatus?.state === 'finding' || sessionStatus?.state === 'testing'
  const statusText = sessionStatus?.text || (c.autoPlay ? 'Auto play active' : 'Ready')

  useEffect(() => { setPos({ x: Number(c.menuX ?? 18), y: Number(c.menuY ?? 18) }) }, []) // initial only

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const onDragStart = e => {
    if (e.button !== undefined && e.button !== 0) return
    const target = e.target
    if (target.closest('button, input, select, textarea, a, .mm-chip, .mm-switch')) return
    const rect = shellRef.current?.getBoundingClientRect()
    if (!rect) return
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: rect.left, oy: rect.top }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onDragMove = e => {
    if (!dragRef.current) return
    const nx = Math.max(8, Math.min(window.innerWidth - 120, dragRef.current.ox + (e.clientX - dragRef.current.sx)))
    const ny = Math.max(8, Math.min(window.innerHeight - 80, dragRef.current.oy + (e.clientY - dragRef.current.sy)))
    setPos({ x: nx, y: ny })
  }
  const onDragEnd = () => {
    if (!dragRef.current) return
    dragRef.current = null
    setConfig({ ...config, menuX: pos.x, menuY: pos.y })
  }

  const selectQueueTable = name => {
    update({ queueTable: name, tableProfile: name })
    setConfig({ ...config, queueTable: name, tableProfile: name })
  }

  const content = useMemo(() => {
    if (tab === 'status') return (
      <>
        <Section title="Session" />
        <StatusRow label="Client status" value={statusText} />
        <StatusRow label="Target" value={GAME_PACKAGES.eightBallPool} />
        <StatusRow label="Overlay session" value={nativeStatus?.floating ? 'Active (session-scoped)' : 'Inactive'} />
        <StatusRow label="Overlay permission" value={nativeStatus?.overlay ? 'GRANTED' : 'NOT GRANTED'} />
        <Section title="Quick Actions" />
        <div className="mm-actions">
          <button className="mm-action primary" onClick={() => onStartSession(GAME_PACKAGES.eightBallPool)}><b>LAUNCH 8BP</b><span>Session start</span></button>
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
        <div className="mm-note">Quick test runs on 8BP launch but does not block launch. In-game toast shows pass/fail in session overlay.</div>
      </>
    )

    if (tab === 'lines') return (
      <>
        <Section title="Basic Settings" />
        <Toggle label="Show lines" hint="Draw prediction path" checked={c.showLines !== false} onChange={v => update({ showLines: v })} />
        <Toggle label="Keep lines after shot" hint="Keep guide visible" checked={c.keepLines !== false} onChange={v => update({ keepLines: v })} />
        <Toggle label="Power lock" hint="Lock power value" checked={c.powerLock === true} onChange={v => update({ powerLock: v })} />
        <Section title="Other Settings" />
        <Slider label="Default power" value={c.power} min={0} max={100} suffix="%" onChange={v => update({ power: v })} />
        <Toggle label="Show pockets" hint="Highlight selected pocket" checked={c.showPockets !== false} onChange={v => update({ showPockets: v })} />
        <Section title="Line Prediction" />
        <Slider label="Spin" value={c.lineSpin ?? 0} min={-100} max={100} onChange={v => update({ lineSpin: v, sideSpin: v })} />
        <Slider label="Line opacity" value={c.lineOpacity ?? 85} min={10} max={100} suffix="%" onChange={v => update({ lineOpacity: v, guideOpacity: v })} />
        <Slider label="Guide opacity" value={c.guideOpacity ?? 70} min={10} max={100} suffix="%" onChange={v => update({ guideOpacity: v })} />
        <div className="mm-actions">
          <button className="mm-action" disabled={runningLineScript} onClick={onRunLineScript}><b>{runningLineScript ? 'TESTING...' : 'RUN ALL LINES'}</b><span>Prediction script</span></button>
          <button className="mm-action" onClick={onOpenTable}><b>OPEN DEMO</b><span>Table test</span></button>
          <button className="mm-action" onClick={liveOverlay ? onStopLiveOverlay : onStartLiveOverlay}><b>{liveOverlay ? 'STOP LIVE LINES' : 'START LIVE LINES'}</b><span>Overlay over game</span></button>
        </div>
        <div className="mm-note">Live overlay: {liveOverlay ? (liveOverlayInfo?.ok ? `${liveOverlayInfo.balls} balls · ${liveOverlayInfo.source}${liveOverlayInfo.simulated ? ' (simulated)' : ''}` : (liveOverlayInfo?.reason || 'waiting for measured state')) : 'off'}. Demo table prediction is local/simulated.</div>
      </>
    )

    if (tab === 'autoplay') return (
      <>
        <Section title="Auto Play Settings" />
        <Toggle label="Enable auto play" hint="Local/simulated engine control" checked={c.autoPlay === true} onChange={v => { update({ autoPlay: v }); onPlay?.(v) }} />
        <Chips label="Auto play mode" value={c.autoPlayMode} options={AUTOPLAY_MODES} onChange={v => update({ autoPlayMode: v, mode: v === 'Pro Player' ? 'Human' : 'Fast' })} />
        <Section title="Break Settings" />
        <Toggle label="Failed break" hint="Break handling behavior" checked={c.failedBreak === true} onChange={v => update({ failedBreak: v })} />
        <Section title="Live Feedback" />
        <StatusRow label="Shot search" value={findingShot ? 'Finding shot...' : statusText} />
        <StatusRow label="Temp notifications" value={c.tempNotifications ? 'Enabled' : 'Disabled'} />
        <div className="mm-actions">
          <button className="mm-action primary" disabled={runningScript} onClick={onRunScript}><b>{runningScript ? 'RUNNING...' : 'RUN RATIMODA'}</b><span>State machine</span></button>
          <button className="mm-action" onClick={onStop}><b>STOP</b><span>Safe halt</span></button>
          <button className="mm-action primary" onClick={autoLive ? onStopLiveAuto : onStartLiveAuto}><b>{autoLive ? 'STOP LIVE AUTO' : 'START LIVE AUTO'}</b><span>Measured state + input</span></button>
        </div>
        <div className="mm-note">Live input: {inputInfo?.ready ? `ready :p${inputInfo?.process ?? '?'}` : (inputInfo?.reason || 'not attached')}. Auto: {autoLive ? (autoLiveInfo?.ok ? `${autoLiveInfo.target || 'no target'} · sent ${autoLiveInfo.stats?.sent || 0}/${autoLiveInfo.stats?.shots || 0} · ${autoLiveInfo.reason}` : (autoLiveInfo?.reason || 'waiting')) : 'off'}.</div>
      </>
    )

    if (tab === 'queue') return (
      <>
        <Section title="D0J Auto Queue" />
        <Toggle label="Auto queue" hint="Queue matches automatically" checked={c.autoQueue === true} onChange={v => update({ autoQueue: v })} />
        <Chips label="Queue count / mode" value={c.queueMode} options={QUEUE_MODES} onChange={v => update({ queueMode: v })} />
        <Slider label="Match limit" value={c.matchLimit ?? 3} min={1} max={20} onChange={v => update({ matchLimit: v })} />
        <Slider label="Delay" value={c.queueDelay ?? 2} min={0.5} max={10} step={0.5} suffix="s" onChange={v => update({ queueDelay: v })} />
        <Slider label="Jitter" value={c.jitter ?? 0.4} min={0} max={2} step={0.1} suffix="s" onChange={v => update({ jitter: v })} />
        <Slider label="Retries" value={c.retries ?? 2} min={0} max={5} onChange={v => update({ retries: v })} />
        <Toggle label="Stop on manual input" checked={c.stopOnManual !== false} onChange={v => update({ stopOnManual: v })} />
        <Section title="Auto Queue With Coins / Table" />
        <div className="mm-row mm-chips-row">
          <div className="mm-label">Select table (tap to go/select)</div>
          <div className="mm-chips">
            {TABLE_PROFILES.map(name => (
              <button key={name} type="button" className={`mm-chip ${(c.queueTable || c.tableProfile) === name ? 'active' : ''}`} onClick={() => selectQueueTable(name)}>{name}</button>
            ))}
          </div>
        </div>
        <StatusRow label="Selected queue table" value={c.queueTable || c.tableProfile || 'London'} />
        <Counters queue={q} />
        <div className="mm-note">Queue/table selection is stored in config. Real in-game coin table navigation needs game bridge/patch.</div>
      </>
    )

    if (tab === 'eightball') return (
      <>
        <Section title="8 Ball Play Settings" />
        <Toggle label="Prioritize 9th ball" checked={c.prioritize9 === true} onChange={v => update({ prioritize9: v })} />
        <Toggle label="Paralysis opponent turn" checked={c.paralysisOpponent === true} onChange={v => update({ paralysisOpponent: v })} />
        <Toggle label="Clean up shot" checked={c.cleanUpShot === true} onChange={v => update({ cleanUpShot: v })} />
        <Section title="Golden Shot Settings" />
        <Chips label="Golden shot target" value={c.goldenTarget} options={GOLDEN_TARGETS} onChange={v => update({ goldenTarget: Number(v) })} />
        <div className="mm-note">Golden target: center [1] to last ring [4].</div>
      </>
    )

    return (
      <>
        <Section title="Table / State" />
        <Chips label="Table profile" value={c.tableProfile} options={TABLE_PROFILES} onChange={v => update({ tableProfile: v })} />
        <StatusRow label="Queue state / phase" value={state?.phase || 'IDLE'} />
        <StatusRow label="turn" value={state?.turn || '-'} />
        <StatusRow label="result" value={state?.result || '-'} />
        <StatusRow label="power" value={`${state?.power ?? c.power}%`} />
        <StatusRow label="aimError" value={Number(state?.aimError || 0).toFixed(2)} />
        <Section title="Client Behavior" />
        <StatusRow label="Notifications" value={nativeStatus?.notifications ? 'GRANTED' : 'NOT GRANTED'} />
        <StatusRow label="Usage access" value={nativeStatus?.usageAccess ? 'GRANTED' : 'OPTIONAL'} />
        <div className="mm-actions">
          <button className="mm-action" onClick={onRequestNotifications}><b>NOTIFICATION PERM</b><span>Ask Android 13+</span></button>
          <button className="mm-action" onClick={onRequestUsageAccess}><b>USAGE ACCESS</b><span>Auto-stop on game close</span></button>
        </div>
        <Toggle label="Persistent notification" hint="Show D0J working status" checked={c.notificationsEnabled !== false} onChange={v => update({ notificationsEnabled: v })} />
        <Toggle label="Temp cheat notifications" hint="Finding shot, shot found, etc." checked={c.tempNotifications !== false} onChange={v => update({ tempNotifications: v })} />
        <Toggle label="Run quick test on 8BP launch" hint="Does not block launch" checked={c.runTestOnLaunch !== false} onChange={v => update({ runTestOnLaunch: v })} />
        <Toggle label="Auto-stop when 8BP closes" hint="Needs Usage access" checked={c.autoStopOnGameExit === true} onChange={v => update({ autoStopOnGameExit: v })} />
        <Section title="Clean Build / A1" />
        <StatusRow label="Home screen" value="Clean — no cheat clutter" />
        <StatusRow label="A1 policy" value="No accessibility / no auto-back" />
      </>
    )
  }, [tab, c, state, statusText, nativeStatus, findingShot, runningScript, runningLineScript, testReport, onPlay, onRunScript, onStop, onOpenTable, onRunLineScript, onStartSession, onRunQuickTest])

  return (
    <div className="mm-backdrop mm-floating">
      <div
        className="mm-shell mm-left"
        ref={shellRef}
        role="dialog"
        aria-label="D0J Mod Menu"
        style={{ position: 'fixed', left: pos.x, top: pos.y }}
      >
        <aside className="mm-side" onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
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

        <section className="mm-main">
          <header className="mm-header" onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
            <div className="mm-brand">
              <div className="mm-logo">D0J</div>
              <div className="mm-brand-copy"><b>D0J ENGINE</b><span>8 Ball Pool · session mod menu · drag to move</span></div>
            </div>
            <div className={`mm-status ${findingShot ? 'searching' : ''}`}>
              {findingShot ? <span className="mm-spinner" aria-hidden="true" /> : <span className="mm-status-dot" aria-hidden="true" />}
              <span>{statusText}</span>
            </div>
          </header>
          <div className="mm-content">{content}</div>
        </section>
      </div>
    </div>
  )
}
