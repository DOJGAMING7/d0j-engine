import React from 'react'
import snakeLockup from '../assets/snake-lockup.png'
import snakeMark from '../assets/snake-mark.png'

export function SnakeMark({ size = 44, className = '' }) {
  return (
    <span className={`snake-mark ${className}`} style={{ width: size, height: size }} role="img" aria-label="Snake Engine">
      <img src={snakeMark} alt="" aria-hidden="true" />
    </span>
  )
}

export default function SnakeLogo({ compact = false, className = '' }) {
  if (compact) return <SnakeMark size={44} className={className} />
  return (
    <span className={`snake-lockup ${className}`} role="img" aria-label="SNAKE ENGINE">
      <img src={snakeLockup} alt="SNAKE ENGINE" />
    </span>
  )
}
