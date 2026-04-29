import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSortable } from '../hooks/useSortable.jsx'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/sumup'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, LineChart, Line, ComposedChart, Area
} from 'recharts'

const VIOLET = '#6B3FA0'
const VIOLET_LIGHT = '#9B6FD0'
const CAT_COLORS = {
  Boissons: '#1d4ed8',
  Snacking: '#d97706',
  Boutique: '#7c3aed',
  Dons: '#db2777',
  'Marche de Noel': '#059669',
  Inconnu: '#9ca3af',
}

function getCurrentSaison() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  return month < 6 ? `${year - 1}-${year}` : `${year}-${year + 1}`
}

function getSaisons() {
  const current = getCurrentSaison()
  const [startYear] = current.split('-').map(Number)
  return [
    `${startYear - 1}-${startYear}`,
    `${startYear}-${startYear + 1}`,
    `${startYear + 1}-${startYear + 2}`,
  ]
}

function getSaisonLabel(saison) {
  const [start] = saison.split('-')
  return `Saison ${start}-${parseInt(start) + 1}`
}

function formatSemaine(annee, numero) {
  return `${annee} S${String(numero).padStart(2, '0')}`
}

// Mois de la saison dans l'ordre juin→mai
const MOIS_SAISON = ['juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.', 'janv.', 'févr.', 'mars', 'avr.', 'mai']
const MOIS_NUM = [6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5]

