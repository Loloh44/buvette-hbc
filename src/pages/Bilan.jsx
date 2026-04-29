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
  const [genFraisModal, setGenFraisModal] = useState(null)
  const [genEcartModal, setGenEcartModal] = useState(null)
  const { sorted: sortedProduits, Th: ThProd } = useSortable(produitsData, 'ca', 'desc')
  const achatsForSort = bilan?.achats || []
  const { sorted: sortedAchats, Th: ThAchat } = useSortable(achatsForSort, 'date_achat', 'asc')

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

    const [{ data: ventes }, { data: achats }, { data: dons }, { data: mvtsStock }] = await Promise.all([
      supabase.from('ventes').select('prix_ttc, moyen_paiement, categorie, description, quantite, type_transaction').eq('semaine_id', semaineId).limit(10000),
      supabase.from('achats').select('*, imputations(*)').eq('semaine_id', semaineId),
      supabase.from('dons').select('*').eq('semaine_id', semaineId).neq('statut', 'annule'),
      supabase.from('mouvements_stock').select('*, articles_stock(nom, unite_stock)').eq('semaine_id', semaineId),
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
    // Charges catégories = achats directs imputés + sorties stock validées
    if (achats) {
      achats.filter(a => !a.article_stock_id && a.fournisseur !== 'Stock').forEach(a =>
        a.imputations?.forEach(imp => {
          const cat = imp.categorie || 'Inconnu'
          if (!catStats[cat]) catStats[cat] = { nb: 0, ca: 0, achat: 0 }
          catStats[cat].achat += imp.cout_total_categorie || 0
        })
      )
    }
    // Ajouter les sorties stock validées dans la catégorie Boissons
    if (mvtsStock) {
      const sortiesVal = mvtsStock.filter(m => m.type_mouvement === 'sortie' && m.envoye_bilan)
      sortiesVal.forEach(m => {
        if (!catStats['Boissons']) catStats['Boissons'] = { nb: 0, ca: 0, achat: 0 }
        catStats['Boissons'].achat += m.cout_total || 0
      })
    }

    const paiements = {}
    ventesOnly.forEach(v => {
      const p = v.moyen_paiement || 'Inconnu'
      if (!paiements[p]) paiements[p] = { nb: 0, montant: 0 }
      paiements[p].nb++
      paiements[p].montant += v.prix_ttc || 0
    })

    const totalCA = ventesOnly.reduce((s, v) => s + (v.prix_ttc || 0), 0)
    // Achats directs = ceux NON liés au stock ET non générés par une sortie stock
    // On exclut aussi fournisseur='Stock' car ce sont les lignes créées par les sorties stock (déjà comptées)
    const achatsDirects = (achats || []).filter(a => !a.article_stock_id && a.fournisseur !== 'Stock')
    const totalAchats = achatsDirects.reduce((s, a) => s + (a.total_ttc || 0), 0)
    // Sorties stock validées (envoyées au bilan) — seule source de vérité pour les coûts stock
    const sortiesStock = (mvtsStock || []).filter(m => m.type_mouvement === 'sortie' && m.envoye_bilan)
    const totalSortiesStock = sortiesStock.reduce((s, m) => s + (m.cout_total || 0), 0)
    const totalDons = (dons || []).reduce((s, d) => s + (d.montant_calcule || 0), 0)
    const marge = totalCA - totalAchats - totalSortiesStock - totalDons
    const especes = paiements['Espèces']?.montant || 0

    const byProduit = {}
    ventesOnly.forEach(v => {
      const key = v.description || 'Inconnu'
      if (!byProduit[key]) byProduit[key] = { produit: key, cat: v.categorie, qte: 0, ca: 0, cout: 0 }
      byProduit[key].qte += v.quantite || 0
      byProduit[key].ca += v.prix_ttc || 0
    })
    // Coûts depuis imputations des achats directs
    if (achats) {
      achats.filter(a => !a.article_stock_id && a.fournisseur !== 'Stock').forEach(a =>
        a.imputations?.forEach(imp => {
          if (byProduit[imp.produit_fini]) byProduit[imp.produit_fini].cout += imp.cout_total_categorie || 0
        })
      )
    }
    // Coûts depuis sorties stock validées — répartis proportionnellement aux litres/unités consommés par produit
    if (mvtsStock) {
      const sortiesValidees = mvtsStock.filter(m => m.type_mouvement === 'sortie' && m.envoye_bilan)
      for (const sortie of sortiesValidees) {
        // Charger les associations de cet article stock
        const { data: assocs } = await supabase
          .from('stock_associations')
          .select('produit_vendu, consommation_par_vente, unite')
          .eq('article_stock_id', sortie.article_stock_id)
        if (!assocs?.length) continue

        // Calculer les litres/unités consommés par produit vendu
        let totalConso = 0
        const consoParProduit = {}
        assocs.forEach(assoc => {
          const prod = byProduit[assoc.produit_vendu]
          if (!prod) return
          const conso = prod.qte * assoc.consommation_par_vente
          consoParProduit[assoc.produit_vendu] = conso
          totalConso += conso
        })

        // Répartir le coût de la sortie proportionnellement
        if (totalConso > 0) {
          Object.entries(consoParProduit).forEach(([produit, conso]) => {
            if (byProduit[produit]) {
              byProduit[produit].cout += Math.round((conso / totalConso) * (sortie.cout_total || 0) * 100) / 100
            }
          })
        }
      }
    }
    const produitsArr = Object.values(byProduit).map(p => ({
      ...p, marge: p.ca - p.cout, margePct: p.ca > 0 ? (p.ca - p.cout) / p.ca : 0,
    }))
    setProduitsData(produitsArr)

    setBilan({
      catStats, paiements, totalCA, totalAchats, totalSortiesStock, totalDons, marge,
      especes, achats: achatsDirects, achatsStock: (achats||[]).filter(a=>a.article_stock_id), dons: dons || [], mvtsStock: mvtsStock || [],
      caisseDiff: (sem?.caisse_fin || 0) - (sem?.caisse_debut || 0)
    })
    setLoading(false)
  }


  // ── Génération frais SumUp ─────────────────────────────────────────────────
  async function genererFraisSumup() {
    if (!bilan || !semaine) return
    const [
      { data: params },
      { data: paramLib },
      { data: payModes }
    ] = await Promise.all([
      supabase.from('parametres').select('*').eq('cle', 'taux_sumup').single(),
      supabase.from('parametres').select('*').eq('cle', 'frais_sumup_libelle').single(),
      supabase.from('moyens_paiement').select('nom, est_carte').eq('actif', true),
    ])
    const taux = parseFloat(params?.valeur || '1.75') / 100
    const libelle = paramLib?.valeur || 'Frais SumUp'

    // Construire un Set des moyens de paiement soumis aux frais (est_carte = true)
    const carteModes = new Set(
      (payModes || []).filter(p => p.est_carte).map(p => p.nom)
    )

    // Si la table est vide, fallback sur "pas espèces/virement/chèque"
    const cbTotal = Object.entries(bilan.paiements)
      .filter(([p]) => carteModes.size > 0 ? carteModes.has(p) : !['Espèces','Virement','Chèque'].includes(p))
      .reduce((s, [, d]) => s + d.montant, 0)

    const montant = Math.round(cbTotal * taux * 100) / 100
    setGenFraisModal({ libelle, taux: (taux * 100).toFixed(2), cbTotal, montant })
  }

  async function confirmerFraisSumup(modal) {
    // Chercher si une ligne frais SumUp existe déjà pour cette semaine
    const { data: existing } = await supabase
      .from('achats')
      .select('id')
      .eq('semaine_id', semaineId)
      .eq('fournisseur', 'SumUp')
      .single()

    if (existing?.id) {
      // Mettre à jour la ligne existante
      await supabase.from('achats').update({
        article: modal.libelle,
        total_ht: modal.montant,
        total_ttc: modal.montant,
        date_achat: semaine.date_fin,
      }).eq('id', existing.id)
    } else {
      // Créer une nouvelle ligne
      await supabase.from('achats').insert({
        semaine_id: semaineId,
        fournisseur: 'SumUp',
        date_achat: semaine.date_fin,
        article: modal.libelle,
        total_ht: modal.montant,
        taux_tva: 0,
        total_ttc: modal.montant,
      })
    }
    setGenFraisModal(null)
    loadBilan()
  }

  // ── Génération écart de caisse ──────────────────────────────────────────────
  async function genererEcartCaisse() {
    if (!bilan || !semaine) return
    const { data: paramLib } = await supabase.from('parametres').select('*').eq('cle', 'ecart_caisse_libelle').single()
    const libelle = paramLib?.valeur || 'Écart de caisse (cash on the way)'
    const caisseDeb = semaine.caisse_debut || 0
    const caisseFin = semaine.caisse_fin || 0
    const recettesEspeces = bilan.especes || 0
    const ecart = Math.round(((caisseFin - caisseDeb) - recettesEspeces) * 100) / 100
    setGenEcartModal({ libelle, caisseDeb, caisseFin, recettesEspeces, ecart })
  }

  async function confirmerEcartCaisse(modal) {
    if (modal.ecart === 0) { setGenEcartModal(null); return }

    // Chercher si une ligne écart de caisse existe déjà
    const { data: existing } = await supabase
      .from('ventes')
      .select('id')
      .eq('semaine_id', semaineId)
      .eq('description', modal.libelle)
      .single()

    const payload = {
      date_vente: new Date(semaine.date_fin + 'T23:59:00').toISOString(),
      description: modal.libelle,
      categorie: 'Inconnu',
      quantite: 1,
      prix_ttc: Math.abs(modal.ecart),
      moyen_paiement: 'Espèces',
      compte: 'HBC La Fillière',
      type_transaction: modal.ecart > 0 ? 'Vente' : 'Refund',
      annee: new Date(semaine.date_fin).getFullYear(),
      mois: new Date(semaine.date_fin).getMonth() + 1,
      semaine_numero: null,
      ref_transaction: null,
    }

    if (existing?.id) {
      await supabase.from('ventes').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('ventes').insert({ semaine_id: semaineId, ...payload })
    }
    setGenEcartModal(null)
    loadBilan()
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
      {/* Modal Frais SumUp */}
      {genFraisModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'white', borderRadius:12, padding:28, width:460 }}>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:8 }}>💳 Générer les frais SumUp</div>
            <div style={{ background:'var(--gray-50)', borderRadius:8, padding:12, marginBottom:16, fontSize:13 }}>
              <div style={{ marginBottom:6 }}>CA carte bancaire : <strong>{fmt(genFraisModal.cbTotal)}</strong></div>
              <div style={{ marginBottom:6 }}>Taux SumUp : <strong>{genFraisModal.taux}%</strong></div>
              <div style={{ color:'var(--red)', fontWeight:700 }}>Frais calculés : <strong>{fmt(genFraisModal.montant)}</strong></div>
            </div>
            <div className="form-group" style={{ marginBottom:16 }}>
              <label className="form-label">Libellé (modifiable)</label>
              <input className="form-input" value={genFraisModal.libelle}
                onChange={e => setGenFraisModal(m => ({...m, libelle: e.target.value}))} />
            </div>
            <div className="form-group" style={{ marginBottom:16 }}>
              <label className="form-label">Montant (€) (modifiable)</label>
              <input className="form-input" type="number" step="0.01" value={genFraisModal.montant}
                onChange={e => setGenFraisModal(m => ({...m, montant: parseFloat(e.target.value)||0}))} />
            </div>
            <div className="flex-gap">
              <button className="btn btn-primary" onClick={() => confirmerFraisSumup(genFraisModal)}>
                💾 Créer la ligne d'achat
              </button>
              <button className="btn" onClick={() => setGenFraisModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Écart de caisse */}
      {genEcartModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'white', borderRadius:12, padding:28, width:460 }}>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:8 }}>💵 Générer l'écart de caisse</div>
            <div style={{ background:'var(--gray-50)', borderRadius:8, padding:12, marginBottom:16, fontSize:13 }}>
              <div style={{ marginBottom:4 }}>Caisse début : <strong>{fmt(genEcartModal.caisseDeb)}</strong></div>
              <div style={{ marginBottom:4 }}>Caisse fin : <strong>{fmt(genEcartModal.caisseFin)}</strong></div>
              <div style={{ marginBottom:4 }}>Recettes espèces enregistrées : <strong>{fmt(genEcartModal.recettesEspeces)}</strong></div>
              <div style={{ marginTop:8, borderTop:'1px solid var(--gray-200)', paddingTop:8 }}>
                Calcul : ({fmt(genEcartModal.caisseFin)} - {fmt(genEcartModal.caisseDeb)}) - {fmt(genEcartModal.recettesEspeces)}
              </div>
              <div style={{ color: genEcartModal.ecart >= 0 ? 'var(--green)' : 'var(--red)', fontWeight:700, fontSize:15, marginTop:4 }}>
                Écart : <strong>{fmt(genEcartModal.ecart)}</strong>
                {genEcartModal.ecart > 0 ? ' → recette (cash on the way)' : ' → déficit de caisse'}
              </div>
            </div>
            {genEcartModal.ecart === 0 ? (
              <div className="alert alert-success">✅ Pas d'écart — caisse équilibrée !</div>
            ) : (
              <>
                <div className="form-group" style={{ marginBottom:12 }}>
                  <label className="form-label">Libellé (modifiable)</label>
                  <input className="form-input" value={genEcartModal.libelle}
                    onChange={e => setGenEcartModal(m => ({...m, libelle: e.target.value}))} />
                </div>
                <div className="form-group" style={{ marginBottom:16 }}>
                  <label className="form-label">Montant (€) (modifiable)</label>
                  <input className="form-input" type="number" step="0.01" value={genEcartModal.ecart}
                    onChange={e => setGenEcartModal(m => ({...m, ecart: parseFloat(e.target.value)||0}))} />
                </div>
              </>
            )}
            <div className="flex-gap">
              {genEcartModal.ecart !== 0 && (
                <button className="btn btn-primary" onClick={() => confirmerEcartCaisse(genEcartModal)}>
                  💾 Créer la ligne de vente
                </button>
              )}
              <button className="btn" onClick={() => setGenEcartModal(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

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
                <div className="metric-label">Charges totales</div>
                <div className="metric-value">{fmt(bilan.totalAchats + bilan.totalSortiesStock + bilan.totalDons)}</div>
              </div>
              <div className="metric-card" style={{ borderLeft:'3px solid var(--green)' }}>
                <div className="metric-label">Marge nette</div>
                <div className="metric-value" style={{ color: bilan.marge >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(bilan.marge)}</div>
                <div className="metric-sub">{bilan.totalCA ? Math.round(bilan.marge / bilan.totalCA * 100) : 0}% du CA</div>
              </div>

              {bilan.totalDons > 0 && (
                <div className="metric-card" style={{ borderLeft:'3px solid var(--green)' }}>
                  <div className="metric-label">Dons reversés</div>
                  <div className="metric-value" style={{ color:'var(--green)' }}>{fmt(bilan.totalDons)}</div>
                  <div className="metric-sub">{bilan.dons.length} association(s)</div>
                </div>
              )}
            </div>

            {/* Boutons de génération */}
            <div className="flex-gap mb-16 no-print">
              <button className="btn" onClick={genererFraisSumup}>
                💳 Générer frais SumUp
              </button>
              <button className="btn" onClick={genererEcartCaisse}>
                💵 Générer écart de caisse
              </button>
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
                        <tr key={p}>
                          <td>
                            {['Espèces','Virement','Chèque'].includes(p) ? '💵' : '💳'} {p}
                          </td>
                          <td className="num">{d.nb}</td>
                          <td className="num">{fmt(d.montant)}</td>
                        </tr>
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

            {/* Section Stock */}
            {bilan.mvtsStock?.length > 0 && (
              <div className="card mt-16">
                <div className="card-title">📦 Mouvements de stock</div>
                <table>
                  <thead>
                    <tr>
                      <th>Article</th>
                      <th className="num">Entrées</th>
                      <th className="num">Sorties</th>
                      <th className="num">Valeur consommée</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Grouper par article
                      const byArticle = {}
                      bilan.mvtsStock.forEach(m => {
                        const key = m.article_stock_id
                        if (!byArticle[key]) byArticle[key] = { nom: m.articles_stock?.nom, unite: m.articles_stock?.unite_stock, entrees: 0, sorties: 0, coutEntrees: 0, coutSorties: 0, envoye: false }
                        if (m.type_mouvement === 'entree') { byArticle[key].entrees += m.quantite; byArticle[key].coutEntrees += m.cout_total || 0 }
                        if (m.type_mouvement === 'sortie') { byArticle[key].sorties += m.quantite; byArticle[key].coutSorties += m.cout_total || 0; byArticle[key].envoye = m.envoye_bilan }
                      })
                      return Object.values(byArticle).map((a, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight:500 }}>{a.nom}</td>
                          <td className="num positive">{a.entrees > 0 ? `+${a.entrees} ${a.unite}` : '—'}</td>
                          <td className="num negative">{a.sorties > 0 ? `-${Math.round(a.sorties*100)/100} ${a.unite}` : '—'}</td>
                          <td className="num" style={{ fontWeight:600, color: a.coutSorties > 0 ? 'var(--red)' : 'var(--gray-300)' }}>
                            {a.coutSorties > 0 ? fmt(-a.coutSorties) : '—'}
                          </td>
                          <td>
                            {a.sorties > 0
                              ? a.envoye
                                ? <span className="badge badge-green">✅ Au bilan</span>
                                : <span className="badge badge-amber">⏳ En attente</span>
                              : '—'}
                          </td>
                        </tr>
                      ))
                    })()}
                    {bilan.totalSortiesStock > 0 && (
                      <tr className="tr-total">
                        <td colSpan={3}>Total sorties valorisées</td>
                        <td className="num negative">{fmt(-bilan.totalSortiesStock)}</td>
                        <td></td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {bilan.mvtsStock.some(m => m.type_mouvement === 'sortie' && !m.envoye_bilan) && (
                  <div className="alert alert-warning mt-8">
                    ⚠️ Des sorties de stock ne sont pas encore envoyées au bilan — allez dans <strong>📦 Stock</strong> pour les valider.
                  </div>
                )}
                {bilan.achatsStock?.length > 0 && (
                  <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid var(--gray-100)' }}>
                    <div style={{ fontSize:12, fontWeight:600, color:'var(--gray-400)', marginBottom:6 }}>Factures en stock (non imputées directement)</div>
                    {bilan.achatsStock.map(a => (
                      <div key={a.id} style={{ fontSize:12, color:'var(--gray-500)', marginBottom:2 }}>
                        📄 {a.fournisseur} — {a.article} — {fmt(a.total_ttc)} → en stock
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Achats avec réaffectation */}
            <div className="card mt-16">
              <div className="card-title">Détail des achats directs</div>
              {(!bilan.achats || bilan.achats.length === 0) ? <p className="text-muted text-sm">Aucun achat direct saisi</p> : (
                <table>
                  <thead>
                    <tr><ThAchat col="date_achat">Date</ThAchat><ThAchat col="fournisseur">Fournisseur</ThAchat><ThAchat col="num_facture">N° Facture</ThAchat><ThAchat col="article">Article</ThAchat><ThAchat col="total_ttc" className="num">TTC</ThAchat><th>Imputations</th><th className="no-print"></th></tr>
                  </thead>
                  <tbody>
                    {sortedAchats.map(a => (
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
