export async function loadScriptEntries(base = 'scripts') {
  const res = await fetch(`${base}/index.json`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`script index HTTP ${res.status}`)
  const data = await res.json()
  return Array.isArray(data?.scripts) ? data.scripts : []
}

export async function loadScriptSource(file, base = 'scripts') {
  const clean = String(file || '').replace(/^\/+/, '')
  const res = await fetch(`${base}/${clean}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`script HTTP ${res.status}`)
  return await res.text()
}

export async function runScriptSource(source, api, log) {
  const cleaned = String(source || '').replace(/^\s*export\s+default\s+/, '').trim()
  if (!cleaned) throw new Error('empty script')
  const factory = new Function(
    'api', 'log', 'window', 'document', 'fetch', 'XMLHttpRequest', 'console',
    `return (${cleaned});`
  )
  const fn = factory(api, log, undefined, undefined, undefined, undefined, { log })
  if (typeof fn !== 'function') throw new Error('script must export a function')
  return await fn(api, log)
}
