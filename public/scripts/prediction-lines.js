export default async function predictionLines(api, log) {
  const cfg = await api.getConfig().catch(() => ({}))
  const say = msg => { try { log(String(msg)) } catch {} }

  const power = Math.max(0, Math.min(100, Number(cfg.power ?? 74)))
  const spin = Number(cfg.lineSpin ?? 0)
  const shots = [
    { x: 300, y: 300 },
    { x: 420, y: 420 },
    { x: 180, y: 420 }
  ]

  await api.setConfig({
    showLines: true,
    keepLines: true,
    powerLock: true,
    power,
    lineSpin: spin
  })

  say(`D0J LINE TEST: start power=${power} spin=${spin.toFixed(2)}`)

  const report = { ok: false, predictions: 0, targets: [], error: null }

  try {
    for (let i = 1; i <= shots.length; i++) {
      const aim = shots[i - 1]
      const prediction = await api.predict({ aim, power, spin })

      const target = prediction.target?.id || 'none'
      const pocket = prediction.pocket?.id || 'none'
      const points = prediction.cuePath?.length || 0

      say(`LINE ${i}: aim=${aim.x},${aim.y} target=${target} pocket=${pocket} points=${points}`)
      report.targets.push({ target, pocket, points })

      if (points < 2) throw new Error('prediction path empty')

      await api.shoot({ aim, power, spin })
      report.predictions++

      if (typeof api.sleep === 'function') await api.sleep(120)
    }

    report.ok = report.predictions === shots.length
    say(`D0J LINE TEST: complete (${report.predictions}/${shots.length} predictions, simulated only)`)
    return report
  } catch (e) {
    report.error = String(e?.message || e)
    say(`D0J LINE TEST: FAILED ${report.error}`)
    return report
  }
}
