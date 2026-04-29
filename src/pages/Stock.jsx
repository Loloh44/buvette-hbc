import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/sumup'
import SemaineSelector from '../components/SemaineSelector.jsx'

// ─── Calcul FIFO ──────────────────────────────────────────────────────────────
function calculerFIFO(lots, qteSortie) {
  let reste = qteSortie
  let coutTotal = 0
  const detail = []
  for (const lot of lots) {
    if (reste <= 0.0001) break
    const pris = Math.min(reste, lot.quantite_restante)
    coutTotal += pris * lot.cout_unitaire
    detail.push({ pris, cout_unitaire: lot.cout_unitaire })
    reste -= pris
  }
  return {
    coutTotal: Math.round(coutTotal * 100) / 100,
    detail,
    manquant: Math.max(0, Math.round(reste * 1000) / 1000)
  }
}

// ─── Calcul PUMP ──────────────────────────────────────────────────────────────
function calculerPUMP(mouvements) {
  let qteTotal = 0, valeurTotal = 0
  for (const m of mouvements) {
    if (m.type_mouvement === 'entree') {
      valeurTotal += (m.cout_unitaire || 0) * m.quantite
      qteTotal += m.quantite
    } else if (m.type_mouvement === 'sortie') {
      const pump = qteTotal > 0 ? valeurTotal / qteTotal : 0
      valeurTotal -= pump * m.quantite
      qteTotal -= m.quantite
    }
  }
  const pump = qteTotal > 0 ? valeurTotal / qteTotal : 0
  return {
    qteStock: Math.round(qteTotal * 1000) / 1000,
    valeurStock: Math.round(valeurTotal * 100) / 100,
    pump: Math.round(pump * 10000) / 10000
  }
}

