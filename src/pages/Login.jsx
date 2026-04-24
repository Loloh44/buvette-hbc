import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Email ou mot de passe incorrect')
      setLoading(false)
    } else {
      navigate('/dashboard')
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">🍺</div>
        <h1 className="login-title">HBC La Fillière</h1>
        <p className="login-sub">Gestion des buvettes — Connexion</p>

        {error && <div className="alert alert-error">⚠️ {error}</div>}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tresorier@club.fr"
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Mot de passe</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={loading}
            style={{ marginTop: 4 }}
          >
            {loading ? <span className="spinner" /> : '🔑'} Se connecter
          </button>
        </form>

        <p style={{ marginTop: 16, fontSize: 11, color: 'var(--gray-400)', textAlign: 'center' }}>
          Accès réservé au trésorier du club
        </p>
      </div>
    </div>
  )
}
