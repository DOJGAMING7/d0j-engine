// Step 7 decision helper. A session closes only on an explicit stop or on
// positive game-exit evidence; missing evidence never closes it by guesswork.

export function shouldCloseSession(session, watch) {
  if (session?.sessionActive === false) return true
  if (session?.sessionActive === undefined && session?.active === false) return true
  const verdict = String(watch?.verdict || watch?.state || '').toUpperCase()
  return verdict === 'GAME_EXITED' || verdict === 'SESSION_ENDED'
}

export function guardSummary(watch) {
  if (!watch) return 'no watch data'
  const verdict = watch.verdict || watch.state || 'UNKNOWN'
  const evidence = watch.evidence || 'NONE'
  const top = watch.topPackage || 'unknown'
  return `${verdict} · evidence:${evidence} · top:${top}`
}
