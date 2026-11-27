export default function Logo({ compact = false }) {
  return (
    <svg className={compact ? 'logo compact' : 'logo'} viewBox="0 0 320 92" role="img" aria-label="D0J EnGine">
      <defs>
        <linearGradient id="d0jStroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#39FF14" />
          <stop offset="100%" stopColor="#00E676" />
        </linearGradient>
        <filter id="d0jGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.6" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g fill="none" stroke="url(#d0jStroke)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" filter="url(#d0jGlow)">
        <path d="M14 18 V62 C14 74 21 80 31 80 C41 80 48 73 48 62 V18" />
        <path d="M74 80 C64 80 60 71 60 49 C60 27 64 18 74 18 C84 18 88 27 88 49 C88 71 84 80 74 80 Z" />
        <path d="M122 18 V62 C122 74 115 80 105 80 C95 80 88 73 88 62 V18" />
        <path d="M150 18 L170 80 L190 18" />
      </g>
      <text x="202" y="64" fill="#F5FFF5" fontSize="34" fontWeight="600" fontFamily="system-ui, sans-serif">EnGine</text>
      <text x="204" y="82" fill="#A8BBA8" fontSize="10" fontWeight="500" letterSpacing="3" fontFamily="system-ui, sans-serif">PRIVATE BUILD</text>
    </svg>
  )
}