export default function HistoriquePage() {
  const navigate = useNavigate()
  const [semaines, setSemaines] = useState([])
  const [achatsData, setAchatsData] = useState([])
  const [donsData, setDonsData] = useState([])
  const [loading, setLoading] = useState(true)
  const [saison, setSaison] = useState(getCurrentSaison())
  const [catData, setCatData] = useState([])
  const [margeData, setMargeData] = useState([])
  const [editModal, setEditModal] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  useEffect(() => { loadHistorique() }, [saison])

  async function loadHistorique() {
    setLoading(true)
    const [startYear, endYear] = saison.split('-').map(Number)

    const { data } = await supabase
      .from('v_bilan_semaine')
      .select('*')
      .or(`and(annee.eq.${startYear},date_debut.gte.${startYear}-06-01),and(annee.eq.${endYear},date_debut.lte.${endYear}-05-31)`)
      .order('annee')
      .order('numero')

    const rows = data || []
    setSemaines(rows)

    // Achats et dons pour calcul marge
    if (rows.length > 0) {
      const ids = rows.map(s => s.semaine_id)
      const [{ data: achats }, { data: dons }] = await Promise.all([
        supabase.from('achats').select('semaine_id, total_ttc, article_stock_id, fournisseur').in('semaine_id', ids),
        supabase.from('dons').select('semaine_id, montant_calcule').in('semaine_id', ids).neq('statut', 'annule'),
      ])
      setAchatsData(achats || [])
      setDonsData(dons || [])
    }

    // CA par catégorie par semaine
    if (rows.length > 0) {
      const ids = rows.map(s => s.semaine_id)
      const { data: ventes } = await supabase
        .from('ventes')
        .select('semaine_id, categorie, prix_ttc')
        .in('semaine_id', ids)
        .eq('type_transaction', 'Vente')

      // Par semaine
      const bySemaine = {}
      rows.forEach(s => {
        bySemaine[s.semaine_id] = { name: formatSemaine(s.annee, s.numero), Boissons: 0, Snacking: 0, Boutique: 0, Dons: 0, Inconnu: 0 }
      })
      ventes?.forEach(v => {
        const cat = v.categorie || 'Inconnu'
        if (bySemaine[v.semaine_id]) {
          bySemaine[v.semaine_id][cat] = (bySemaine[v.semaine_id][cat] || 0) + v.prix_ttc
        }
      })
      setCatData(Object.values(bySemaine))

      // Marge par mois
      const { data: achatsData } = await supabase
        .from('achats')
        .select('semaine_id, total_ttc')
        .in('semaine_id', ids)

      const margeParMois = {}
      MOIS_SAISON.forEach((m, i) => { margeParMois[i] = { name: m, ca: 0, marge: 0, achats: 0 } })

      rows.forEach(s => {
        const date = new Date(s.date_debut)
        const mois = date.getMonth() + 1
        const idx = MOIS_NUM.indexOf(mois)
        if (idx === -1) return
        margeParMois[idx].ca += s.ca_total || 0
        const achatsSem = achatsData?.filter(a => a.semaine_id === s.semaine_id).reduce((sum, a) => sum + a.total_ttc, 0) || 0
        const frais = (s.ca_cb || 0) * 0.0175
        margeParMois[idx].marge += (s.ca_total || 0) - achatsSem - frais
        margeParMois[idx].achats += achatsSem
      })

      // Marge cumulée
      let cumul = 0
      const margeArr = Object.values(margeParMois).map(m => {
        cumul += m.marge
        return { ...m, marge: Math.round(m.marge), margeCumulee: Math.round(cumul), ca: Math.round(m.ca) }
      })
      setMargeData(margeArr)
    }

    setLoading(false)
  }

  async function handleDeleteSemaine(semaineId) {
    await supabase.from('semaines').delete().eq('id', semaineId)
    setDeleteConfirm(null)
    loadHistorique()
  }

  async function handleDeleteVentes(semaineId) {
    await supabase.from('ventes').delete().eq('semaine_id', semaineId)
    setDeleteConfirm(null)
    loadHistorique()
  }

  const totalSaison = semaines.reduce((s, sem) => s + (sem.ca_total || 0), 0)
  const saisons = getSaisons()
  const cats = ['Boissons', 'Snacking', 'Boutique', 'Dons', 'Inconnu']

  // Enrichir semaines avec marge calculée pour tri
  const semainesEnrichies = semaines.map(s => {
    const a = achatsData.filter(x => x.semaine_id === s.semaine_id).reduce((t,x) => t+(x.total_ttc||0), 0)
    const d = donsData.filter(x => x.semaine_id === s.semaine_id).reduce((t,x) => t+(x.montant_calcule||0), 0)
    const frais = (s.ca_cb || 0) * 0.0175
    return { ...s, achats: a, dons: d, marge: (s.ca_total||0) - a - d - frais }
  })
  const { sorted: sortedSemaines, Th: ThSem } = useSortable(semainesEnrichies, 'numero', 'asc')

  return (
    <div>
      {/* Edit Modal */}
      {editModal && (
        <EditSemaineModal
          semaine={editModal}
          onClose={() => setEditModal(null)}
          onSaved={() => { setEditModal(null); loadHistorique() }}
        />
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 28, width: 420 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>⚠️ Supprimer des données</div>
            <p style={{ fontSize: 13, color: 'var(--gray-600)', marginBottom: 20 }}>
              Semaine <strong>{formatSemaine(deleteConfirm.annee, deleteConfirm.numero)}</strong> — {deleteConfirm.theme || 'Sans thème'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button className="btn btn-danger" onClick={() => handleDeleteVentes(deleteConfirm.semaine_id)}>
                🗑️ Supprimer uniquement les ventes (garder la semaine)
              </button>
              <button className="btn btn-danger" onClick={() => handleDeleteSemaine(deleteConfirm.semaine_id)}>
                💥 Supprimer la semaine complète (ventes + achats)
              </button>
              <button className="btn" onClick={() => setDeleteConfirm(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
  @media print {
    .sidebar, .no-print, button, .btn, select, input, nav, aside { display: none !important; }
    .app-layout { display: block !important; }
    .main-content { margin-left: 0 !important; padding: 0 !important; width: 100% !important; }
    .page-body { padding: 0 !important; }
    .page-header .flex-gap { display: none !important; }
    .card { box-shadow: none !important; border: 1px solid #ddd !important; break-inside: avoid; margin-bottom: 10px !important; }
    table { font-size: 10px; border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd !important; padding: 3px 6px !important; }
    th { background: #6B3FA0 !important; color: white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    tr { break-inside: avoid; }
    .recharts-wrapper, .recharts-responsive-container { display: none !important; }
    .print-chart-table { display: table !important; }
    @page { margin: 12mm 10mm; size: A4 landscape; }
  }
  .print-chart-table { display: none; }
`}</style>
    <div className="page-header">
        <div>
          <p className="page-title">Historique</p>
          <p className="page-subtitle">Vue d'ensemble par saison sportive (juin → mai)</p>
        </div>
        <div className="flex-gap">
          <label style={{ fontSize: 12, color: 'var(--gray-400)' }}>Saison</label>
          <select style={{ padding: '6px 10px', border: '1px solid var(--gray-300)', borderRadius: 6, fontSize: 13 }}
            value={saison} onChange={e => setSaison(e.target.value)}>
            {saisons.map(s => <option key={s} value={s}>{getSaisonLabel(s)}</option>)}
          </select>
          <button className="btn no-print" onClick={() => window.print()}>🖨️ Imprimer</button>
        </div>
      </div>

      <div className="page-body">
        {loading ? <div className="loading-page"><div className="spinner" /></div> : semaines.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📅</div>
            <p>Aucune buvette pour {getSaisonLabel(saison)}</p>
          </div>
        ) : (
          <>
            {/* KPIs */}
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
                <div className="metric-label">Marge cumulée</div>
                <div className="metric-value" style={{ color: VIOLET }}>
                  {margeData.length ? fmt(margeData[margeData.length - 1].margeCumulee) : '—'}
                </div>
              </div>
            </div>

            {/* Graphique 1 — CA par catégorie par semaine */}
            <div className="card mb-16">
              <div className="card-title">CA par catégorie — {getSaisonLabel(saison)}</div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={catData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0e8f8" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}€`} />
                  <Tooltip formatter={v => fmt(v)} />
                  <Legend />
                  {cats.map(cat => (
                    <Bar key={cat} dataKey={cat} stackId="a" fill={CAT_COLORS[cat]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Graphique 2 — Évolution marge mensuelle + cumulée */}
            <div className="card mb-16">
              <div className="card-title">Évolution de la marge — {getSaisonLabel(saison)}</div>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={margeData} margin={{ top: 24, right: 40, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0e8f8" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={v => `${v}€`} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => `${v}€`} />
                  <Tooltip formatter={v => fmt(v)} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="marge" name="Marge mensuelle" fill={VIOLET_LIGHT} radius={[4, 4, 0, 0]}>
                  </Bar>
                  <Line yAxisId="right" type="monotone" dataKey="margeCumulee" name="Marge cumulée" stroke={VIOLET} strokeWidth={2} dot={{ fill: VIOLET, r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Tableau récap */}
            <div className="card">
              <div className="card-title">Tableau récapitulatif — {getSaisonLabel(saison)}</div>
              <div className="table-wrap">
                <table style={{ tableLayout: 'fixed', width: '100%' }}>
                  <colgroup>
                    <col style={{ width: '70px' }} />
                    <col style={{ width: '170px' }} />
                    <col style={{ width: 'auto' }} />
                    <col style={{ width: '60px' }} />
                    <col style={{ width: '80px' }} />
                    <col style={{ width: '80px' }} />
                    <col style={{ width: '90px' }} />
                    <col style={{ width: '70px' }} />
                    <col style={{ width: '80px' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <ThSem col="numero">Semaine</ThSem>
                      <ThSem col="date_debut">Date</ThSem>
                      <ThSem col="theme">Thème</ThSem>
                      <ThSem col="nb_transactions" className="num">Trans.</ThSem>
                      <ThSem col="ca_total" className="num">CA total</ThSem>
                      <ThSem col="achats" className="num">Achats</ThSem>
                      <ThSem col="marge" className="num">Marge nette</ThSem>
                      <ThSem col="dons" className="num">Dons</ThSem>
                      <th className="no-print"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSemaines.map(s => {
                      const achatsSem = achatsData?.filter(a => a.semaine_id === s.semaine_id).reduce((sum, a) => sum + (a.total_ttc||0), 0) || 0
                      const donsSem = donsData?.filter(d => d.semaine_id === s.semaine_id).reduce((sum, d) => sum + (d.montant_calcule||0), 0) || 0
                      const frais = (s.ca_cb || 0) * 0.0175
                      const marge = (s.ca_total || 0) - achatsSem - donsSem - frais
                      return (
                      <tr key={s.semaine_id}>
                        <td style={{ whiteSpace:'nowrap' }}><strong>{formatSemaine(s.annee, s.numero)}</strong></td>
                        <td className="text-muted" style={{ whiteSpace:"nowrap", fontSize:12 }}>{s.date_debut?.slice(5).split('-').reverse().join('/') + ' → ' + (s.date_fin?.slice(5).split('-').reverse().join('/') || '')}</td>
                        <td style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"150px" }}>{s.theme ? <span className="badge badge-green">{s.theme}</span> : <span className="text-muted">—</span>}</td>
                        <td className="num">{s.nb_transactions}</td>
                        <td className="num" style={{ fontWeight: 700 }}>{fmt(s.ca_total)}</td>
                        <td className="num">{achatsSem > 0 ? fmt(achatsSem) : '—'}</td>
                        <td className="num" style={{ fontWeight:600, color: marge >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(marge)}</td>
                        <td className="num" style={{ color:'var(--green)' }}>{donsSem > 0 ? fmt(donsSem) : '—'}</td>
                        <td>
                          <div className="flex-gap">
                            <button className="btn btn-sm btn-primary" onClick={() => navigate(`/bilan?s=${s.semaine_id}`)}>
                              📋 Bilan
                            </button>
                            <button className="btn btn-sm" onClick={() => setEditModal(s)}>✏️</button>
                            <button className="btn btn-sm btn-danger" onClick={() => setDeleteConfirm(s)}>🗑️</button>
                          </div>
                        </td>
                      </tr>
                    )})
                    }
                    <tr className="tr-total">
                      <td colSpan={4}>Total {getSaisonLabel(saison)}</td>
                      <td className="num">{fmt(totalSaison)}</td>
                      <td className="num">{fmt(achatsData.reduce((s, a) => semaines.some(x => x.semaine_id === a.semaine_id) ? s + (a.total_ttc||0) : s, 0))}</td>
                      <td className="num" style={{ fontWeight:700, color:'var(--green)' }}>
                        {fmt(semaines.reduce((s, sem) => {
                          const a = achatsData.filter(x => x.semaine_id === sem.semaine_id).reduce((t,x) => t+(x.total_ttc||0), 0)
                          const d = donsData.filter(x => x.semaine_id === sem.semaine_id).reduce((t,x) => t+(x.montant_calcule||0), 0)
                          return s + (sem.ca_total||0) - a - d - (sem.ca_cb||0)*0.0175
                        }, 0))}
                      </td>
                      <td className="num">{fmt(donsData.reduce((s, d) => semaines.some(x => x.semaine_id === d.semaine_id) ? s + (d.montant_calcule||0) : s, 0))}</td>
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

// ─── Modal édition semaine ────────────────────────────────────────────────────
function EditSemaineModal({ semaine, onClose, onSaved }) {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    theme: semaine.theme || '',
    date_debut: semaine.date_debut || '',
    date_fin: semaine.date_fin || '',
    caisse_debut: semaine.caisse_debut || 0,
    caisse_fin: semaine.caisse_fin || 0,
    notes: semaine.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('infos') // infos | ventes | achats
  const [ventes, setVentes] = useState([])
  const [achats, setAchats] = useState([])
  const [loadingData, setLoadingData] = useState(false)

  useEffect(() => {
    if (tab === 'ventes') loadVentes()
    if (tab === 'achats') loadAchats()
  }, [tab])

  async function loadVentes() {
    setLoadingData(true)
    const { data } = await supabase.from('ventes').select('*').eq('semaine_id', semaine.semaine_id).order('date_vente', { ascending: false })
    setVentes(data || [])
    setLoadingData(false)
  }

  async function loadAchats() {
    setLoadingData(true)
    const { data } = await supabase.from('achats').select('*').eq('semaine_id', semaine.semaine_id).order('date_achat')
    setAchats(data || [])
    setLoadingData(false)
  }

  async function saveInfos() {
    setSaving(true)
    await supabase.from('semaines').update({
      theme: form.theme,
      date_debut: form.date_debut,
      date_fin: form.date_fin,
      caisse_debut: parseFloat(form.caisse_debut) || 0,
      caisse_fin: parseFloat(form.caisse_fin) || 0,
      notes: form.notes,
    }).eq('id', semaine.semaine_id)
    setSaving(false)
    onSaved()
  }

  async function deleteVente(id) {
    await supabase.from('ventes').delete().eq('id', id)
    loadVentes()
  }

  async function deleteAchat(id) {
    await supabase.from('achats').delete().eq('id', id)
    loadAchats()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 800, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 0', borderBottom: '1px solid var(--gray-200)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>
              ✏️ {formatSemaine(semaine.annee, semaine.numero)} — {semaine.theme || 'Sans thème'}
            </div>
            <button className="btn btn-sm" onClick={onClose}>✕ Fermer</button>
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: -1 }}>
            {['infos', 'ventes', 'achats'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                borderBottom: tab === t ? '2px solid var(--green)' : '2px solid transparent',
                color: tab === t ? 'var(--green)' : 'var(--gray-400)'
              }}>
                {t === 'infos' ? '⚙️ Informations' : t === 'ventes' ? '💰 Ventes' : '🛒 Achats'}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {tab === 'infos' && (
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Thème / Événement</label>
                <input className="form-input" value={form.theme} onChange={e => setForm(f => ({ ...f, theme: e.target.value }))} placeholder="Movember, Fête du club..." />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <input className="form-input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Date début</label>
                <input className="form-input" type="date" value={form.date_debut} onChange={e => setForm(f => ({ ...f, date_debut: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Date fin</label>
                <input className="form-input" type="date" value={form.date_fin} onChange={e => setForm(f => ({ ...f, date_fin: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Caisse début (€)</label>
                <input className="form-input" type="number" step="0.01" value={form.caisse_debut} onChange={e => setForm(f => ({ ...f, caisse_debut: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Caisse fin (€)</label>
                <input className="form-input" type="number" step="0.01" value={form.caisse_fin} onChange={e => setForm(f => ({ ...f, caisse_fin: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <button className="btn btn-primary" onClick={saveInfos} disabled={saving}>
                  {saving ? <span className="spinner" /> : '💾'} Enregistrer
                </button>
              </div>
            </div>
          )}

          {tab === 'ventes' && (
            loadingData ? <div className="loading-page" style={{ minHeight: 100 }}><div className="spinner" /></div> : (
              <>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 12 }}>
                  {ventes.length} ventes · CA : {fmt(ventes.reduce((s, v) => s + v.prix_ttc, 0))}
                  <span style={{ marginLeft: 16, color: 'var(--amber)' }}>⚠️ Supprimez les ventes avant de réimporter</span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th><th>Produit</th><th>Catégorie</th>
                        <th className="num">Qté</th><th className="num">TTC</th>
                        <th>Paiement</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {ventes.map(v => (
                        <tr key={v.id}>
                          <td className="text-muted text-sm">{new Date(v.date_vente).toLocaleDateString('fr-FR')}</td>
                          <td style={{ fontWeight: 500 }}>{v.description}</td>
                          <td><span className="badge badge-gray">{v.categorie}</span></td>
                          <td className="num">{v.quantite}</td>
                          <td className="num">{fmt(v.prix_ttc)}</td>
                          <td>{v.moyen_paiement}</td>
                          <td><button className="btn btn-danger btn-sm" onClick={() => deleteVente(v.id)}>🗑️</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {ventes.length > 0 && (
                  <button className="btn btn-danger mt-16" onClick={async () => {
                    if (confirm(`Supprimer toutes les ${ventes.length} ventes ?`)) {
                      await supabase.from('ventes').delete().eq('semaine_id', semaine.semaine_id)
                      loadVentes()
                    }
                  }}>
                    🗑️ Supprimer toutes les ventes ({ventes.length})
                  </button>
                )}
              </>
            )
          )}

          {tab === 'achats' && (
            loadingData ? <div className="loading-page" style={{ minHeight: 100 }}><div className="spinner" /></div> : (
              <>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 12 }}>
                  {achats.length} achats · Total : {fmt(achats.reduce((s, a) => s + a.total_ttc, 0))}
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Date</th><th>Fournisseur</th><th>Article</th><th className="num">TTC</th><th></th></tr>
                    </thead>
                    <tbody>
                      {achats.map(a => (
                        <tr key={a.id}>
                          <td>{a.date_achat}</td>
                          <td>{a.fournisseur}</td>
                          <td>{a.article}</td>
                          <td className="num">{fmt(a.total_ttc)}</td>
                          <td><button className="btn btn-danger btn-sm" onClick={() => deleteAchat(a.id)}>🗑️</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )
          )}
        </div>
      </div>
    </div>
  )
}
