import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/sumup'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'

export default function HistoriquePage() {
  const [semaines, setSemaines] = useState([])
  const [loading, setLoading] = useState(true)
  const [annee, setAnnee] = useState(new Date().getFullYear())

  useEffect(() => {
    loadHistorique()
  }, [annee])

  async function loadHistorique() {
    setLoading(true)
    const { data } = await supabase
      .from('v_bilan_semaine')
      .select('*')
      .eq('annee', annee)
      .order('numero')
    setSemaines(data || [])
    setLoading(false)
  }

  const totalSaison = semaines.reduce((s, sem) => s + (sem.ca_total || 0), 0)
  const chartData = semaines.map(s => ({
    name: `S${s.numero}`,
    CA: s.ca_total,
    Espèces: s.ca_especes,
    CB: s.ca_cb,
    theme: s.theme,
  }))

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="page-title">Historique</p>
          <p className="page-subtitle">Vue d'ensemble des buvettes par saison</p>
        </div>
        <div className="flex-gap">
          <label style={{ fontSize: 12, color: 'var(--gray-400)' }}>Saison</label>
          <select
            style={{ padding: '6px 10px', border: '1px solid var(--gray-300)', borderRadius: 6, fontSize: 13 }}
            value={annee}
            onChange={e => setAnnee(+e.target.value)}
          >
            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading-page"><div className="spinner" /></div>
        ) : semaines.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📅</div>
            <p>Aucune buvette enregistrée pour {annee}</p>
          </div>
        ) : (
          <>
            <div className="metrics-grid">
              <div className="metric-card green">
                <div className="metric-label">CA saison {annee}</div>
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
                <div className="metric-sub">
                  {semaines.find(s => s.ca_total === Math.max(...semaines.map(s => s.ca_total)))?.theme || '—'}
                </div>
              </div>
            </div>

            <div className="card mb-16">
              <div className="card-title">Évolution du CA</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-100)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}€`} />
                  <Tooltip formatter={(v) => fmt(v)} />
                  <Legend />
                  <Bar dataKey="Espèces" stackId="a" fill="#d97706" radius={[0,0,0,0]} />
                  <Bar dataKey="CB" stackId="a" fill="#1d4ed8" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <div className="card-title">Tableau récapitulatif — saison {annee}</div>
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
                        <td><strong>S{s.numero}</strong></td>
                        <td className="text-muted">{s.date_debut} → {s.date_fin}</td>
                        <td>{s.theme ? <span className="badge badge-green">{s.theme}</span> : <span className="text-muted">—</span>}</td>
                        <td className="num">{s.nb_transactions}</td>
                        <td className="num" style={{ fontWeight: 700 }}>{fmt(s.ca_total)}</td>
                        <td className="num">{fmt(s.ca_especes)}</td>
                        <td className="num">{fmt(s.ca_cb)}</td>
                        <td>
                          <a href={`/bilan?s=${s.semaine_id}`} className="btn btn-sm">📋 Bilan</a>
                        </td>
                      </tr>
                    ))}
                    <tr className="tr-total">
                      <td colSpan={4}>Total saison {annee}</td>
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
