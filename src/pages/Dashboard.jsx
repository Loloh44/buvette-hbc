import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/sumup'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, Legend, ComposedChart, Area } from 'recharts'

const CAT_COLORS = {
  Boissons: '#1d4ed8',
  Snacking: '#d97706',
  Boutique: '#7c3aed',
  Dons: '#db2777',
  Inconnu: '#9ca3af',
}

export default function Dashboard() {
  const [semaine, setSemaine] = useState(null)
  const [stats, setStats] = useState(null)
  const [catData, setCatData] = useState([])
  const [evolution, setEvolution] = useState([])
  const [topProduits, setTopProduits] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    setLoading(true)

    // Dernière semaine
    const { data: sem } = await supabase
      .from('semaines')
      .select('*')
      .order('annee', { ascending: false })
      .order('numero', { ascending: false })
      .limit(1)
      .single()

    if (!sem) { setLoading(false); return }
    setSemaine(sem)

    // Stats ventes semaine
    const { data: ventes } = await supabase
      .from('ventes')
      .select('prix_ttc, moyen_paiement, categorie, description, quantite, type_transaction')
      .eq('semaine_id', sem.id)
      .eq('type_transaction', 'Vente')

    if (ventes) {
      const ca = ventes.reduce((s, v) => s + (v.prix_ttc || 0), 0)
      const esp = ventes.filter(v => v.moyen_paiement === 'Espèces').reduce((s, v) => s + v.prix_ttc, 0)
      const cb = ca - esp

      setStats({ ca, esp, cb, nb: ventes.length })

      // Par catégorie
      const cats = {}
      ventes.forEach(v => {
        const c = v.categorie || 'Inconnu'
        cats[c] = (cats[c] || 0) + v.prix_ttc
      })
      setCatData(Object.entries(cats).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value))

      // Top produits
      const prods = {}
      ventes.forEach(v => {
        if (!prods[v.description]) prods[v.description] = { ca: 0, qte: 0 }
        prods[v.description].ca += v.prix_ttc
        prods[v.description].qte += v.quantite || 0
      })
      setTopProduits(
        Object.entries(prods).map(([nom, d]) => ({ nom, ...d }))
          .sort((a, b) => b.ca - a.ca).slice(0, 8)
      )
    }

    // Évolution sur la saison
    const { data: toutes } = await supabase
      .from('v_bilan_semaine')
      .select('*')
      .eq('annee', sem.annee)
      .order('numero')

    if (toutes) {
      let caCumul = 0
      let margeCumul = 0
      setEvolution(toutes.map(s => {
        caCumul += s.ca_total || 0
        const marge = (s.ca_total || 0) - (s.total_achats || 0) - (s.total_dons || 0)
        margeCumul += marge
        return {
          name: `S${s.numero}`,
          ca: Math.round(s.ca_total || 0),
          marge: Math.round(marge),
          caCumul: Math.round(caCumul),
          margeCumul: Math.round(margeCumul),
          theme: s.theme,
        }
      }))
    }

    setLoading(false)
  }

  if (loading) return <div className="loading-page"><div className="spinner" /><span>Chargement…</span></div>

  if (!semaine) return (
    <div>
      <div className="page-header"><div><p className="page-title">Tableau de bord</p></div></div>
      <div className="page-body">
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <p>Aucune semaine enregistrée.</p>
          <p className="text-sm mt-4">Commencez par créer une semaine puis importer un fichier SumUp.</p>
        </div>
      </div>
    </div>
  )

  const maxCa = Math.max(...(catData.map(c => c.value) || [1]))

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="page-title">Tableau de bord</p>
          <p className="page-subtitle">
            Dernière buvette — S{semaine.numero} {semaine.annee}
            {semaine.theme ? ` · ${semaine.theme}` : ''}
            {' · '}{semaine.date_debut} → {semaine.date_fin}
          </p>
        </div>
      </div>

      <div className="page-body">
        {stats && (
          <div className="metrics-grid">
            <div className="metric-card green">
              <div className="metric-label">Chiffre d'affaires</div>
              <div className="metric-value">{fmt(stats.ca)}</div>
              <div className="metric-sub">{stats.nb} transactions</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Espèces</div>
              <div className="metric-value">{fmt(stats.esp)}</div>
              <div className="metric-sub">{stats.ca ? Math.round(stats.esp / stats.ca * 100) : 0}% du CA</div>
            </div>
            <div className="metric-card blue">
              <div className="metric-label">Carte bancaire</div>
              <div className="metric-value">{fmt(stats.cb)}</div>
              <div className="metric-sub">{stats.ca ? Math.round(stats.cb / stats.ca * 100) : 0}% du CA</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Caisse ouverture</div>
              <div className="metric-value">{fmt(semaine.caisse_debut)}</div>
              <div className="metric-sub">Caisse fermeture : {fmt(semaine.caisse_fin)}</div>
            </div>
          </div>
        )}

        <div className="grid-2">
          {/* CA par catégorie */}
          <div className="card">
            <div className="card-title">CA par catégorie</div>
            {catData.map(c => (
              <div key={c.name} className="bar-row">
                <div className="bar-label-row">
                  <span>{c.name}</span>
                  <span style={{ fontWeight: 600 }}>{fmt(c.value)}</span>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${Math.round(c.value / maxCa * 100)}%`,
                      background: CAT_COLORS[c.name] || '#9ca3af'
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Top produits */}
          <div className="card">
            <div className="card-title">Top produits</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th className="num">Qté</th>
                    <th className="num">CA</th>
                  </tr>
                </thead>
                <tbody>
                  {topProduits.map(p => (
                    <tr key={p.nom}>
                      <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</td>
                      <td className="num">{Math.round(p.qte)}</td>
                      <td className="num" style={{ fontWeight: 600 }}>{fmt(p.ca)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Évolution saison */}
        {evolution.length > 1 && (
          <div className="card mt-16">
            <div className="card-title">CA & Marge hebdomadaires — saison {semaine.annee}</div>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={evolution} margin={{ top:16, right:16, bottom:4, left:8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-100)" />
                <XAxis dataKey="name" tick={{ fontSize:11 }} />
                <YAxis tick={{ fontSize:11 }} tickFormatter={v => `${v}€`} />
                <Tooltip formatter={v => fmt(v)} labelFormatter={(l, p) => p?.[0]?.payload?.theme || l} />
                <Legend />
                <Bar dataKey="ca" name="CA" fill="#6B3FA0" radius={[4,4,0,0]} />
                <Bar dataKey="marge" name="Marge" fill="#1A6B3C" radius={[4,4,0,0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="card mt-16">
            <div className="card-title">CA cumulé & Marge cumulée — saison {semaine.annee}</div>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={evolution} margin={{ top:16, right:16, bottom:4, left:8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-100)" />
                <XAxis dataKey="name" tick={{ fontSize:11 }} />
                <YAxis tick={{ fontSize:11 }} tickFormatter={v => `${v}€`} />
                <Tooltip formatter={v => fmt(v)} labelFormatter={(l, p) => p?.[0]?.payload?.theme || l} />
                <Legend />
                <Area type="monotone" dataKey="caCumul" name="CA cumulé" fill="#ede7f6" stroke="#6B3FA0" strokeWidth={2} />
                <Area type="monotone" dataKey="margeCumul" name="Marge cumulée" fill="#e8f5ee" stroke="#1A6B3C" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
