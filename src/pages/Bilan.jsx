import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/sumup'
import { useSortable } from '../hooks/useSortable.jsx'
import SemaineSelector from '../components/SemaineSelector.jsx'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList
} from 'recharts'

const CATEGORIES = ['Boissons', 'Snacking', 'Boutique', 'Marche de Noel', 'Dons', 'Inconnu']
const CAT_ICONS = { Boissons: '🍺', Snacking: '🥐', Boutique: '👕', 'Marche de Noel': '🎄', Dons: '💝', Inconnu: '❓' }
const VIOLET = '#6B3FA0'

function formatSemaine(annee, numero) {
  return `${annee} S${String(numero).padStart(2, '0')}`
}

// ─── Modal réaffectation achat ────────────────────────────────────────────────
function ReaffectAchatModal({ achat, semaines, onSave, onClose }) {
  const [target, setTarget] = useState('')
  const [saving, setSaving] = useState(false)
  async function handleSave() {
    if (!target) return
    setSaving(true)
    await supabase.from('achats').update({ semaine_id: target }).eq('id', achat.id)
    setSaving(false)
    onSave()
  }
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'white', borderRadius:12, padding:28, width:420 }}>
        <div style={{ fontWeight:700, fontSize:16, marginBottom:8 }}>↗️ Réaffecter l'achat</div>
        <div style={{ fontSize:13, color:'var(--gray-400)', marginBottom:20 }}>
          <strong>{achat.article}</strong> — {fmt(achat.total_ttc)} · {achat.fournisseur}
        </div>
        <div className="form-group">
          <label className="form-label">Nouvelle semaine</label>
          <select className="form-select" value={target} onChange={e => setTarget(e.target.value)}>
            <option value="">— Choisir —</option>
            {semaines.map(s => (
              <option key={s.id} value={s.id}>
                {formatSemaine(s.annee, s.numero)} — {s.theme || s.date_debut}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-gap mt-16">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !target}>
            {saving ? <span className="spinner"/> : '↗️'} Réaffecter
          </button>
          <button className="btn" onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  )
}

export default function BilanPage() {
  const location = useLocation()
  const [semaineId, setSemaineId] = useState('')
  const [semaine, setSemaine] = useState(null)
  const [bilan, setBilan] = useState(null)
  const [loading, setLoading] = useState(false)
  const [produitsData, setProduitsData] = useState([])
  const [semaines, setSemaines] = useState([])
  const [reaffectModal, setReaffectModal] = useState(null)
  const { sorted: sortedProduits, Th: ThProd } = useSortable(produitsData, 'ca', 'desc')

  // Auto-select from navigation state (from Historique)
  useEffect(() => {
    if (location.state?.semaineId) setSemaineId(location.state.semaineId)
  }, [location.state])

  useEffect(() => { if (semaineId) loadBilan() }, [semaineId])

  useEffect(() => {
    supabase.from('semaines').select('*').order('annee', { ascending: false }).order('numero', { ascending: false })
      .then(({ data }) => setSemaines(data || []))
  }, [])

  async function loadBilan() {
    setLoading(true)
    const { data: sem } = await supabase.from('semaines').select('*').eq('id', semaineId).single()
    setSemaine(sem)

    const [{ data: ventes }, { data: achats }, { data: dons }] = await Promise.all([
      supabase.from('ventes').select('prix_ttc, moyen_paiement, categorie, description, quantite, type_transaction').eq('semaine_id', semaineId),
      supabase.from('achats').select('*, imputations(*)').eq('semaine_id', semaineId),
      supabase.from('dons').select('*').eq('semaine_id', semaineId).neq('statut', 'annule'),
    ])

    if (!ventes) { setLoading(false); return }

    const ventesOnly = ventes.filter(v => v.type_transaction === 'Vente')

    const catStats = {}
    CATEGORIES.forEach(c => { catStats[c] = { nb: 0, ca: 0, achat: 0 } })
    ventesOnly.forEach(v => {
      const c = v.categorie || 'Inconnu'
      if (!catStats[c]) catStats[c] = { nb: 0, ca: 0, achat: 0 }
      catStats[c].nb++
      catStats[c].ca += v.prix_ttc || 0
    })
    if (achats) {
      achats.forEach(a => a.imputations?.forEach(imp => {
        const cat = imp.categorie || 'Inconnu'
        if (!catStats[cat]) catStats[cat] = { nb: 0, ca: 0, achat: 0 }
        catStats[cat].achat += imp.cout_total_categorie || 0
      }))
    }

    const paiements = {}
    ventesOnly.forEach(v => {
      const p = v.moyen_paiement || 'Inconnu'
      if (!paiements[p]) paiements[p] = { nb: 0, montant: 0 }
      paiements[p].nb++
      paiements[p].montant += v.prix_ttc || 0
    })

    const cbTotal = Object.entries(paiements).filter(([p]) => p !== 'Espèces').reduce((s, [, d]) => s + d.montant, 0)
    const fraisSumup = -(cbTotal * 0.0175)
    const totalCA = ventesOnly.reduce((s, v) => s + (v.prix_ttc || 0), 0)
    const totalAchats = (achats || []).reduce((s, a) => s + (a.total_ttc || 0), 0)
    const totalDons = (dons || []).reduce((s, d) => s + (d.montant_calcule || 0), 0)
    const marge = totalCA - totalAchats - totalDons + fraisSumup
    const especes = paiements['Espèces']?.montant || 0

    const byProduit = {}
    ventesOnly.forEach(v => {
      const key = v.description || 'Inconnu'
      if (!byProduit[key]) byProduit[key] = { produit: key, cat: v.categorie, qte: 0, ca: 0, cout: 0 }
      byProduit[key].qte += v.quantite || 0
      byProduit[key].ca += v.prix_ttc || 0
    })
    if (achats) {
      achats.forEach(a => a.imputations?.forEach(imp => {
        if (byProduit[imp.produit_fini]) byProduit[imp.produit_fini].cout += imp.cout_total_categorie || 0
      }))
    }
    const produitsArr = Object.values(byProduit).map(p => ({
      ...p, marge: p.ca - p.cout, margePct: p.ca > 0 ? (p.ca - p.cout) / p.ca : 0,
    }))
    setProduitsData(produitsArr)

    setBilan({
      catStats, paiements, totalCA, totalAchats, totalDons, fraisSumup, marge,
      especes, achats: achats || [], dons: dons || [],
      caisseDiff: (sem?.caisse_fin || 0) - (sem?.caisse_debut || 0)
    })
    setLoading(false)
  }

  const catChartData = bilan ? Object.entries(bilan.catStats)
    .filter(([, d]) => d.ca > 0)
    .map(([cat, d]) => ({ name: cat, value: Math.round(d.ca) }))
    .sort((a, b) => b.value - a.value) : []

  const qteChartData = produitsData
    .filter(p => p.qte > 0).sort((a, b) => b.qte - a.qte).slice(0, 12)
    .map(p => ({ name: p.produit.length > 14 ? p.produit.slice(0, 14) + '…' : p.produit, value: Math.round(p.qte) }))

  if (loading) return <div className="loading-page"><div className="spinner"/><span>Calcul du bilan…</span></div>

  return (
    <div>
      {reaffectModal && (
        <ReaffectAchatModal
          achat={reaffectModal}
          semaines={semaines.filter(s => s.id !== semaineId)}
          onSave={() => { setReaffectModal(null); loadBilan() }}
          onClose={() => setReaffectModal(null)}
        />
      )}

      <style>{`@media print { .sidebar,.page-header,.no-print{display:none!important} .main-content{margin-left:0!important} .page-body{padding:0!important} .card{box-shadow:none!important;border:1px solid #ddd!important;page-break-inside:avoid} }`}</style>

      <div className="page-header no-print">
        <div>
          <p className="page-title">Bilan hebdomadaire</p>
          <p className="page-subtitle">{semaine ? formatSemaine(semaine.annee, semaine.numero) + (semaine.theme ? ' — ' + semaine.theme : '') : 'Sélectionnez une semaine'}</p>
        </div>
        <div className="flex-gap">
          <SemaineSelector value={semaineId} onChange={setSemaineId} />
          {bilan && <button className="btn btn-primary" onClick={() => window.print()}>🖨️ Imprimer / PDF</button>}
        </div>
      </div>

      <div className="page-body">
        {!semaineId && (
          <div className="empty-state"><div className="empty-state-icon">📋</div><p>Sélectionnez une semaine</p></div>
        )}

        {bilan && semaine && (
          <>
            {/* Header */}
            <div className="card mb-16" style={{ background:'var(--green)', color:'white' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:18, fontWeight:800 }}>{formatSemaine(semaine.annee, semaine.numero)} — {semaine.theme || 'Buvette'}</div>
                  <div style={{ opacity:.8, fontSize:13 }}>Du {semaine.date_debut} au {semaine.date_fin}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:28, fontWeight:800 }}>{fmt(bilan.totalCA)}</div>
                  <div style={{ opacity:.8, fontSize:12 }}>Chiffre d'affaires</div>
                </div>
              </div>
            </div>

            {/* KPIs */}
            <div className="metrics-grid">
              <div className="metric-card green"><div className="metric-label">CA total</div><div className="metric-value">{fmt(bilan.totalCA)}</div></div>
              <div className="metric-card red">
                <div className="metric-label">Achats + Frais + Dons</div>
                <div className="metric-value">{fmt(bilan.totalAchats + Math.abs(bilan.fraisSumup) + bilan.totalDons)}</div>
              </div>
              <div className="metric-card" style={{ borderLeft:'3px solid var(--green)' }}>
                <div className="metric-label">Marge nette</div>
                <div className="metric-value" style={{ color: bilan.marge >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(bilan.marge)}</div>
                <div className="metric-sub">{bilan.totalCA ? Math.round(bilan.marge / bilan.totalCA * 100) : 0}% du CA</div>
              </div>
              <div className="metric-card amber"><div className="metric-label">Frais SumUp (1.75%)</div><div className="metric-value">{fmt(bilan.fraisSumup)}</div></div>
              {bilan.totalDons > 0 && (
                <div className="metric-card" style={{ borderLeft:'3px solid var(--green)' }}>
                  <div className="metric-label">Dons reversés</div>
                  <div className="metric-value" style={{ color:'var(--green)' }}>{fmt(bilan.totalDons)}</div>
                  <div className="metric-sub">{bilan.dons.length} association(s)</div>
                </div>
              )}
            </div>

            {/* Graphiques */}
            <div className="card mb-16">
              <div className="card-title">Répartition du chiffre d'affaires — {fmt(bilan.totalCA)}</div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={catChartData} margin={{ top:24, right:20, bottom:8, left:20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0e8f8" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize:12 }} />
                  <YAxis tick={{ fontSize:11 }} tickFormatter={v => `${v} €`} />
                  <Tooltip formatter={v => fmt(v)} />
                  <Bar dataKey="value" radius={[4,4,0,0]} fill={VIOLET}>
                    <LabelList dataKey="value" position="top" formatter={v => `${v} €`} style={{ fill:VIOLET, fontWeight:700, fontSize:12 }} />
                    {catChartData.map((_, i) => <Cell key={i} fill={VIOLET} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card mb-16">
              <div className="card-title">Quantités vendues par produit (top 12)</div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={qteChartData} margin={{ top:24, right:20, bottom:40, left:20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0e8f8" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize:10 }} angle={-30} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize:11 }} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[4,4,0,0]} fill={VIOLET}>
                    <LabelList dataKey="value" position="top" style={{ fill:VIOLET, fontWeight:700, fontSize:11 }} />
                    {qteChartData.map((_, i) => <Cell key={i} fill={VIOLET} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid-2">
              <div className="card">
                <div className="card-title">Par catégorie</div>
                <table>
                  <thead><tr><th>Catégorie</th><th className="num">Nb</th><th className="num">CA</th><th className="num">Achats</th><th className="num">Marge</th></tr></thead>
                  <tbody>
                    {Object.entries(bilan.catStats).filter(([,d]) => d.ca > 0 || d.achat !== 0).map(([cat, d]) => (
                      <tr key={cat}>
                        <td>{CAT_ICONS[cat]||'•'} {cat}</td>
                        <td className="num">{d.nb}</td>
                        <td className="num">{fmt(d.ca)}</td>
                        <td className="num negative">{d.achat ? fmt(-d.achat) : '—'}</td>
                        <td className={'num '+(d.ca-d.achat>=0?'positive':'negative')}>{fmt(d.ca-d.achat)}</td>
                      </tr>
                    ))}
                    <tr className="tr-total">
                      <td>Total</td>
                      <td className="num">{Object.values(bilan.catStats).reduce((s,d)=>s+d.nb,0)}</td>
                      <td className="num">{fmt(bilan.totalCA)}</td>
                      <td className="num negative">{fmt(-bilan.totalAchats)}</td>
                      <td className={'num '+(bilan.marge>=0?'positive':'negative')}>{fmt(bilan.marge)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div>
                <div className="card mb-16">
                  <div className="card-title">Moyens de paiement</div>
                  <table>
                    <thead><tr><th>Mode</th><th className="num">Nb</th><th className="num">Montant</th></tr></thead>
                    <tbody>
                      {Object.entries(bilan.paiements).sort((a,b)=>b[1].montant-a[1].montant).map(([p,d])=>(
                        <tr key={p}><td>{p==='Espèces'?'💵':'💳'} {p}</td><td className="num">{d.nb}</td><td className="num">{fmt(d.montant)}</td></tr>
                      ))}
                      <tr className="tr-total"><td>Total</td><td className="num">{Object.values(bilan.paiements).reduce((s,d)=>s+d.nb,0)}</td><td className="num">{fmt(bilan.totalCA)}</td></tr>
                    </tbody>
                  </table>
                </div>
                <div className="card">
                  <div className="card-title">Récap espèces</div>
                  <table>
                    <tbody>
                      <tr><td>Caisse début</td><td className="num">{fmt(semaine.caisse_debut)}</td></tr>
                      <tr><td>Caisse fin</td><td className="num">{fmt(semaine.caisse_fin)}</td></tr>
                      <tr><td>Recettes espèces</td><td className="num positive">{fmt(bilan.especes)}</td></tr>
                      <tr className="tr-total"><td>Écart caisse</td><td className="num">{fmt(bilan.caisseDiff - bilan.especes)}</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Dons */}
            {bilan.dons.length > 0 && (
              <div className="card mt-16">
                <div className="card-title">💝 Dons & Actions caritatives</div>
                <table>
                  <thead><tr><th>Association</th><th>Description</th><th className="num">Don calculé</th><th>Statut</th></tr></thead>
                  <tbody>
                    {bilan.dons.map(d => (
                      <tr key={d.id}>
                        <td style={{ fontWeight:500 }}>{d.association}</td>
                        <td className="text-muted">{d.description || '—'}</td>
                        <td className="num positive">{fmt(d.montant_calcule)}</td>
                        <td><span className={`badge ${d.statut==='verse'?'badge-green':'badge-amber'}`}>{d.statut==='verse'?'✅ Versé':'📊 Calculé'}</span></td>
                      </tr>
                    ))}
                    <tr className="tr-total"><td colSpan={2}>Total dons (en charge)</td><td className="num negative">{fmt(-bilan.totalDons)}</td><td></td></tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Achats avec réaffectation */}
            <div className="card mt-16">
              <div className="card-title">Détail des achats</div>
              {bilan.achats.length === 0 ? <p className="text-muted text-sm">Aucun achat saisi</p> : (
                <table>
                  <thead>
                    <tr><th>Date</th><th>Fournisseur</th><th>N° Facture</th><th>Article</th><th className="num">TTC</th><th>Imputations</th><th></th></tr>
                  </thead>
                  <tbody>
                    {bilan.achats.map(a => (
                      <tr key={a.id}>
                        <td>{a.date_achat}</td>
                        <td>{a.fournisseur}</td>
                        <td className="text-muted">{a.num_facture || '—'}</td>
                        <td>{a.article}</td>
                        <td className="num negative">{fmt(-a.total_ttc)}</td>
                        <td style={{ fontSize:11 }}>{a.imputations?.map((imp,i)=><span key={i}>{imp.produit_fini} ({fmt(imp.cout_total_categorie)}){i<a.imputations.length-1?', ':''}</span>)}</td>
                        <td>
                          <button className="btn btn-sm" title="Réaffecter à une autre semaine" onClick={() => setReaffectModal(a)}>↗️</button>
                        </td>
                      </tr>
                    ))}
                    <tr className="tr-total"><td colSpan={4}>Total achats</td><td className="num negative">{fmt(-bilan.totalAchats)}</td><td colSpan={2}></td></tr>
                  </tbody>
                </table>
              )}
            </div>

            {/* Produits triables */}
            <div className="card mt-16">
              <div className="card-title">Détail par produit <span style={{ fontWeight:400, fontSize:11, marginLeft:8, color:'var(--gray-400)' }}>Cliquez sur les en-têtes pour trier</span></div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <ThProd col="produit">Produit</ThProd>
                      <ThProd col="cat">Catégorie</ThProd>
                      <ThProd col="qte" className="num">Qté</ThProd>
                      <ThProd col="ca" className="num">CA</ThProd>
                      <ThProd col="cout" className="num">Coût</ThProd>
                      <ThProd col="marge" className="num">Marge</ThProd>
                      <ThProd col="margePct" className="num">Marge %</ThProd>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProduits.map(p => (
                      <tr key={p.produit}>
                        <td>{p.produit}</td>
                        <td><span className="badge badge-gray">{p.cat}</span></td>
                        <td className="num">{Math.round(p.qte)}</td>
                        <td className="num">{fmt(p.ca)}</td>
                        <td className="num">{p.cout?<span className="negative">{fmt(-p.cout)}</span>:'—'}</td>
                        <td className={'num '+(p.marge>=0?'positive':'negative')}>{fmt(p.marge)}</td>
                        <td className={'num '+(p.margePct>=0?'positive':'negative')}>{Math.round(p.margePct*100)}%</td>
                      </tr>
                    ))}
                    <tr className="tr-total">
                      <td colSpan={3}>Total</td>
                      <td className="num">{fmt(bilan.totalCA)}</td>
                      <td className="num negative">{fmt(-bilan.totalAchats)}</td>
                      <td className={'num '+(bilan.marge>=0?'positive':'negative')}>{fmt(bilan.marge)}</td>
                      <td className="num">{bilan.totalCA?`${Math.round(bilan.marge/bilan.totalCA*100)}%`:'—'}</td>
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
