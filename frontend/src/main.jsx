// frontend/src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css' // <-- Make sure this line is present
import * as THREE from 'three'

// Cache parsed GLB/texture results in memory for the tab session.
// useGLTF.preload on Login/Register pre-warms this so cinema/lecture hall load instantly.
THREE.Cache.enabled = true

// Initialize theme on app load
const savedTheme = localStorage.getItem('wewatch_theme') || 'dark';
if (savedTheme === 'dark') {
  document.documentElement.classList.add('dark');
} else {
  document.documentElement.classList.remove('dark');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)