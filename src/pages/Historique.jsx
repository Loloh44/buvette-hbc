import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/sumup'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell } from 'recharts'

// Saison : juin N → mai N+1
// Ex: saison "2025-2026" = semaines de juin 2025 à mai 2026
function getSaisonLabel(saison) {
  const [start] = saison.split('-')
  return `Saison ${start}-${parseInt(start) + 1}`
}

function getCurrentSaison() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1 // 1-12
  // Si on est avant juin, on est dans la saison année-1 / année
  return month < 6 ? `${year - 1}-${year}` : `${year}-${year + 1}`
}

// Génère les saisons disponibles (3 saisons)
function getSaisons() {
  const current = getCurrentSaison()
  const [startYear] = current.split('-').map(Number)
  return [
    `${startYear - 1}-${startYear}`,
    `${startYear}-${startYear + 1}`,
    `${startYear + 1}-${startYear + 2}`,
  ]
}

const VIOLET = '#6B3FA0'

export default function HistoriquePage() {
  const [semaines, setSemaines] = useState([])
  const [loading, setLoading] = useState(true)
  const [saison, setSaison] = useState(getCurrentSaison())

  useEffect(() => { loadHistorique() }, [saison])

  async function loadHistorique() {
    setLoading(true)
    const [startYear, endYear] = saison.split('-').map(Number)

    // Semaines de juin N à mai N+1
    // En pratique : annee=startYear et mois>=6, OU annee=endYear et mois<=5
    // On filtre par date_debut
    const { data } = await supabase
      .from('v_bilan_semaine')
      .select('*')
      .or(`and(annee.eq.${startYear},date_debut.gte.${startYear}-06-01),and(annee.eq.${endYear},date_debut.lte.${endYear}-05-31)`)
      .order('annee')
      .order('numero')

    setSemaines(data || [])
    setLoading(false)
  }

  const totalSaison = semaines.reduce((s, sem) => s + (sem.ca_total || 0), 0)
  const chartData = semaines.map(s => ({
    name: `S${s.numero}`,
    Espèces: Math.round(s.ca_especes),
    CB: Math.round(s.ca_cb),
    theme: s.theme,
  }))

  const saisons = getSaisons()

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="page-title">Historique</p>
          <p className="page-subtitle">Vue d'ensemble par saison sportive (juin → mai)</p>
        </div>
        <div className="flex-gap">
          <label style={{ fontSize: 12, color: 'var(--gray-400)' }}>Saison</label>
          <select
            style={{ padding: '6px 10px', border: '1px solid var(--gray-300)', borderRadius: 6, fontSize: 13 }}
            value={saison}
            onChange={e => setSaison(e.target.value)}
          >
            {saisons.map(s => <option key={s} value={s}>{getSaisonLabel(s)}</option>)}
          </select>
        </div>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading-page"><div className="spinner" /></div>
        ) : semaines.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📅</div>
            <p>Aucune buvette enregistrée pour {getSaisonLabel(saison)}</p>
          </div>
        ) : (
          <>
            <div className="metrics-grid">
              <div className="metric-card green">
                <div className="metric-label">CA {getSaisonLabel(saison)}</div>
                <div className="metric-value">{fmt(totalSaison)}</div>
                <div className="metric-sub">{semaines.length} buvettes</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Moyenne / buvette</div>
                <div className="metric-value">{fmt(semaines.length ? totalSaison / semaines.length : 0)}</div>
              </div>
              <div className="metric-card blue">
                <div className="metric-label">Meilleure buvette</div>
                <div className="metric-value">{fmt(Math.max(...semaines.map(s => s.ca_total)))}</div>
                <div className="metric-sub">{semaines.find(s => s.ca_total === Math.max(...semaines.map(s => s.ca_total)))?.theme || '—'}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Total espèces</div>
                <div className="metric-value">{fmt(semaines.reduce((s, sem) => s + sem.ca_especes, 0))}</div>
                <div className="metric-sub">{totalSaison ? Math.round(semaines.reduce((s, sem) => s + sem.ca_especes, 0) / totalSaison * 100) : 0}% du CA</div>
              </div>
            </div>

            <div className="card mb-16">
              <div className="card-title">Évolution du CA — {getSaisonLabel(saison)}</div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ top: 16, right: 8, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0e8f8" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}€`} />
                  <Tooltip formatter={v => fmt(v)} />
                  <Legend />
                  <Bar dataKey="Espèces" stackId="a" fill="#9B6FD0" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="CB" stackId="a" fill={VIOLET} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <div className="card-title">Tableau récapitulatif — {getSaisonLabel(saison)}</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Semaine</th>
                      <th>Dates</th>
                      <th>Thème</th>
                      <th className="num">Transactions</th>
                      <th className="num">CA total</th>
                      <th className="num">Espèces</th>
                      <th className="num">CB</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {semaines.map(s => (
                      <tr key={s.semaine_id}>
                        <td><strong>S{s.numero} {s.annee}</strong></td>
                        <td className="text-muted">{s.date_debut} → {s.date_fin}</td>
                        <td>{s.theme ? <span className="badge badge-green">{s.theme}</span> : <span className="text-muted">—</span>}</td>
                        <td className="num">{s.nb_transactions}</td>
                        <td className="num" style={{ fontWeight: 700 }}>{fmt(s.ca_total)}</td>
                        <td className="num">{fmt(s.ca_especes)}</td>
                        <td className="num">{fmt(s.ca_cb)}</td>
                        <td><a href={`/bilan`} className="btn btn-sm">📋 Bilan</a></td>
                      </tr>
                    ))}
                    <tr className="tr-total">
                      <td colSpan={4}>Total {getSaisonLabel(saison)}</td>
                      <td className="num">{fmt(totalSaison)}</td>
                      <td className="num">{fmt(semaines.reduce((s, sem) => s + sem.ca_especes, 0))}</td>
                      <td className="num">{fmt(semaines.reduce((s, sem) => s + sem.ca_cb, 0))}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
