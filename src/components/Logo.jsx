export default function Logo({ compact = false }) {
  return (
    <svg className={compact ? 'logo compact' : 'logo'} viewBox="0 0 300 86" role="img" aria-label="D0J EnGine">
      <defs>
        <linearGradient id="d0jStroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00E6A6" />
          <stop offset="100%" stopColor="#00C8FF" />
        </linearGradient>
        <filter id="d0jGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3.2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g fill="none" stroke="url(#d0jStroke)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" filter="url(#d0jGlow)">
        <path d="M12 18 V62 C12 74 19 80 29 80 C39 80 46 73 46 62 V18" />
        <path d="M70 80 C61 80 57 71 57 49 C57 27 61 18 70 18 C79 18 83 27 83 49 C83 71 79 80 70 80 Z" />
        <path d="M112 18 V62 C112 74 106 80 97 80 C89 80 85 75 85 68" />
      </g>
      <text x="132" y="66" fill="#EAF6FF" fontSize="34" fontWeight="300" letterSpacing="1.5" fontFamily="system-ui, sans-serif">EnGine</text>
      <text x="134" y="80" fill="#8AA8BF" fontSize="9" fontWeight="300" letterSpacing="4" fontFamily="system-ui, sans-serif">PRIVATE BUILD</text>
    </svg>
  )
}
