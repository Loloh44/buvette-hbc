import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/sumup'
import SemaineSelector from '../components/SemaineSelector.jsx'

const EMPTY_ACHAT = {
  fournisseur: '', num_facture: '', date_achat: new Date().toISOString().slice(0, 10),
  article: '', quantite: '', unite: '', total_ht: '', taux_tva: 0.055, total_ttc: '',
  article_stock_id: '', quantite_stock: '', unite_stock: ''
}

// ─── Modal Répartition Automatique ────────────────────────────────────────────
function RepartitionModal({ achat, semaineId, produits, onSave, onClose }) {
  const [selectedProduits, setSelectedProduits] = useState([])
  const [ventesParProduit, setVentesParProduit] = useState({})
  const [repartition, setRepartition] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState('auto') // auto | manuel

  useEffect(() => {
    // Pré-remplir avec les imputations existantes
    if (achat.imputations?.length > 0) {
      const existing = achat.imputations.map(imp => imp.produit_fini)
      setSelectedProduits(existing)
    }
  }, [achat])

  async function loadVentes() {
    if (!selectedProduits.length || !semaineId) return
    setLoading(true)

    // Récupérer les quantités vendues pour chaque produit sélectionné
    const { data } = await supabase
      .from('ventes')
      .select('description, quantite')
      .eq('semaine_id', semaineId)
      .eq('type_transaction', 'Vente')
      .in('description', selectedProduits)

    const qteMap = {}
    data?.forEach(v => {
      qteMap[v.description] = (qteMap[v.description] || 0) + (v.quantite || 0)
    })

    setVentesParProduit(qteMap)

    // Calculer la répartition proportionnelle
    const totalQte = Object.values(qteMap).reduce((s, q) => s + q, 0)
    const totalTTC = parseFloat(achat.total_ttc) || 0

    const rep = selectedProduits.map(prod => {
      const qte = qteMap[prod] || 0
      const pct = totalQte > 0 ? qte / totalQte : 1 / selectedProduits.length
      const montant = Math.round(totalTTC * pct * 100) / 100
      const cat = produits.find(p => p.nom === prod)?.categorie || null
      return { produit_fini: prod, quantite: qte, pct, montant, categorie: cat }
    })

    // Ajuster arrondi sur le dernier
    const sumMontants = rep.reduce((s, r) => s + r.montant, 0)
    if (rep.length > 0) {
      rep[rep.length - 1].montant = Math.round((rep[rep.length - 1].montant + totalTTC - sumMontants) * 100) / 100
    }

    setRepartition(rep)
    setLoading(false)
  }

  useEffect(() => {
    if (mode === 'auto' && selectedProduits.length > 0) loadVentes()
    if (mode === 'manuel' && selectedProduits.length > 0) {
      // Répartition égale par défaut en mode manuel
      const totalTTC = parseFloat(achat.total_ttc) || 0
      const rep = selectedProduits.map(prod => ({
        produit_fini: prod,
        quantite: 0,
        pct: 1 / selectedProduits.length,
        montant: Math.round(totalTTC / selectedProduits.length * 100) / 100,
        categorie: produits.find(p => p.nom === prod)?.categorie || null,
      }))
      setRepartition(rep)
    }
  }, [selectedProduits, mode])

  function updateMontant(idx, val) {
    setRepartition(r => r.map((item, i) => i === idx ? { ...item, montant: parseFloat(val) || 0 } : item))
  }

  async function handleSave() {
    if (!repartition.length) return
    setSaving(true)

    // Supprimer les anciennes imputations
    if (achat.imputations?.length > 0) {
      await supabase.from('imputations').delete().eq('achat_id', achat.id)
    }

    // Insérer les nouvelles
    await supabase.from('imputations').insert(
      repartition.map(r => ({
        achat_id: achat.id,
        produit_fini: r.produit_fini,
        categorie: r.categorie,
        quantite_categorie: r.quantite || null,
        cout_total_categorie: r.montant,
      }))
    )

    setSaving(false)
    onSave()
  }

  const totalTTC = parseFloat(achat.total_ttc) || 0
  const totalRep = repartition.reduce((s, r) => s + r.montant, 0)
  const ecart = Math.round((totalTTC - totalRep) * 100) / 100

  const cats = ['Boissons', 'Snacking', 'Boutique', 'Dons', 'Inconnu']

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--gray-200)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>⚖️ Répartition des coûts</div>
              <div style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 2 }}>
                {achat.article} — <strong>{fmt(totalTTC)}</strong> · {achat.fournisseur}
              </div>
            </div>
            <button className="btn btn-sm" onClick={onClose}>✕</button>
          </div>

          {/* Mode */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className={'btn btn-sm' + (mode === 'auto' ? ' btn-primary' : '')} onClick={() => setMode('auto')}>
              🤖 Auto (proportionnel aux ventes)
            </button>
            <button className={'btn btn-sm' + (mode === 'manuel' ? ' btn-primary' : '')} onClick={() => setMode('manuel')}>
              ✏️ Manuel (saisir les montants)
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>

          {/* Sélection des produits */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">1. Sélectionner les produits finis concernés</div>
            <p className="text-muted text-sm" style={{ marginBottom: 10 }}>
              {mode === 'auto'
                ? "L'appli calcule la répartition proportionnellement aux quantités vendues cette semaine."
                : "Saisissez ensuite manuellement le montant à imputer à chaque produit."}
            </p>

            {/* ── Boutons de sélection rapide ── */}
            <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '10px 12px', marginBottom: 14, border: '1px solid var(--gray-200)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', marginBottom: 8 }}>
                Sélection rapide
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {/* Tout sélectionner */}
                <button
                  className="btn btn-sm btn-primary"
                  style={{ fontSize: 11 }}
                  onClick={() => setSelectedProduits(produits.map(p => p.nom))}
                >
                  ✅ Tous les produits ({produits.length})
                </button>
                {/* Tout désélectionner */}
                <button
                  className="btn btn-sm"
                  style={{ fontSize: 11 }}
                  onClick={() => setSelectedProduits([])}
                >
                  ✕ Désélectionner tout
                </button>
                {/* Par catégorie */}
                {cats.map(cat => {
                  const prodsInCat = produits.filter(p => p.categorie === cat)
                  if (!prodsInCat.length) return null
                  const allSelected = prodsInCat.every(p => selectedProduits.includes(p.nom))
                  return (
                    <button
                      key={cat}
                      className={'btn btn-sm' + (allSelected ? ' btn-primary' : '')}
                      style={{ fontSize: 11 }}
                      onClick={() => {
                        const nomscat = prodsInCat.map(p => p.nom)
                        if (allSelected) {
                          setSelectedProduits(sel => sel.filter(s => !nomscat.includes(s)))
                        } else {
                          setSelectedProduits(sel => [...new Set([...sel, ...nomscat])])
                        }
                      }}
                    >
                      {allSelected ? '✓ ' : ''}{cat} ({prodsInCat.length})
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Sélection individuelle ── */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {cats.map(cat => (
                <div key={cat} style={{ width: '100%' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', marginBottom: 4, marginTop: 6 }}>{cat}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {produits.filter(p => p.categorie === cat).map(p => {
                      const selected = selectedProduits.includes(p.nom)
                      return (
                        <button
                          key={p.nom}
                          className={'btn btn-sm' + (selected ? ' btn-primary' : '')}
                          style={{ fontSize: 11, padding: '3px 8px' }}
                          onClick={() => setSelectedProduits(sel =>
                            sel.includes(p.nom) ? sel.filter(s => s !== p.nom) : [...sel, p.nom]
                          )}
                        >
                          {selected ? '✓ ' : ''}{p.nom}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {selectedProduits.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--green)', fontWeight: 500 }}>
                ✅ {selectedProduits.length} produit(s) sélectionné(s)
              </div>
            )}
          </div>

          {/* Résultat répartition */}
          {selectedProduits.length > 0 && (
            <div className="card">
              <div className="card-title">2. Répartition calculée</div>

              {loading && <div style={{ textAlign: 'center', padding: 20 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>}

              {!loading && repartition.length > 0 && (
                <>
                  {mode === 'auto' && (
                    <div className="alert alert-info" style={{ marginBottom: 12 }}>
                      ℹ️ Basé sur les quantités vendues cette semaine. Passez en mode Manuel pour ajuster.
                    </div>
                  )}

                  <table>
                    <thead>
                      <tr>
                        <th>Produit fini</th>
                        <th>Catégorie</th>
                        {mode === 'auto' && <th className="num">Qté vendue</th>}
                        <th className="num">% répartition</th>
                        <th className="num">Montant (€)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {repartition.map((r, i) => (
                        <tr key={r.produit_fini}>
                          <td style={{ fontWeight: 500 }}>{r.produit_fini}</td>
                          <td><span className="badge badge-gray">{r.categorie || '—'}</span></td>
                          {mode === 'auto' && (
                            <td className="num">
                              {r.quantite > 0
                                ? <strong>{Math.round(r.quantite)}</strong>
                                : <span className="text-muted" style={{ fontSize: 11 }}>0 vendu ⚠️</span>}
                            </td>
                          )}
                          <td className="num">{Math.round(r.pct * 100)}%</td>
                          <td className="num">
                            {mode === 'manuel' ? (
                              <input
                                type="number"
                                step="0.01"
                                value={r.montant}
                                onChange={e => updateMontant(i, e.target.value)}
                                style={{ width: 80, padding: '3px 6px', border: '1px solid var(--gray-300)', borderRadius: 4, textAlign: 'right', fontSize: 13 }}
                              />
                            ) : (
                              <strong style={{ color: 'var(--green)' }}>{fmt(r.montant)}</strong>
                            )}
                          </td>
                        </tr>
                      ))}
                      <tr className="tr-total">
                        <td colSpan={mode === 'auto' ? 4 : 3}>Total imputé</td>
                        <td className="num" style={{ color: Math.abs(ecart) > 0.01 ? 'var(--red)' : 'var(--green)' }}>
                          {fmt(totalRep)}
                          {Math.abs(ecart) > 0.01 && <span style={{ fontSize: 11, marginLeft: 6 }}>⚠️ écart {fmt(ecart)}</span>}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {repartition.some(r => r.quantite === 0) && mode === 'auto' && (
                    <div className="alert alert-warning" style={{ marginTop: 12 }}>
                      ⚠️ Certains produits n'ont pas de ventes cette semaine — leur part est à 0. Passez en mode Manuel pour ajuster.
                    </div>
                  )}
                </>
              )}

              {!loading && selectedProduits.length > 0 && repartition.length === 0 && (
                <div className="empty-state">Calcul en cours…</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--gray-200)', display: 'flex', gap: 8 }}>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || repartition.length === 0}
          >
            {saving ? <span className="spinner" /> : '💾'} Enregistrer la répartition
          </button>
          {achat.imputations?.length > 0 && (
            <button className="btn btn-danger" onClick={async () => {
              await supabase.from('imputations').delete().eq('achat_id', achat.id)
              onSave()
            }}>
              🗑️ Supprimer la répartition
            </button>
          )}
          <button className="btn" onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  )
}

// ─── Page principale Achats ────────────────────────────────────────────────────
export default function AchatsPage() {
  const [semaineId, setSemaineId] = useState('')
  const [achats, setAchats] = useState([])
  const [produits, setProduits] = useState([])
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState(null)
  const [form, setForm] = useState(EMPTY_ACHAT)
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [repartitionModal, setRepartitionModal] = useState(null)
  const [articlesStock, setArticlesStock] = useState([])

  useEffect(() => { loadProduits(); loadArticlesStock() }, [])
  useEffect(() => { if (semaineId) loadAchats() }, [semaineId])

  async function loadArticlesStock() {
    const { data } = await supabase.from('articles_stock').select('id, nom, unite_stock').eq('actif', true).order('ordre')
    setArticlesStock(data || [])
  }

  async function loadProduits() {
    const { data } = await supabase.from('produits').select('nom, categorie').eq('actif', true).order('categorie').order('nom')
    setProduits(data || [])
  }

  async function loadAchats() {
    setLoading(true)
    const { data } = await supabase
      .from('achats')
      .select('*, imputations(*)')
      .eq('semaine_id', semaineId)
      .order('date_achat')
    setAchats(data || [])
    setLoading(false)
  }

  function calcTTC() {
    const ht = parseFloat(form.total_ht)
    const tva = parseFloat(form.taux_tva)
    if (!isNaN(ht) && !isNaN(tva)) setForm(f => ({ ...f, total_ttc: (ht * (1 + tva)).toFixed(2) }))
  }

  async function handleSave() {
    if (!semaineId) return setAlert({ type: 'error', msg: 'Choisissez une semaine' })
    if (!form.article || !form.total_ttc) return setAlert({ type: 'error', msg: 'Article et montant TTC requis' })
    setLoading(true); setAlert(null)
    try {
      const payload = {
        semaine_id: semaineId,
        fournisseur: form.fournisseur,
        num_facture: form.num_facture || null,
        date_achat: form.date_achat || null,
        article: form.article,
        quantite: form.quantite ? parseFloat(form.quantite) : null,
        unite: form.unite || null,
        total_ht: form.total_ht ? parseFloat(form.total_ht) : null,
        taux_tva: parseFloat(form.taux_tva),
        total_ttc: parseFloat(form.total_ttc),
        article_stock_id: form.article_stock_id || null,
        quantite_stock: form.quantite_stock ? parseFloat(form.quantite_stock) : null,
        unite_stock: form.unite_stock || null,
      }
      if (editId) await supabase.from('achats').update(payload).eq('id', editId)
      else await supabase.from('achats').insert(payload)
      setAlert({ type: 'success', msg: editId ? 'Achat mis à jour' : 'Achat ajouté' })

      // Créer entrée stock si article stock lié
      if (form.article_stock_id && form.quantite_stock && parseFloat(form.quantite_stock) > 0) {
        const ttc = parseFloat(form.total_ttc) || 0
        const qteStock = parseFloat(form.quantite_stock)
        const coutUnitaire = qteStock > 0 ? ttc / qteStock : 0
        // Supprimer entrée existante pour cet achat si mise à jour
        if (editId) {
          await supabase.from('mouvements_stock').delete().eq('achat_id', editId)
        }
        const achatId = editId || null
        await supabase.from('mouvements_stock').insert({
          article_stock_id: form.article_stock_id,
          semaine_id: semaineId,
          achat_id: achatId,
          type_mouvement: 'entree',
          quantite: qteStock,
          cout_unitaire: Math.round(coutUnitaire * 10000) / 10000,
          cout_total: ttc,
          date_mouvement: form.date_achat || new Date().toISOString().slice(0, 10),
          notes: `Depuis achat : ${form.article} (${form.fournisseur})`,
        })
      }

      setForm(EMPTY_ACHAT); setEditId(null); setShowForm(false)
      loadAchats()
    } catch (e) { setAlert({ type: 'error', msg: e.message }) }
    setLoading(false)
  }

  async function handleDelete(id) {
    if (!confirm('Supprimer cet achat ?')) return
    await supabase.from('achats').delete().eq('id', id)
    loadAchats()
  }

  function startEdit(a) {
    setForm({
      ...a,
      date_achat: a.date_achat || '',
      article_stock_id: a.article_stock_id || '',
      quantite_stock: a.quantite_stock || '',
      unite_stock: a.unite_stock || '',
    })
    setEditId(a.id); setShowForm(true)
  }

  const totalAchats = achats.reduce((s, a) => s + (a.total_ttc || 0), 0)
  const nonImputés = achats.filter(a => !a.article_stock_id && !a.imputations?.length).length

  return (
    <div>
      {repartitionModal && (
        <RepartitionModal
          achat={repartitionModal}
          semaineId={semaineId}
          produits={produits}
          onSave={() => { setRepartitionModal(null); loadAchats() }}
          onClose={() => setRepartitionModal(null)}
        />
      )}

      <div className="page-header">
        <div>
          <p className="page-title">Saisie des achats</p>
          <p className="page-subtitle">Tickets de caisse et répartition automatique par produit</p>
        </div>
        <div className="flex-gap">
          <SemaineSelector value={semaineId} onChange={setSemaineId} />
          <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setEditId(null); setForm(EMPTY_ACHAT) }}>
            + Ajouter un achat
          </button>
        </div>
      </div>

      <div className="page-body">
        {alert && <div className={`alert alert-${alert.type}`}>{alert.msg}</div>}

        {/* Alerte achats non imputés */}
        {nonImputés > 0 && semaineId && (
          <div className="alert alert-warning">
            ⚠️ <strong>{nonImputés} achat(s)</strong> sans répartition — cliquez sur <strong>⚖️ Répartir</strong> pour imputer les coûts aux produits vendus.
          </div>
        )}

        {showForm && (
          <div className="card mb-16">
            <div className="card-title">{editId ? 'Modifier' : 'Nouvel'} achat</div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Fournisseur</label>
                <input className="form-input" value={form.fournisseur} onChange={e => setForm(f => ({ ...f, fournisseur: e.target.value }))} placeholder="PromoCash, Carrefour..." />
              </div>
              <div className="form-group">
                <label className="form-label">N° facture</label>
                <input className="form-input" value={form.num_facture} onChange={e => setForm(f => ({ ...f, num_facture: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Date</label>
                <input className="form-input" type="date" value={form.date_achat} onChange={e => setForm(f => ({ ...f, date_achat: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Article *</label>
                <input className="form-input" value={form.article} onChange={e => setForm(f => ({ ...f, article: e.target.value }))} placeholder="Bière, Farine, Saucisses..." />
              </div>
              <div className="form-group">
                <label className="form-label">Quantité</label>
                <input className="form-input" type="number" value={form.quantite} onChange={e => setForm(f => ({ ...f, quantite: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Unité</label>
                <input className="form-input" value={form.unite} onChange={e => setForm(f => ({ ...f, unite: e.target.value }))} placeholder="kg, L, bouteilles..." />
              </div>
              <div className="form-group">
                <label className="form-label">Total HT (€)</label>
                <input className="form-input" type="number" step="0.01" value={form.total_ht} onChange={e => setForm(f => ({ ...f, total_ht: e.target.value }))} onBlur={calcTTC} />
              </div>
              <div className="form-group">
                <label className="form-label">Taux TVA</label>
                <select className="form-select" value={form.taux_tva} onChange={e => setForm(f => ({ ...f, taux_tva: e.target.value }))} onBlur={calcTTC}>
                  <option value="0.055">5.5%</option>
                  <option value="0.1">10%</option>
                  <option value="0.2">20%</option>
                  <option value="0">0%</option>
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Total TTC (€) *</label>
                <input className="form-input" type="number" step="0.01" value={form.total_ttc} onChange={e => setForm(f => ({ ...f, total_ttc: e.target.value }))} style={{ maxWidth: 200 }} />
              </div>

              {/* Lien stock optionnel */}
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <div style={{ background:'var(--gray-50)', border:'1px solid var(--gray-200)', borderRadius:8, padding:12 }}>
                  <div style={{ fontWeight:600, fontSize:12, marginBottom:8, color:'var(--gray-500)' }}>
                    📦 Lien stock (optionnel) — si cet achat alimente le stock boissons
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:10 }}>
                    <div className="form-group">
                      <label className="form-label">Article stockable</label>
                      <select className="form-select" value={form.article_stock_id}
                        onChange={e => {
                          const art = articlesStock.find(a => a.id === e.target.value)
                          setForm(f => ({ ...f, article_stock_id: e.target.value, unite_stock: art?.unite_stock || '' }))
                        }}>
                        <option value="">— Aucun (pas en stock) —</option>
                        {articlesStock.map(a => <option key={a.id} value={a.id}>{a.nom} ({a.unite_stock})</option>)}
                      </select>
                    </div>
                    {form.article_stock_id && (
                      <>
                        <div className="form-group">
                          <label className="form-label">Quantité en stock</label>
                          <input className="form-input" type="number" step="0.01" min="0"
                            value={form.quantite_stock}
                            onChange={e => setForm(f => ({ ...f, quantite_stock: e.target.value }))}
                            placeholder="Ex: 60" />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Unité</label>
                          <input className="form-input" value={form.unite_stock} readOnly
                            style={{ background:'var(--gray-100)', color:'var(--gray-400)' }} />
                        </div>
                      </>
                    )}
                  </div>
                  {form.article_stock_id && form.quantite_stock && parseFloat(form.total_ttc) > 0 && (
                    <div style={{ fontSize:12, color:'var(--green)', marginTop:6, fontWeight:500 }}>
                      → Coût unitaire : {new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(parseFloat(form.total_ttc)/parseFloat(form.quantite_stock))} / {form.unite_stock}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex-gap mt-16">
              <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
                {loading ? <span className="spinner" /> : '💾'} {editId ? 'Mettre à jour' : 'Enregistrer'}
              </button>
              <button className="btn" onClick={() => { setShowForm(false); setEditId(null); setForm(EMPTY_ACHAT) }}>Annuler</button>
            </div>
          </div>
        )}

        {/* Liste achats */}
        <div className="card">
          <div className="flex-between mb-16">
            <div className="card-title" style={{ marginBottom: 0 }}>Achats enregistrés</div>
            <div className="flex-gap">
              {nonImputés > 0 && (
                <span className="badge badge-amber">{nonImputés} sans répartition</span>
              )}
              <span style={{ fontWeight: 700, fontSize: 15 }}>Total : {fmt(totalAchats)}</span>
            </div>
          </div>

          {!semaineId ? (
            <div className="empty-state">Sélectionnez une semaine</div>
          ) : achats.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🛒</div>
              <p>Aucun achat saisi pour cette semaine</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Fournisseur</th>
                    <th>Article</th>
                    <th>Qté</th>
                    <th className="num">TTC</th>
                    <th>Répartition</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {achats.map(a => (
                    <tr key={a.id} style={{ background: !a.imputations?.length ? 'var(--amber-light)' : '' }}>
                      <td>{a.date_achat}</td>
                      <td>{a.fournisseur}</td>
                      <td style={{ fontWeight: 500 }}>{a.article}</td>
                      <td>{a.quantite} {a.unite}</td>
                      <td className="num" style={{ fontWeight: 600 }}>{fmt(a.total_ttc)}</td>
                      <td>
                        {a.imputations?.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {a.imputations.map((imp, i) => (
                              <span key={i} className="badge badge-green" style={{ fontSize: 10 }} title={fmt(imp.cout_total_categorie)}>
                                {imp.produit_fini?.split(' ').slice(0, 2).join(' ')} · {fmt(imp.cout_total_categorie)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="badge badge-amber">⚠️ Non réparti</span>
                        )}
                      </td>
                      <td>
                        <div className="flex-gap">
                          {a.article_stock_id ? (
                            <span className="badge badge-blue" style={{ fontSize:10 }} title="Géré par le stock — entrée créée automatiquement">
                              📦 En stock
                            </span>
                          ) : (
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => setRepartitionModal(a)}
                              title="Répartir entre produits"
                            >
                              ⚖️ Répartir
                            </button>
                          )}
                          <button className="btn btn-sm" onClick={() => startEdit(a)}>✏️</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(a.id)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr className="tr-total">
                    <td colSpan={4}>Total</td>
                    <td className="num">{fmt(totalAchats)}</td>
                    <td colSpan={2}>
                      {nonImputés === 0
                        ? <span className="badge badge-green">✅ Tout réparti</span>
                        : <span className="badge badge-amber">{nonImputés} à répartir</span>}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
