import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

const boot = document.getElementById('boot')
if (boot) boot.classList.add('hidden')
createRoot(document.getElementById('root')).render(<App />)
