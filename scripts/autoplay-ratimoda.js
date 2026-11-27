export default async function autoplayRatimoda(api, log) {
  log('RATIMODA TEST: starting on simulated bridge')
  await api.setConfig({ autoPlay: true, mode: 'Slow', autoQueue: true, queueMode: 'SESSION', matchLimit: 3 })

  for (let i = 1; i <= 3; i++) {
    await api.waitFor(s => s.turn === 'you', 15000)
    const s = await api.getState()
    const aimX = 540 + Math.round((s.aimError || 0) * 12)
    const power = Math.min(100, Math.max(20, s.power || 70))
    await api.tap(aimX, 1180, 55)
    log(`RATIMODA TEST: shot ${i}/3 at x=${aimX} power=${power}% spin=${s.spin || 0}`)
    await api.waitFor(s => s.turn === 'opponent' || s.result, 20000)
    await api.sleep(350)
  }

  await api.setConfig({ autoPlay: false, autoQueue: false })
  log('RATIMODA TEST: complete (3 shots, simulated only)')
}
