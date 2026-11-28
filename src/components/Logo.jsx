import React from 'react'
import SnakeLogo from './SnakeLogo.jsx'

export default function Logo({ compact = false }) {
  return (
    <div className={compact ? 'logo compact' : 'logo'}>
      <SnakeLogo />
    </div>
  )
}
