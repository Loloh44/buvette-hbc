import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth.jsx'
import Layout from './components/Layout.jsx'
import LoginPage from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ImportPage from './pages/Import.jsx'
import AchatsPage from './pages/Achats.jsx'
import ImportAchatsPage from './pages/ImportAchats.jsx'
import BilanPage from './pages/Bilan.jsx'
import HistoriquePage from './pages/Historique.jsx'
import ProduitsPage from './pages/Produits.jsx'
import SemainesPage from './pages/Semaines.jsx'
import DonsPage from './pages/Dons.jsx'
import ReferentielPage from './pages/Referentiel.jsx'
import StockPage from './pages/Stock.jsx'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading-page"><div className="spinner"/><span>Chargement…</span></div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="achats" element={<AchatsPage />} />
          <Route path="import-achats" element={<ImportAchatsPage />} />
          <Route path="dons" element={<DonsPage />} />
          <Route path="bilan" element={<BilanPage />} />
          <Route path="historique" element={<HistoriquePage />} />
          <Route path="produits" element={<ProduitsPage />} />
          <Route path="referentiel" element={<ReferentielPage />} />
          <Route path="stock" element={<StockPage />} />
          <Route path="semaines" element={<SemainesPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
