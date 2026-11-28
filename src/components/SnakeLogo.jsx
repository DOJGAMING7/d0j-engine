import React from 'react'
import snakeMark from '../assets/snake-mark.png'

export function SnakeMark({ size = 44, className = '' }) {
  return (
    <span className={`snake-mark ${className}`} style={{ width: size, height: size }} role="img" aria-label="Snake Engine">
      <img src={snakeMark} alt="" aria-hidden="true" />
    </span>
  )
}

export default function SnakeLogo({ compact = false }) {
  if (compact) return <SnakeMark size={44} />
  return (
    <svg className="snake-lockup" viewBox="0 0 360 120" role="img" aria-label="Snake Engine">
      <g transform="translate(0 0)">
        <path d="M64 6 L108 22 V58 C108 88 88 108 64 120 C40 108 20 88 20 58 V22 Z" fill="#080808" stroke="#2A2A2A" strokeWidth="3" />
        <path d="M40 31 L48 16 L56 28 L64 12 L72 28 L80 16 L88 31" fill="none" stroke="#3BD62B" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
        <path d="M46 52 C66 38 88 48 84 64 C80 80 54 76 48 90 C43 102 58 110 76 102" fill="none" stroke="#3BD62B" strokeWidth="12" strokeLinecap="round" />
        <circle cx="46" cy="52" r="12" fill="#3BD62B" />
        <circle cx="42" cy="49" r="3" fill="#FFD400" />
        <path d="M35 55 L25 58" stroke="#FF3B3B" strokeWidth="2" strokeLinecap="round" />
      </g>
      <text x="136" y="66" fill="#3BD62B" fontSize="46" fontWeight="900" fontFamily="system-ui, sans-serif" letterSpacing="1">SNAKE</text>
      <text x="139" y="101" fill="#E6E6E6" fontSize="24" fontWeight="700" fontFamily="system-ui, sans-serif" letterSpacing="10">ENGINE</text>
    </svg>
  )
}
