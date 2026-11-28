import React from 'react'

const PATHS = {
  grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  list: <><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>,
  gear: <><circle cx="12" cy="12" r="3.2" /><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4L18 18M18 6l-1.6 1.6M7.6 16.4L6 18" /></>,
  bell: <><path d="M18 16H6l1.5-2.2V9a4.5 4.5 0 0 1 9 0v4.8L18 16Z" /><path d="M10 19a2 2 0 0 0 4 0" /></>,
  send: <><path d="M21 3L10 14" /><path d="M21 3l-6.5 18-4.5-7-7-4.5L21 3Z" /></>,
  play: <path d="M8 5l11 7-11 7Z" />,
  pause: <><path d="M8 5v14M16 5v14" /></>,
  queue: <><path d="M4 7h11a4 4 0 0 1 0 8H8" /><path d="M7 12l-3 3 3 3" /><circle cx="19" cy="17" r="2.4" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
  lines: <><path d="M4 20L20 4" /><path d="M13 4h7v7" /><circle cx="7" cy="17" r="2" /></>,
  ball: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.4" /></>,
  close: <><path d="M6 6l12 12M18 6L6 18" /></>,
  crown: <><path d="M4 18h16l-1.4-9-4.1 4L12 6l-2.5 7-4.1-4L4 18Z" /></>,
  fast: <><path d="M4 6l7 6-7 6V6Z" /><path d="M13 6l7 6-7 6V6Z" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  warning: <><path d="M12 3L2.5 20h19L12 3Z" /><path d="M12 9v5" /><circle cx="12" cy="17" r="1" /></>,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></>,
  lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  check: <path d="M5 12l4 4 10-10" />,
  spark: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /></>
}

export default function Icon({ name, size = 20, className = '' }) {
  const content = PATHS[name]
  if (!content) return null
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {content}
    </svg>
  )
}