// ─── Modal Entrée Stock ───────────────────────────────────────────────────────
function EntreeModal({ article, semaines, onSave, onClose }) {
  const [form, setForm] = useState({
    quantite: '', cout_unitaire: '',
    date_mouvement: new Date().toISOString().slice(0, 10),
    semaine_id: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const coutTotal = (parseFloat(form.quantite) || 0) * (parseFloat(form.cout_unitaire) || 0)

  async function handleSave() {
    if (!form.quantite || !form.cout_unitaire) return
    setSaving(true)
    await supabase.from('mouvements_stock').insert({
      article_stock_id: article.id,
      semaine_id: form.semaine_id || null,
      type_mouvement: 'entree',
      quantite: parseFloat(form.quantite),
      cout_unitaire: parseFloat(form.cout_unitaire),
      cout_total: Math.round(coutTotal * 100) / 100,
      date_mouvement: form.date_mouvement,
      notes: form.notes || null,
    })
    setSaving(false)
    onSave()
  }

  const isPUMP = article.methode_valorisation === 'pump'

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'white', borderRadius:12, padding:28, width:460 }}>
        <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>📦 Entrée en stock</div>
        <div style={{ fontSize:13, color:'var(--gray-400)', marginBottom:4 }}>{article.nom}</div>
        <div style={{ marginBottom:20 }}>
          <span className={`badge ${isPUMP ? 'badge-amber' : 'badge-blue'}`}>
            {isPUMP ? '⚖️ PUMP' : '📋 FIFO'}
          </span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
          <div className="form-group">
            <label className="form-label">Quantité ({article.unite_stock}) *</label>
            <input className="form-input" type="number" step="0.5" min="0"
              value={form.quantite} onChange={e => setForm(f=>({...f,quantite:e.target.value}))} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">
              {isPUMP ? 'Prix unitaire (€) — recalcule le PUMP' : 'Prix unitaire (€) *'}
            </label>
            <input className="form-input" type="number" step="0.01" min="0"
              value={form.cout_unitaire} onChange={e => setForm(f=>({...f,cout_unitaire:e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Date réception</label>
            <input className="form-input" type="date" value={form.date_mouvement}
              onChange={e => setForm(f=>({...f,date_mouvement:e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Semaine</label>
            <select className="form-select" value={form.semaine_id} onChange={e => setForm(f=>({...f,semaine_id:e.target.value}))}>
              <option value="">— Aucune —</option>
              {semaines.map(s => <option key={s.id} value={s.id}>{s.annee} S{s.numero}{s.theme ? ` — ${s.theme}` : ''}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group" style={{ marginBottom:16 }}>
          <label className="form-label">Notes (facture, fournisseur...)</label>
          <input className="form-input" value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))}
            placeholder="Ex: Facture Promocash 175910" />
        </div>
        {coutTotal > 0 && (
          <div style={{ background:'var(--green-light)', borderRadius:8, padding:12, marginBottom:16, fontSize:13 }}>
            <strong style={{ color:'var(--green)' }}>
              {parseFloat(form.quantite)} {article.unite_stock} × {fmt(parseFloat(form.cout_unitaire))} = {fmt(coutTotal)}
            </strong>
          </div>
        )}
        <div className="flex-gap">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.quantite || !form.cout_unitaire}>
            {saving ? <span className="spinner"/> : '📦'} Enregistrer l'entrée
          </button>
          <button className="btn" onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Valider sortie → Bilan ─────────────────────────────────────────────
function ValidBilanModal({ sortie, article, semaine, onSave, onClose }) {
  const [form, setForm] = useState({
    libelle: `Stock ${article.nom} — S${semaine?.numero || ''} ${semaine?.annee || ''}`,
    montant: sortie.cout_total || 0,
    produit_fini: '',
  })
  const [produits, setProduits] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('produits').select('nom, categorie').eq('actif', true).order('categorie').order('nom')
      .then(({ data }) => setProduits(data || []))
  }, [])

  async function handleSave() {
    setSaving(true)
    // Créer ligne d'achat
    const { data: achat } = await supabase.from('achats').insert({
      semaine_id: semaine.id,
      fournisseur: 'Stock',
      date_achat: semaine.date_fin,
      article: form.libelle,
      total_ht: Math.round(form.montant / 1.055 * 100) / 100,
      taux_tva: 0.055,
      total_ttc: form.montant,
    }).select().single()

    // Imputation si produit sélectionné
    if (achat && form.produit_fini) {
      const cat = produits.find(p => p.nom === form.produit_fini)?.categorie
      await supabase.from('imputations').insert({
        achat_id: achat.id,
        produit_fini: form.produit_fini,
        categorie: cat || null,
        cout_total_categorie: form.montant,
      })
    }

    // Marquer la sortie comme envoyée au bilan
    await supabase.from('mouvements_stock').update({
      envoye_bilan: true,
      achat_genere_id: achat?.id || null,
    }).eq('id', sortie.id)

    setSaving(false)
    onSave()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'white', borderRadius:12, padding:28, width:480 }}>
        <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>📋 Envoyer au bilan</div>
        <div style={{ fontSize:13, color:'var(--gray-400)', marginBottom:20 }}>
          Crée une ligne d'achat dans le bilan de la semaine
        </div>

        <div style={{ background:'var(--gray-50)', borderRadius:8, padding:12, marginBottom:16, fontSize:13 }}>
          <div>Article : <strong>{article.nom}</strong></div>
          <div>Quantité : <strong>{sortie.quantite} {article.unite_stock}</strong></div>
          <div>Méthode : <strong>{article.methode_valorisation?.toUpperCase()}</strong></div>
          <div style={{ color:'var(--red)', fontWeight:700, marginTop:4 }}>Coût calculé : {fmt(sortie.cout_total)}</div>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:16 }}>
          <div className="form-group">
            <label className="form-label">Libellé dans le bilan</label>
            <input className="form-input" value={form.libelle} onChange={e => setForm(f=>({...f,libelle:e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Montant (€) — modifiable</label>
            <input className="form-input" type="number" step="0.01" value={form.montant}
              onChange={e => setForm(f=>({...f,montant:parseFloat(e.target.value)||0}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Imputer à un produit fini (optionnel)</label>
            <select className="form-select" value={form.produit_fini} onChange={e => setForm(f=>({...f,produit_fini:e.target.value}))}>
              <option value="">— Sans imputation —</option>
              {produits.map(p => <option key={p.nom} value={p.nom}>{p.categorie} — {p.nom}</option>)}
            </select>
          </div>
        </div>

        <div className="flex-gap">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner"/> : '📋'} Créer la ligne d'achat
          </button>
          <button className="btn" onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  )
}

// ─── Page principale Stock ────────────────────────────────────────────────────
export default function StockPage() {
  const [articles, setArticles] = useState([])
  const [mouvements, setMouvements] = useState([])
  const [associations, setAssociations] = useState([])
  const [semaines, setSemaines] = useState([])
  const [semaineId, setSemaineId] = useState('')
  const [semaine, setSemaine] = useState(null)
  const [loading, setLoading] = useState(true)
  const [calcLoading, setCalcLoading] = useState(false)
  const [tab, setTab] = useState('stock')
  const [entreeModal, setEntreeModal] = useState(null)
  const [validBilanModal, setValidBilanModal] = useState(null)
  const [alert, setAlert] = useState(null)
  const [showArticleForm, setShowArticleForm] = useState(false)
  const [articleForm, setArticleForm] = useState({ nom:'', unite_stock:'fût', contenance_litres:'', methode_valorisation:'fifo', ordre:0 })
  const [editArticleId, setEditArticleId] = useState(null)
  const [showAssocForm, setShowAssocForm] = useState(null) // article_id
  const [assocForm, setAssocForm] = useState({ produit_vendu:'', consommation_par_vente:'', unite:'L', notes:'' })
  const [editAssocId, setEditAssocId] = useState(null)
  const [produits, setProduits] = useState([])

  useEffect(() => { load() }, [])
  useEffect(() => {
    if (semaineId) {
      const s = semaines.find(s => s.id === semaineId)
      setSemaine(s || null)
    }
  }, [semaineId, semaines])

  async function load() {
    setLoading(true)
    const [{ data: arts }, { data: mvts }, { data: assocs }, { data: sems }, { data: prods }] = await Promise.all([
      supabase.from('articles_stock').select('*').eq('actif', true).order('ordre'),
      supabase.from('mouvements_stock').select('*, articles_stock(nom, unite_stock, contenance_litres, methode_valorisation)').order('date_mouvement').order('created_at'),
      supabase.from('stock_associations').select('*, articles_stock(nom)').order('article_stock_id'),
      supabase.from('semaines').select('*').order('annee', { ascending:false }).order('numero', { ascending:false }),
      supabase.from('produits').select('nom, categorie').eq('actif', true).order('categorie').order('nom'),
    ])
    setArticles(arts || [])
    setMouvements(mvts || [])
    setAssociations(assocs || [])
    setSemaines(sems || [])
    setProduits(prods || [])
    setLoading(false)
  }

  // ── Calcul stock par article ──────────────────────────────────────────────
  function getStockArticle(article) {
    const mvtsArticle = mouvements
      .filter(m => m.article_stock_id === article.id)
      .sort((a, b) => new Date(a.date_mouvement) - new Date(b.date_mouvement) || new Date(a.created_at) - new Date(b.created_at))

    if (article.methode_valorisation === 'pump') {
      return { ...calculerPUMP(mvtsArticle), lots: [], methode: 'pump' }
    }

    // FIFO
    const lots = []
    let qteStock = 0
    let valeurStock = 0
    for (const m of mvtsArticle) {
      if (m.type_mouvement === 'entree') {
        lots.push({ quantite_restante: m.quantite, cout_unitaire: m.cout_unitaire || 0, date: m.date_mouvement })
        qteStock += m.quantite
        valeurStock += m.cout_total || 0
      } else if (m.type_mouvement === 'sortie') {
        let reste = m.quantite
        qteStock -= m.quantite
        for (const lot of lots) {
          if (reste <= 0.0001) break
          const pris = Math.min(reste, lot.quantite_restante)
          lot.quantite_restante -= pris
          valeurStock -= pris * lot.cout_unitaire
          reste -= pris
        }
      }
    }
    return {
      qteStock: Math.round(qteStock * 1000) / 1000,
      valeurStock: Math.round(valeurStock * 100) / 100,
      coutMoyen: qteStock > 0 ? Math.round(valeurStock / qteStock * 100) / 100 : 0,
      lots: lots.filter(l => l.quantite_restante > 0.001),
      methode: 'fifo'
    }
  }

  // ── Calcul automatique des sorties depuis les ventes ─────────────────────
  async function calculerSortiesAuto() {
    if (!semaineId) return
    setCalcLoading(true)
    setAlert(null)

    // Charger toutes les ventes de la semaine
    const { data: ventes } = await supabase
      .from('ventes')
      .select('description, quantite')
      .eq('semaine_id', semaineId)
      .eq('type_transaction', 'Vente')
      .limit(10000)

    const qtesVendues = {}
    ventes?.forEach(v => {
      qtesVendues[v.description] = (qtesVendues[v.description] || 0) + (v.quantite || 0)
    })

    let nbSorties = 0
    let nbIgnores = 0

    for (const article of articles) {
      const assocs = associations.filter(a => a.article_stock_id === article.id)
      if (!assocs.length) continue

      // Vérifier si une sortie existe déjà pour cette semaine
      const { data: existing } = await supabase
        .from('mouvements_stock')
        .select('id')
        .eq('article_stock_id', article.id)
        .eq('semaine_id', semaineId)
        .eq('type_mouvement', 'sortie')
        .single()

      // Supprimer sortie existante non envoyée au bilan (on recalcule)
      if (existing) {
        await supabase.from('mouvements_stock')
          .delete()
          .eq('article_stock_id', article.id)
          .eq('semaine_id', semaineId)
          .eq('type_mouvement', 'sortie')
          .eq('envoye_bilan', false)
        // Si envoyée au bilan, on ignore pour ne pas casser le bilan
        const { data: envoyee } = await supabase
          .from('mouvements_stock').select('id')
          .eq('article_stock_id', article.id)
          .eq('semaine_id', semaineId)
          .eq('type_mouvement', 'sortie')
          .eq('envoye_bilan', true)
          .single()
        if (envoyee) { nbIgnores++; continue }
      }

      // Calculer la consommation
      let totalLitres = 0
      const detailVentes = []
      for (const assoc of assocs) {
        const qteVendue = qtesVendues[assoc.produit_vendu] || 0
        if (qteVendue === 0) continue
        const conso = qteVendue * assoc.consommation_par_vente
        totalLitres += conso
        detailVentes.push(`${assoc.produit_vendu}(${qteVendue})`)
      }

      if (totalLitres === 0) continue

      // Convertir en unités stock
      const contenance = article.contenance_litres || 1
      const unitesSorties = article.unite_stock === 'canette' || assocs[0]?.unite === 'unité'
        ? totalLitres // déjà en unités
        : totalLitres / contenance

      const qteArrondie = Math.round(unitesSorties * 1000) / 1000

      // Calcul du coût selon méthode
      const stockData = getStockArticle(article)
      let coutTotal = 0
      if (article.methode_valorisation === 'pump') {
        coutTotal = Math.round(qteArrondie * (stockData.pump || 0) * 100) / 100
      } else {
        const fifo = calculerFIFO(stockData.lots, qteArrondie)
        coutTotal = fifo.coutTotal
      }

      const coutUnitaire = qteArrondie > 0 ? coutTotal / qteArrondie : 0

      await supabase.from('mouvements_stock').insert({
        article_stock_id: article.id,
        semaine_id: semaineId,
        type_mouvement: 'sortie',
        quantite: qteArrondie,
        cout_unitaire: Math.round(coutUnitaire * 10000) / 10000,
        cout_total: coutTotal,
        date_mouvement: semaine?.date_fin || new Date().toISOString().slice(0, 10),
        notes: `Auto depuis ventes : ${detailVentes.join(', ')}`,
        envoye_bilan: false,
      })
      nbSorties++
    }

    setCalcLoading(false)
    load()
    setAlert({ type: nbSorties > 0 ? 'success' : 'warning',
      msg: nbSorties > 0
        ? `✅ ${nbSorties} sortie(s) calculée(s) depuis les ventes${nbIgnores > 0 ? ` (${nbIgnores} déjà existante(s))` : ''}`
        : 'Aucune nouvelle sortie calculée — vérifiez les associations produits'
    })
  }

  // Mouvements de la semaine
  const mvtsSemaine = semaineId
    ? mouvements.filter(m => m.semaine_id === semaineId)
    : mouvements

  function exportMouvements() {
    const rows = mvtsSemaine.map(m => ({
      date: m.date_mouvement,
      article: m.articles_stock?.nom || '',
      type: m.type_mouvement,
      quantite: m.quantite,
      unite: m.articles_stock?.unite_stock || '',
      cout_unitaire: m.cout_unitaire?.toFixed(4) || '',
      cout_total: m.cout_total?.toFixed(2) || '',
      bilan: m.envoye_bilan ? 'Envoyé' : 'En attente',
      notes: m.notes || '',
    }))
    const headers = ['Date','Article','Type','Quantité','Unité','P.U. (€)','Total (€)','Bilan','Notes']
    const bom = '\uFEFF'; const sep = ';'
    const lines = [headers.join(sep), ...rows.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g,'""')}"`).join(sep))]
    const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = 'mouvements_stock_' + new Date().toISOString().slice(0,10) + '.csv'; a.click()
    URL.revokeObjectURL(url)
  }
  const sortiesNonEnvoyees = mvtsSemaine.filter(m => m.type_mouvement === 'sortie' && !m.envoye_bilan)

  const totalValeurStock = articles.reduce((s, a) => s + getStockArticle(a).valeurStock, 0)
  const totalSorties = mvtsSemaine.filter(m => m.type_mouvement === 'sortie').reduce((s, m) => s + (m.cout_total || 0), 0)

  async function saveAssoc() {
    if (!assocForm.produit_vendu || !assocForm.consommation_par_vente) return
    const payload = {
      article_stock_id: showAssocForm,
      produit_vendu: assocForm.produit_vendu,
      consommation_par_vente: parseFloat(assocForm.consommation_par_vente),
      unite: assocForm.unite,
      notes: assocForm.notes || null,
    }
    if (editAssocId) {
      await supabase.from('stock_associations').update(payload).eq('id', editAssocId)
    } else {
      await supabase.from('stock_associations').insert(payload)
    }
    setAssocForm({ produit_vendu:'', consommation_par_vente:'', unite:'L', notes:'' })
    setEditAssocId(null)
    setShowAssocForm(null)
    load()
  }

  async function deleteAssoc(id) {
    if (!confirm('Supprimer cette association ?')) return
    await supabase.from('stock_associations').delete().eq('id', id)
    load()
  }

  async function saveArticle() {
    if (!articleForm.nom.trim()) return
    const payload = { nom: articleForm.nom.trim(), unite_stock: articleForm.unite_stock, contenance_litres: parseFloat(articleForm.contenance_litres) || null, methode_valorisation: articleForm.methode_valorisation, ordre: parseInt(articleForm.ordre) || 0 }
    if (editArticleId) await supabase.from('articles_stock').update(payload).eq('id', editArticleId)
    else await supabase.from('articles_stock').insert(payload)
    setShowArticleForm(false); setEditArticleId(null)
    setArticleForm({ nom:'', unite_stock:'fût', contenance_litres:'', methode_valorisation:'fifo', ordre:0 })
    load()
  }

  async function deleteMouvement(id) {
    if (!confirm('Supprimer ce mouvement ?')) return
    await supabase.from('mouvements_stock').delete().eq('id', id)
    load()
  }

  return (
    <div>
      <style>{`
        @media print {
          .sidebar, .no-print, aside, nav, button, .btn, select, input { display: none !important; }
          .app-layout { display: block !important; }
          .main-content { margin-left: 0 !important; padding: 0 !important; width: 100% !important; }
          .page-body { padding: 0 !important; }
          .card { box-shadow: none !important; border: 1px solid #ddd !important; break-inside: avoid; }
          table { font-size: 11px; border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd !important; padding: 4px 7px !important; }
          th { background: #6B3FA0 !important; color: white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          tr { break-inside: avoid; }
          @page { margin: 15mm 12mm; size: A4 portrait; }
        }
      `}</style>
      {entreeModal && (
        <EntreeModal article={entreeModal} semaines={semaines}
          onSave={() => { setEntreeModal(null); load(); setAlert({ type:'success', msg:'Entrée enregistrée ✅' }) }}
          onClose={() => setEntreeModal(null)} />
      )}
      {validBilanModal && semaine && (
        <ValidBilanModal
          sortie={validBilanModal}
          article={articles.find(a => a.id === validBilanModal.article_stock_id)}
          semaine={semaine}
          onSave={() => { setValidBilanModal(null); load(); setAlert({ type:'success', msg:'Ligne d\'achat créée dans le bilan ✅' }) }}
          onClose={() => setValidBilanModal(null)} />
      )}

      <div className="page-header">
        <div>
          <p className="page-title">📦 Gestion du stock</p>
          <p className="page-subtitle">Boissons — FIFO & PUMP — sorties depuis les ventes</p>
        </div>
        <div className="flex-gap">
          <SemaineSelector value={semaineId} onChange={setSemaineId} />
          <button className="btn no-print" onClick={() => window.print()}>🖨️ Imprimer</button>
          {tab === 'mouvements' && (
            <button className="btn no-print" onClick={exportMouvements}>📊 Exporter CSV</button>
          )}
          {tab === 'articles' && (
            <button className="btn btn-primary no-print" onClick={() => { setShowArticleForm(true); setEditArticleId(null); setArticleForm({ nom:'', unite_stock:'fût', contenance_litres:'', methode_valorisation:'fifo', ordre:0 }) }}>
              + Nouvel article
            </button>
          )}
        </div>
      </div>

      <div className="page-body">
        {alert && <div className={`alert alert-${alert.type}`} onClick={() => setAlert(null)}>{alert.msg}</div>}

        {/* Onglets */}
        <div style={{ display:'flex', gap:4, borderBottom:'0.5px solid var(--gray-200)', marginBottom:20 }}>
          {[['stock','📊 Stock actuel'], ['historique','📅 Historique saison'], ['mouvements','📋 Mouvements'], ['articles','⚙️ Articles']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              padding:'8px 16px', border:'none', background:'none', cursor:'pointer', fontSize:13, fontWeight:500,
              borderBottom: tab===key ? '2px solid var(--green)' : '2px solid transparent',
              color: tab===key ? 'var(--green)' : 'var(--gray-400)', marginBottom:-1
            }}>{label}</button>
          ))}
        </div>

        {/* ── STOCK ACTUEL ── */}
        {tab === 'stock' && (
          <>
            <div className="metrics-grid mb-16">
              <div className="metric-card green">
                <div className="metric-label">Valeur totale du stock</div>
                <div className="metric-value">{fmt(totalValeurStock)}</div>
                <div className="metric-sub">{articles.length} articles</div>
              </div>
              {semaineId && (
                <>
                  <div className="metric-card amber">
                    <div className="metric-label">Sorties cette semaine</div>
                    <div className="metric-value">{fmt(totalSorties)}</div>
                    <div className="metric-sub">{mvtsSemaine.filter(m => m.type_mouvement === 'sortie').length} article(s)</div>
                  </div>
                  <div className="metric-card" style={{ borderLeft:'3px solid var(--green)' }}>
                    <div className="metric-label">En attente → Bilan</div>
                    <div className="metric-value">{sortiesNonEnvoyees.length}</div>
                    <div className="metric-sub">{fmt(sortiesNonEnvoyees.reduce((s,m) => s + (m.cout_total||0), 0))}</div>
                  </div>
                </>
              )}
            </div>

            {semaineId && (
              <div className="card mb-16" style={{ background:'var(--green-light)', border:'1px solid rgba(26,107,60,.2)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ fontWeight:600, color:'var(--green)' }}>Calcul automatique des sorties</div>
                    <div style={{ fontSize:12, color:'var(--gray-500)', marginTop:2 }}>
                      Calcule les sorties de stock depuis les ventes SumUp de la semaine sélectionnée
                    </div>
                  </div>
                  <button className="btn btn-primary" onClick={calculerSortiesAuto} disabled={calcLoading}>
                    {calcLoading ? <span className="spinner"/> : '🔄'} Calculer les sorties depuis les ventes
                  </button>
                </div>
                {sortiesNonEnvoyees.length > 0 && (
                  <div style={{ marginTop:12, borderTop:'1px solid rgba(26,107,60,.2)', paddingTop:12, fontSize:12, color:'var(--green)' }}>
                    💡 {sortiesNonEnvoyees.length} sortie(s) calculée(s) non encore envoyée(s) au bilan — cliquez sur <strong>→ Bilan</strong> pour chaque ligne
                  </div>
                )}
              </div>
            )}

            <div className="card">
              <div className="card-title">État du stock</div>
              {loading ? <div className="loading-page" style={{ minHeight:80 }}><div className="spinner"/></div> : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Article</th>
                        <th>Méthode</th>
                        <th className="num">Qté stock</th>
                        <th className="num">Coût unitaire</th>
                        <th className="num">Valeur stock</th>
                        {!semaineId && <th>Lots</th>}
                        {semaineId && <th>Sortie semaine</th>}
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {articles.map(a => {
                        const stockData = getStockArticle(a)
                        const assocs = associations.filter(x => x.article_stock_id === a.id)
                        const sortieSemaine = semaineId
                          ? mouvements.find(m => m.article_stock_id === a.id && m.semaine_id === semaineId && m.type_mouvement === 'sortie')
                          : null

                        return (
                          <tr key={a.id} style={{ background: stockData.qteStock <= 0 ? 'var(--amber-light)' : '' }}>
                            <td>
                              <div style={{ fontWeight:500 }}>{a.nom}</div>
                              <div style={{ fontSize:11, color:'var(--gray-400)' }}>
                                {assocs.map(x => `${x.produit_vendu}=${x.consommation_par_vente}${x.unite}`).join(' · ')}
                              </div>
                            </td>
                            <td>
                              <span className={`badge ${a.methode_valorisation === 'pump' ? 'badge-amber' : 'badge-blue'}`}>
                                {a.methode_valorisation?.toUpperCase()}
                              </span>
                            </td>
                            <td className="num">
                              <span style={{ fontWeight:700, color: stockData.qteStock <= 0 ? 'var(--red)' : stockData.qteStock < 2 ? 'var(--amber)' : 'var(--green)' }}>
                                {stockData.qteStock} {a.unite_stock}
                              </span>
                            </td>
                            <td className="num">
                              {a.methode_valorisation === 'pump'
                                ? <span title="Prix unitaire moyen pondéré">{stockData.pump ? fmt(stockData.pump) : '—'}</span>
                                : <span>{stockData.coutMoyen ? fmt(stockData.coutMoyen) : '—'}</span>}
                            </td>
                            <td className="num" style={{ fontWeight:600 }}>{fmt(stockData.valeurStock)}</td>
                            {!semaineId && (
                              <td style={{ fontSize:10, color:'var(--gray-400)' }}>
                                {stockData.lots?.map((l, i) => (
                                  <span key={i} className="badge badge-gray" style={{ fontSize:9, marginRight:2 }}>
                                    {l.quantite_restante.toFixed(1)}×{fmt(l.cout_unitaire)}
                                  </span>
                                ))}
                              </td>
                            )}
                            {semaineId && (
                              <td>
                                {sortieSemaine ? (
                                  <div>
                                    <div style={{ fontSize:12, fontWeight:600, color:'var(--red)' }}>
                                      -{sortieSemaine.quantite} {a.unite_stock} / {fmt(sortieSemaine.cout_total)}
                                    </div>
                                    {sortieSemaine.envoye_bilan
                                      ? <span className="badge badge-green" style={{ fontSize:10 }}>✅ Au bilan</span>
                                      : <button className="btn btn-sm btn-primary" style={{ fontSize:10, marginTop:4 }}
                                          onClick={() => setValidBilanModal(sortieSemaine)}>
                                          → Envoyer au bilan
                                        </button>}
                                  </div>
                                ) : (
                                  <span className="text-muted" style={{ fontSize:12 }}>Non calculé</span>
                                )}
                              </td>
                            )}
                            <td>
                              <button className="btn btn-sm btn-primary" onClick={() => setEntreeModal(a)}>📦 Entrée</button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── HISTORIQUE SAISON ── */}
        {tab === 'historique' && (
          <div>
            {articles.map(article => {
              const mvtsArticle = mouvements
                .filter(m => m.article_stock_id === article.id)
                .sort((a, b) => new Date(a.date_mouvement) - new Date(b.date_mouvement))

              if (!mvtsArticle.length) return null

              // Grouper par semaine
              const parSemaine = {}
              mvtsArticle.forEach(m => {
                const sid = m.semaine_id || 'hors-semaine'
                if (!parSemaine[sid]) parSemaine[sid] = { semaine_id: sid, entrees: 0, sorties: 0, coutEntrees: 0, coutSorties: 0, envoye: false }
                if (m.type_mouvement === 'entree') { parSemaine[sid].entrees += m.quantite; parSemaine[sid].coutEntrees += m.cout_total || 0 }
                if (m.type_mouvement === 'sortie') { parSemaine[sid].sorties += m.quantite; parSemaine[sid].coutSorties += m.cout_total || 0; parSemaine[sid].envoye = m.envoye_bilan }
              })

              // Calcul stock cumulé semaine par semaine
              let stockCumul = 0
              const rows = []
              const semOrdered = [...new Set(mvtsArticle.map(m => m.semaine_id))].filter(Boolean)
              semOrdered.forEach(sid => {
                const d = parSemaine[sid]
                const sem = semaines.find(s => s.id === sid)
                const stockDebut = stockCumul
                stockCumul += d.entrees - d.sorties
                rows.push({ ...d, sem, stockDebut, stockFin: Math.round(stockCumul * 1000) / 1000 })
              })

              // Stock actuel total
              const stockData = getStockArticle(article)

              return (
                <div key={article.id} className="card mb-16">
                  <div className="flex-between mb-16">
                    <div>
                      <div className="card-title" style={{ marginBottom:2 }}>{article.nom}</div>
                      <div style={{ fontSize:12, color:'var(--gray-400)' }}>
                        <span className={`badge ${article.methode_valorisation === 'pump' ? 'badge-amber' : 'badge-blue'}`} style={{ fontSize:10 }}>
                          {article.methode_valorisation?.toUpperCase()}
                        </span>
                        {' '}Stock actuel : <strong style={{ color: stockData.qteStock <= 0 ? 'var(--red)' : 'var(--green)' }}>
                          {stockData.qteStock} {article.unite_stock}
                        </strong> — Valeur : <strong>{fmt(stockData.valeurStock)}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Semaine</th>
                          <th className="num">Stock début</th>
                          <th className="num">Entrées</th>
                          <th className="num">Sorties</th>
                          <th className="num">Stock fin</th>
                          <th className="num">Coût entrées</th>
                          <th className="num">Coût sorties</th>
                          <th>Bilan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight:500 }}>
                              {r.sem ? `S${r.sem.numero} ${r.sem.annee}${r.sem.theme ? ` — ${r.sem.theme}` : ''}` : 'Hors semaine'}
                            </td>
                            <td className="num">{r.stockDebut} {article.unite_stock}</td>
                            <td className="num positive">{r.entrees > 0 ? `+${Math.round(r.entrees*100)/100}` : '—'}</td>
                            <td className="num negative">{r.sorties > 0 ? `-${Math.round(r.sorties*100)/100}` : '—'}</td>
                            <td className="num" style={{ fontWeight:700, color: r.stockFin <= 0 ? 'var(--red)' : r.stockFin < 5 ? 'var(--amber)' : 'inherit' }}>
                              {r.stockFin} {article.unite_stock}
                            </td>
                            <td className="num">{r.coutEntrees > 0 ? fmt(r.coutEntrees) : '—'}</td>
                            <td className="num negative">{r.coutSorties > 0 ? fmt(-r.coutSorties) : '—'}</td>
                            <td>
                              {r.sorties > 0
                                ? r.envoye
                                  ? <span className="badge badge-green" style={{ fontSize:10 }}>✅ Envoyé</span>
                                  : <span className="badge badge-amber" style={{ fontSize:10 }}>⏳ En attente</span>
                                : '—'}
                            </td>
                          </tr>
                        ))}
                        <tr className="tr-total">
                          <td>Total saison</td>
                          <td>—</td>
                          <td className="num positive">+{Math.round(rows.reduce((s,r) => s+r.entrees, 0)*100)/100} {article.unite_stock}</td>
                          <td className="num negative">-{Math.round(rows.reduce((s,r) => s+r.sorties, 0)*100)/100} {article.unite_stock}</td>
                          <td className="num" style={{ fontWeight:700 }}>{stockData.qteStock} {article.unite_stock}</td>
                          <td className="num">{fmt(rows.reduce((s,r) => s+r.coutEntrees, 0))}</td>
                          <td className="num negative">{fmt(-rows.reduce((s,r) => s+r.coutSorties, 0))}</td>
                          <td></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── MOUVEMENTS ── */}
        {tab === 'mouvements' && (
          <div className="card">
            <div className="flex-between mb-16">
              <div className="card-title" style={{ marginBottom:0 }}>
                Historique {semaineId ? '— semaine filtrée' : '— toutes semaines'}
              </div>
              <div className="text-sm text-muted">{mvtsSemaine.length} mouvement(s)</div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th><th>Article</th><th>Type</th>
                    <th className="num">Qté</th><th className="num">P.U.</th>
                    <th className="num">Total</th><th>Bilan</th><th>Notes</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {mvtsSemaine.length === 0 ? (
                    <tr><td colSpan={9} style={{ textAlign:'center', padding:32, color:'var(--gray-400)' }}>Aucun mouvement</td></tr>
                  ) : (
                    [...mvtsSemaine].sort((a,b) => new Date(b.date_mouvement) - new Date(a.date_mouvement)).map(m => (
                      <tr key={m.id}>
                        <td>{m.date_mouvement}</td>
                        <td style={{ fontWeight:500 }}>{m.articles_stock?.nom}</td>
                        <td>
                          {m.type_mouvement === 'entree'
                            ? <span className="badge badge-green">📦 Entrée</span>
                            : <span className="badge badge-amber">📤 Sortie</span>}
                        </td>
                        <td className="num">{m.quantite} {m.articles_stock?.unite_stock}</td>
                        <td className="num">{m.cout_unitaire ? fmt(m.cout_unitaire) : '—'}</td>
                        <td className="num" style={{ fontWeight:600, color: m.type_mouvement === 'entree' ? 'var(--green)' : 'var(--red)' }}>
                          {m.type_mouvement === 'entree' ? '+' : '-'}{fmt(Math.abs(m.cout_total || 0))}
                        </td>
                        <td>
                          {m.type_mouvement === 'sortie'
                            ? m.envoye_bilan
                              ? <span className="badge badge-green" style={{ fontSize:10 }}>✅ Envoyé</span>
                              : <span className="badge badge-amber" style={{ fontSize:10 }}>⏳ En attente</span>
                            : '—'}
                        </td>
                        <td style={{ fontSize:11, color:'var(--gray-400)', maxWidth:160 }}>{m.notes || '—'}</td>
                        <td>
                          <button className="btn btn-danger btn-sm" onClick={() => deleteMouvement(m.id)}>🗑️</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── ARTICLES ── */}
        {tab === 'articles' && (
          <>
            {showArticleForm && (
              <div className="card mb-16">
                <div className="card-title">{editArticleId ? 'Modifier' : 'Nouvel'} article stockable</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:12, marginBottom:12 }}>
                  <div className="form-group">
                    <label className="form-label">Nom *</label>
                    <input className="form-input" value={articleForm.nom}
                      onChange={e => setArticleForm(f=>({...f,nom:e.target.value}))} autoFocus />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Unité</label>
                    <select className="form-select" value={articleForm.unite_stock}
                      onChange={e => setArticleForm(f=>({...f,unite_stock:e.target.value}))}>
                      {['litre','bouteille','canette','bag-in-box','carton','pièce'].map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Contenance (L)</label>
                    <input className="form-input" type="number" step="0.01"
                      value={articleForm.contenance_litres}
                      onChange={e => setArticleForm(f=>({...f,contenance_litres:e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Méthode valorisation</label>
                    <select className="form-select" value={articleForm.methode_valorisation}
                      onChange={e => setArticleForm(f=>({...f,methode_valorisation:e.target.value}))}>
                      <option value="fifo">📋 FIFO (premier entré, premier sorti)</option>
                      <option value="pump">⚖️ PUMP (coût unitaire moyen pondéré)</option>
                    </select>
                  </div>
                </div>
                <div className="flex-gap">
                  <button className="btn btn-primary btn-sm" onClick={saveArticle}>💾 Enregistrer</button>
                  <button className="btn btn-sm" onClick={() => { setShowArticleForm(false); setEditArticleId(null) }}>Annuler</button>
                </div>
              </div>
            )}

            <div className="card mb-16">
              <div className="card-title">Articles stockables ({articles.length})</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Article</th><th>Unité</th><th className="num">Contenance</th><th>Méthode</th><th>Produits associés</th><th></th></tr>
                  </thead>
                  <tbody>
                    {articles.map(a => {
                      const assocs = associations.filter(x => x.article_stock_id === a.id)
                      return (
                        <tr key={a.id}>
                          <td style={{ fontWeight:500 }}>{a.nom}</td>
                          <td>{a.unite_stock}</td>
                          <td className="num">{a.contenance_litres ? `${a.contenance_litres} L` : '—'}</td>
                          <td>
                            <span className={`badge ${a.methode_valorisation === 'pump' ? 'badge-amber' : 'badge-blue'}`}>
                              {a.methode_valorisation?.toUpperCase()}
                            </span>
                          </td>
                          <td>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
                              {assocs.map(x => (
                                <span key={x.id} className="badge badge-blue" style={{ fontSize:10 }}>
                                  {x.produit_vendu} ({x.consommation_par_vente} {x.unite})
                                </span>
                              ))}
                              {!assocs.length && <span className="badge badge-amber" style={{ fontSize:10 }}>⚠️ Aucune association</span>}
                            </div>
                          </td>
                          <td>
                            <div className="flex-gap">
                              <button className="btn btn-sm" onClick={() => { setArticleForm({...a}); setEditArticleId(a.id); setShowArticleForm(true) }}>✏️</button>
                              <button className="btn btn-danger btn-sm" onClick={async () => { if (!confirm('Supprimer ?')) return; await supabase.from('articles_stock').update({ actif:false }).eq('id', a.id); load() }}>🗑️</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <div className="card-title">Associations article → produits vendus</div>
              <p className="text-muted text-sm mb-16">
                Définit combien de litres (ou unités) sont consommés par vente d'un produit SumUp.
                Ex : Bière en litres → Pichet = 1,5L, Verre = 0,25L
              </p>

              {/* Formulaire ajout/modif association */}
              {showAssocForm && (
                <div style={{ background:'var(--gray-50)', border:'1px solid var(--gray-200)', borderRadius:8, padding:16, marginBottom:16 }}>
                  <div style={{ fontWeight:600, fontSize:13, marginBottom:10 }}>
                    {editAssocId ? 'Modifier' : 'Nouvelle'} association — {articles.find(a => a.id === showAssocForm)?.nom}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 2fr', gap:10, marginBottom:10 }}>
                    <div className="form-group">
                      <label className="form-label">Produit vendu (SumUp) *</label>
                      <select className="form-select" value={assocForm.produit_vendu}
                        onChange={e => setAssocForm(f=>({...f, produit_vendu:e.target.value}))}>
                        <option value="">— Choisir —</option>
                        {produits.map(p => <option key={p.nom} value={p.nom}>{p.categorie} — {p.nom}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Consommation *</label>
                      <input className="form-input" type="number" step="0.01" min="0"
                        value={assocForm.consommation_par_vente}
                        onChange={e => setAssocForm(f=>({...f, consommation_par_vente:e.target.value}))}
                        placeholder="Ex: 1.5" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Unité</label>
                      <select className="form-select" value={assocForm.unite}
                        onChange={e => setAssocForm(f=>({...f, unite:e.target.value}))}>
                        <option value="L">Litres (L)</option>
                        <option value="unité">Unité</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Notes</label>
                      <input className="form-input" value={assocForm.notes}
                        onChange={e => setAssocForm(f=>({...f, notes:e.target.value}))}
                        placeholder="Ex: Pichet = 1,5L" />
                    </div>
                  </div>
                  <div className="flex-gap">
                    <button className="btn btn-primary btn-sm" onClick={saveAssoc}
                      disabled={!assocForm.produit_vendu || !assocForm.consommation_par_vente}>
                      💾 {editAssocId ? 'Mettre à jour' : 'Ajouter'}
                    </button>
                    <button className="btn btn-sm" onClick={() => { setShowAssocForm(null); setEditAssocId(null); setAssocForm({ produit_vendu:'', consommation_par_vente:'', unite:'L', notes:'' }) }}>
                      Annuler
                    </button>
                  </div>
                </div>
              )}

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Article stock</th>
                      <th>Produit vendu (SumUp)</th>
                      <th className="num">Conso/vente</th>
                      <th>Unité</th>
                      <th>Notes</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {associations.map(x => (
                      <tr key={x.id}>
                        <td style={{ fontWeight:500 }}>{x.articles_stock?.nom}</td>
                        <td>{x.produit_vendu}</td>
                        <td className="num">{x.consommation_par_vente}</td>
                        <td>{x.unite}</td>
                        <td className="text-muted" style={{ fontSize:12 }}>{x.notes || '—'}</td>
                        <td>
                          <div className="flex-gap">
                            <button className="btn btn-sm" onClick={() => {
                              setAssocForm({ produit_vendu: x.produit_vendu, consommation_par_vente: x.consommation_par_vente, unite: x.unite, notes: x.notes || '' })
                              setEditAssocId(x.id)
                              setShowAssocForm(x.article_stock_id)
                            }}>✏️</button>
                            <button className="btn btn-danger btn-sm" onClick={() => deleteAssoc(x.id)}>🗑️</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Bouton ajouter association par article */}
              <div style={{ marginTop:16, display:'flex', flexWrap:'wrap', gap:8 }}>
                {articles.map(a => (
                  <button key={a.id} className="btn btn-sm"
                    onClick={() => { setShowAssocForm(a.id); setEditAssocId(null); setAssocForm({ produit_vendu:'', consommation_par_vente:'', unite: a.unite_stock === 'canette' ? 'unité' : 'L', notes:'' }) }}>
                    + Association pour {a.nom}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
