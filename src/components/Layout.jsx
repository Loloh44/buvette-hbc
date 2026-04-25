import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import LOGO from '../assets/logo.js'

const NAV = [
  { to: '/dashboard', icon: '📊', label: 'Tableau de bord' },
  { to: '/bilan', icon: '📋', label: 'Bilan semaine' },
  { to: '/import', icon: '📂', label: 'Import SumUp' },
  { to: '/achats', icon: '🛒', label: 'Saisie achats' },
  { to: '/ticket', icon: '📷', label: 'Scan ticket' },
  { to: '/historique', icon: '📅', label: 'Historique' },
  { to: '/produits', icon: '🍺', label: 'Produits' },
  { to: '/semaines', icon: '⚙️', label: 'Semaines' },
]

export default function Layout() {
  const navigate = useNavigate()
  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <img src={LOGO} alt="HBC La Fillière" style={{ width: 80, height: 80, objectFit: 'contain', marginBottom: 8 }} />
          <h1>HBC La Fillière</h1>
          <p>Gestion des buvettes</p>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section">
            <div className="nav-section-label">Navigation</div>
            {NAV.map(({ to, icon, label }) => (
              <NavLink key={to} to={to} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
                <span className="nav-icon">{icon}</span>
                {label}
              </NavLink>
            ))}
          </div>
        </nav>
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,.15)' }}>
          <button onClick={handleLogout} style={{
            width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,.1)',
            border: 'none', borderRadius: 6, color: 'rgba(255,255,255,.8)',
            fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8
          }}>🚪 Déconnexion</button>
        </div>
      </aside>
      <main className="main-content"><Outlet /></main>
    </div>
  )
}
