import React, { useEffect, useRef, useState } from 'react'
import { createDefaultTable } from '../lib/prediction.js'

function Toggle({ checked, onChange, label }) {
  return (
    <button className={`toggle-row ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <span><b>{label}</b></span>
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

export default function TableDemo({ config, setConfig, state, bridge, onBack, onLog, onRunLineScript, runningLineScript }) {
  const canvasRef = useRef(null)
  const table = state.table || createDefaultTable()
  const lines = state.lines || []
  const [aim, setAim] = useState({ x: table.cue.x, y: Math.max(80, table.cue.y - 260) })
  const [prediction, setPrediction] = useState(null)
  const [hideGuide, setHideGuide] = useState(false)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const p = await bridge.api.predict({
          aim: aim || { x: table.cue.x, y: table.cue.y - 100 },
          spin: config.lineSpin ?? config.sideSpin ?? 0,
          power: config.power
        })
        if (active) setPrediction(p)
      } catch {
        if (active) setPrediction(null)
      }
    })()
    return () => { active = false }
  }, [bridge, aim, config.power, config.lineSpin, config.sideSpin, state.table])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    canvas.width = table.width
    canvas.height = table.height
    const ctx = canvas.getContext('2d')
    const r = table.ballRadius
    const opacity = Math.max(0.1, Math.min(1, (config.lineOpacity ?? 85) / 100))

    ctx.fillStyle = '#06120A'
    ctx.fillRect(0, 0, table.width, table.height)

    ctx.strokeStyle = '#0A1D0F'
    ctx.lineWidth = 22
    ctx.strokeRect(11, 11, table.width - 22, table.height - 22)
    ctx.strokeStyle = '#1F4A1F'
    ctx.lineWidth = 2
    ctx.strokeRect(23, 23, table.width - 46, table.height - 46)

    for (const pocket of table.pockets || []) {
      ctx.beginPath()
      ctx.arc(pocket.x, pocket.y, table.pocketRadius + 7, 0, Math.PI * 2)
      ctx.fillStyle = '#000000'
      ctx.fill()
      ctx.strokeStyle = '#1F4A1F'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    const showGuide = config.showLines !== false && !hideGuide && (prediction || lines.length)
    if (showGuide) {
      const guideOpacity = Math.max(0.1, Math.min(1, (config.guideOpacity ?? config.lineOpacity ?? 70) / 100))
      ctx.save()
      ctx.globalAlpha = opacity
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      if (lines.length) {
        // Script-generated lines: one cue path + one target path per ball,
        // including the white ball's path to every ghost position.
        lines.forEach((line, index) => {
          const color = index % 2 ? '#B6FF9E' : '#39FF14'
          if (line.cuePath?.length > 1) {
            ctx.beginPath()
            line.cuePath.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))
            ctx.strokeStyle = color
            ctx.lineWidth = 2.5
            ctx.shadowColor = color
            ctx.shadowBlur = 10
            ctx.stroke()
            ctx.shadowBlur = 0
          }
          if (line.targetPath?.length > 1) {
            ctx.beginPath()
            line.targetPath.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))
            ctx.strokeStyle = color
            ctx.globalAlpha = opacity * guideOpacity
            ctx.lineWidth = 1.5
            ctx.setLineDash([7, 6])
            ctx.shadowBlur = 6
            ctx.stroke()
            ctx.setLineDash([])
            ctx.shadowBlur = 0
            ctx.globalAlpha = opacity
          }
          if (line.ghost) {
            ctx.beginPath()
            ctx.arc(line.ghost.x, line.ghost.y, r, 0, Math.PI * 2)
            ctx.strokeStyle = '#00E676'
            ctx.lineWidth = 2
            ctx.setLineDash([4, 4])
            ctx.stroke()
            ctx.setLineDash([])
          }
          if (config.targetPreview !== false && line.pocket) {
            ctx.beginPath()
            ctx.arc(line.pocket.x, line.pocket.y, table.pocketRadius + 12, 0, Math.PI * 2)
            ctx.strokeStyle = color
            ctx.lineWidth = 2
            ctx.stroke()
          }
          if (line.target) {
            ctx.fillStyle = color
            ctx.font = '700 11px system-ui, sans-serif'
            ctx.fillText(String(line.ballId), line.target.x + r + 5, line.target.y - r - 4)
          }
        })
      } else if (prediction) {
        if (prediction.cuePath?.length > 1) {
          ctx.beginPath()
          prediction.cuePath.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))
          ctx.strokeStyle = '#39FF14'
          ctx.lineWidth = 2.5
          ctx.shadowColor = '#39FF14'
          ctx.shadowBlur = 12
          ctx.stroke()
        }

        if (prediction.targetPath?.length > 1) {
          ctx.beginPath()
          prediction.targetPath.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))
          ctx.strokeStyle = '#B6FF9E'
          ctx.lineWidth = 1.5
          ctx.setLineDash([7, 6])
          ctx.shadowBlur = 6
          ctx.stroke()
          ctx.setLineDash([])
        }

        if (prediction.ghost) {
          ctx.beginPath()
          ctx.arc(prediction.ghost.x, prediction.ghost.y, r, 0, Math.PI * 2)
          ctx.strokeStyle = '#00E676'
          ctx.lineWidth = 2
          ctx.setLineDash([4, 4])
          ctx.stroke()
          ctx.setLineDash([])
        }

        if (config.targetPreview !== false && prediction.pocket) {
          ctx.beginPath()
          ctx.arc(prediction.pocket.x, prediction.pocket.y, table.pocketRadius + 12, 0, Math.PI * 2)
          ctx.strokeStyle = '#39FF14'
          ctx.lineWidth = 2
          ctx.stroke()

          ctx.fillStyle = '#B6FF9E'
          ctx.font = '600 12px system-ui, sans-serif'
          ctx.fillText(prediction.pocket.id, prediction.pocket.x + 24, prediction.pocket.y + 4)
        }

        if (flash && prediction.ghost) {
          ctx.beginPath()
          ctx.arc(prediction.ghost.x, prediction.ghost.y, r + 16, 0, Math.PI * 2)
          ctx.strokeStyle = '#FFFFFF'
          ctx.lineWidth = 3
          ctx.stroke()
        }
      }
      ctx.restore()

      if (prediction?.dir) {
        const dir = prediction.dir
        const stickStart = { x: table.cue.x - dir.x * 24, y: table.cue.y - dir.y * 24 }
        const stickEnd = { x: table.cue.x - dir.x * 120, y: table.cue.y - dir.y * 120 }
        ctx.beginPath()
        ctx.moveTo(stickStart.x, stickStart.y)
        ctx.lineTo(stickEnd.x, stickEnd.y)
        ctx.strokeStyle = 'rgba(182,255,158,.55)'
        ctx.lineWidth = 5
        ctx.lineCap = 'round'
        ctx.stroke()
      }
    }

    for (const ball of [...(table.balls || []), { ...table.cue, id: 'CUE', color: '#F5FFF5' }]) {
      ctx.beginPath()
      ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2)
      ctx.fillStyle = ball.color || '#FFFFFF'
      ctx.shadowColor = ball.id === 'CUE' ? 'rgba(245,255,245,.4)' : 'rgba(0,0,0,.5)'
      ctx.shadowBlur = 10
      ctx.fill()
      ctx.shadowBlur = 0

      if (ball.id !== 'CUE') {
        ctx.fillStyle = '#06120A'
        ctx.font = '700 10px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(ball.id, ball.x, ball.y + 0.5)
      }
    }
  }, [state.table, state.lines, prediction, config.showLines, config.targetPreview, config.lineOpacity, config.guideOpacity, hideGuide, flash])

  const setAimFromEvent = e => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    setAim({
      x: (e.clientX - rect.left) / rect.width * table.width,
      y: (e.clientY - rect.top) / rect.height * table.height
    })
    setHideGuide(false)
  }

  const shoot = async () => {
    try {
      const p = await bridge.api.shoot({
        aim: aim || { x: table.cue.x, y: table.cue.y - 100 },
        power: config.power,
        spin: config.lineSpin ?? config.sideSpin ?? 0
      })
      onLog(`LINE TEST: shot target=${p.target?.id || 'none'} pocket=${p.pocket?.id || 'none'} power=${config.power} spin=${config.lineSpin ?? 0}`)
      setFlash(true)
      setTimeout(() => setFlash(false), 320)
      if (!config.keepLines) setHideGuide(true)
    } catch (e) {
      onLog(`LINE TEST: ERROR ${String(e?.message || e)}`)
    }
  }

  const reset = async () => {
    await bridge.setState({
      table: createDefaultTable(),
      phase: 'YOUR_TURN',
      turn: 'you',
      result: null
    })
    if (bridge.api.clearLines) await bridge.api.clearLines()
    setAim({ x: 300, y: 180 })
    setHideGuide(false)
    onLog('LINE TEST: table reset')
  }

  const set = patch => setConfig(patch)

  return (
    <main className="app-shell table-shell">
      <header className="topbar">
        <button className="text-btn" onClick={onBack}>← Home</button>
        <strong className="screen-title">LINE PREDICTION</strong>
        <button className="icon-btn" onClick={reset} aria-label="Reset table">↺</button>
      </header>

      <div className="table-readout">
        <span><small>TARGET</small><b>{prediction?.target?.id || '—'}</b></span>
        <span><small>POCKET</small><b>{prediction?.pocket?.id || '—'}</b></span>
        <span><small>POWER</small><b>{config.power}%</b></span>
        <span><small>SPIN</small><b>{Number(config.lineSpin ?? 0).toFixed(2)}</b></span>
        <span><small>LINES</small><b>{lines.length}/{table.balls?.length || 0}</b></span>
      </div>

      <canvas
        ref={canvasRef}
        className="table-canvas"
        onPointerDown={e => { e.currentTarget.setPointerCapture?.(e.pointerId); setAimFromEvent(e) }}
        onPointerMove={e => { if (e.buttons) setAimFromEvent(e) }}
      />

      <div className="table-controls">
        <Toggle checked={config.showLines !== false} onChange={v => set({ showLines: v })} label="SHOW LINES" />
        <Toggle checked={config.keepLines !== false} onChange={v => set({ keepLines: v })} label="KEEP LINES AFTER SHOT" />
        <Toggle checked={config.powerLock === true} onChange={v => set({ powerLock: v })} label="POWER LOCK" />
        <Slider label="DEFAULT POWER" value={config.power} min={0} max={100} unit="%" disabled={config.powerLock} onChange={v => set({ power: v })} />
        <Slider label="SPIN" value={config.lineSpin ?? 0} min={-1} max={1} step={0.05} onChange={v => set({ lineSpin: v, sideSpin: v })} />
        <Slider label="LINE OPACITY" value={config.lineOpacity ?? 85} min={10} max={100} unit="%" onChange={v => set({ lineOpacity: v })} />
        <div className="btn-row">
          <button className="btn primary wide" onClick={shoot}>SHOOT</button>
          <button className="btn ghost" onClick={reset}>RESET TABLE</button>
        </div>
        <div className="btn-row">
          <button className="btn primary wide" disabled={runningLineScript} onClick={onRunLineScript}>
            {runningLineScript ? 'PLANNING…' : 'RUN ALL LINES'}
          </button>
          <button className="btn ghost" onClick={() => bridge.api.clearLines?.()}>CLEAR LINES</button>
        </div>
        <p className="note">Simulated bridge. All cue and object-ball lines come from prediction-lines.js; real 8BP needs an in-game bridge.</p>
      </div>
    </main>
  )
}
