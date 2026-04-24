import React from 'react'
import ReactDOM from 'react-dom/client'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

ReactDOM.createRoot(document.getElementById('root')).render(
  <div style={{padding: 40, fontFamily: 'sans-serif'}}>
    <h1>🍺 Test de démarrage</h1>
    <p>SUPABASE_URL : <strong>{url || '❌ MANQUANT'}</strong></p>
    <p>SUPABASE_KEY : <strong>{key ? '✅ présente' : '❌ MANQUANTE'}</strong></p>
  </div>
)
