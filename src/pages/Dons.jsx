import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/sumup'
import SemaineSelector from '../components/SemaineSelector.jsx'

const EMPTY_DON = {
  association: '',
  description: '',
  type_calcul: 'pct_marge',
  taux: '',
  perimetre: 'total',
  categorie: '',
  produits_sel: [],
  notes: '',
}

const TYPE_LABELS = {
  pct_marge: '% de la marge',
  montant_fixe_par_produit: 'Montant fixe par produit vendu',
  pct_ca: '% du CA',
}

const TYPE_ICONS = {
  pct_marge: '📈',
  montant_fixe_par_produit: '🪙',
  pct_ca: '💰',
}

const CATEGORIES = ['Boissons', 'Snacking', 'Boutique', 'Dons', 'Inconnu']
const STATUT_COLORS = { calcule: 'badge-amber', verse: 'badge-green', annule: 'badge-gray' }
const STATUT_LABELS = { calcule: '📊 Calculé', verse: '✅ Versé', annule: '❌ Annulé' }

export default function DonsPage() {
  const [semaineId, setSemaineId] = useState('')
  const [semaine, setSemaine] = useState(null)
  const [dons, setDons] = useState([])
  const [produits, setProduits] = useState([])
  const [ventesData, setVentesData] = useState(null)
  const [achatsData, setAchatsData] = useState(null)
  const [sortiesStockData, setSortiesStockData] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_DON)
  const [editId, setEditId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [alert, setAlert] = useState(null)
  const [preview, setPreview] = useState(null)

  useEffect(() => { loadProduits() }, [])
  useEffect(() => {
    if (semaineId) { loadDons(); loadSemaineData() }
  }, [semaineId])

  async function loadProduits() {
    const { data } = await supabase.from('produits').select('nom, categorie').eq('actif', true).order('categorie').order('nom')
    setProduits(data || [])
  }

  async function loadSemaineData() {
    const { data: sem } = await supabase.from('semaines').select('*').eq('id', semaineId).single()
    setSemaine(sem)

    const { data: ventes } = await supabase
      .from('ventes')
      .select('description, categorie, quantite, prix_ttc, type_transaction')
      .eq('semaine_id', semaineId)
      .eq('type_transaction', 'Vente')
      .limit(10000)

    const { data: achats } = await supabase
      .from('achats')
      .select('total_ttc, article_stock_id, fournisseur, imputations(produit_fini, categorie, cout_total_categorie)')
      .eq('semaine_id', semaineId)

    const { data: mvtsStock } = await supabase
      .from('mouvements_stock')
      .select('cout_total, article_stock_id, articles_stock(categorie)')
      .eq('semaine_id', semaineId)
      .eq('type_mouvement', 'sortie')
      .eq('envoye_bilan', true)

    setVentesData(ventes || [])
    setAchatsData(achats || [])
    setSortiesStockData(mvtsStock || [])
  }

  async function loadDons() {
    setLoading(true)
    const { data } = await supabase
      .from('dons')
      .select('*')
      .eq('semaine_id', semaineId)
      .order('created_at')
    setDons(data || [])
    setLoading(false)
  }

  // ── Calcul du montant du don selon les paramètres ──────────────────────────
  function calculerDon(f, ventes, achats, sortiesStock) {
    if (!ventes || !achats) return { base: 0, montant: 0 }
    const taux = parseFloat(f.taux) || 0

    // Filtrer les ventes selon le périmètre
    let ventesFiltered = ventes
    if (f.perimetre === 'categorie' && f.categorie) {
      ventesFiltered = ventes.filter(v => v.categorie === f.categorie)
    } else if (f.perimetre === 'produits' && f.produits_sel?.length) {
      ventesFiltered = ventes.filter(v => f.produits_sel.includes(v.description))
    }

    const ca = ventesFiltered.reduce((s, v) => s + (v.prix_ttc || 0), 0)

    // Calcul des achats imputés sur ce périmètre (hors stock — ceux-ci viennent des sorties)
    let coutAchats = 0
    ;(achats || []).filter(a => !a.article_stock_id && a.fournisseur !== 'Stock').forEach(a => {
      a.imputations?.forEach(imp => {
        if (f.perimetre === 'total') {
          coutAchats += imp.cout_total_categorie || 0
        } else if (f.perimetre === 'categorie' && imp.categorie === f.categorie) {
          coutAchats += imp.cout_total_categorie || 0
        } else if (f.perimetre === 'produits' && f.produits_sel?.includes(imp.produit_fini)) {
          coutAchats += imp.cout_total_categorie || 0
        }
      })
    })

    // Ajouter les sorties stock validées (coût réel des boissons consommées)
    // (sortiesStock est le paramètre de la fonction)
    ;(sortiesStock || []).forEach(m => {
      const catStock = m.articles_stock?.categorie || 'Boissons'
      if (f.perimetre === 'total') {
        coutAchats += m.cout_total || 0
      } else if (f.perimetre === 'categorie' && catStock === f.categorie) {
        coutAchats += m.cout_total || 0
      }
      // Note: pour périmètre 'produits', les sorties stock ne peuvent pas être imputées à un produit spécifique
    })

    const marge = ca - coutAchats

    let base = 0, montant = 0
    if (f.type_calcul === 'pct_marge') {
      base = marge
      montant = marge * taux
    } else if (f.type_calcul === 'pct_ca') {
      base = ca
      montant = ca * taux
    } else if (f.type_calcul === 'montant_fixe_par_produit') {
      const qte = ventesFiltered.reduce((s, v) => s + (v.quantite || 0), 0)
      base = qte
      montant = qte * taux
    }

    return { base: Math.round(base * 100) / 100, montant: Math.round(montant * 100) / 100 }
  }

  // Mise à jour preview en temps réel
  useEffect(() => {
    if (ventesData && achatsData && form.taux) {
      const result = calculerDon(form, ventesData, achatsData, sortiesStockData)
      setPreview(result)
    } else {
      setPreview(null)
    }
  }, [form, ventesData, achatsData])

  async function handleSave() {
    if (!semaineId) return setAlert({ type: 'error', msg: 'Sélectionnez une semaine' })
    if (!form.association) return setAlert({ type: 'error', msg: 'Association requise' })
    if (!form.taux) return setAlert({ type: 'error', msg: 'Taux/montant requis' })

    setSaving(true); setAlert(null)
    const { base, montant } = calculerDon(form, ventesData, achatsData, sortiesStockData)

    const payload = {
      semaine_id: semaineId,
      association: form.association,
      description: form.description || null,
      type_calcul: form.type_calcul,
      taux: parseFloat(form.taux),
      perimetre: form.perimetre,
      categorie: form.perimetre === 'categorie' ? form.categorie : null,
      produits: form.perimetre === 'produits' ? form.produits_sel : null,
      base_calcul: base,
      montant_calcule: montant,
      notes: form.notes || null,
      statut: 'calcule',
    }

    if (editId) await supabase.from('dons').update(payload).eq('id', editId)
    else await supabase.from('dons').insert(payload)

    setAlert({ type: 'success', msg: `Don calculé : ${fmt(montant)} pour ${form.association}` })
    setForm(EMPTY_DON); setEditId(null); setShowForm(false)
    loadDons()
    setSaving(false)
  }

  async function handleVerse(don) {
    const montant = prompt(`Montant versé à ${don.association} (€) :`, don.montant_calcule)
    if (montant === null) return
    await supabase.from('dons').update({
      statut: 'verse',
      montant_verse: parseFloat(montant),
      date_versement: new Date().toISOString().slice(0, 10),
    }).eq('id', don.id)
    loadDons()
  }

  async function handleDelete(id) {
    if (!confirm('Supprimer ce don ?')) return
    await supabase.from('dons').delete().eq('id', id)
    loadDons()
  }

  function startEdit(don) {
    setForm({
      association: don.association,
      description: don.description || '',
      type_calcul: don.type_calcul,
      taux: don.taux,
      perimetre: don.perimetre,
      categorie: don.categorie || '',
      produits_sel: don.produits || [],
      notes: don.notes || '',
    })
    setEditId(don.id)
    setShowForm(true)
  }

  const totalDons = dons.filter(d => d.statut !== 'annule').reduce((s, d) => s + (d.montant_calcule || 0), 0)
  const totalVerse = dons.filter(d => d.statut === 'verse').reduce((s, d) => s + (d.montant_verse || 0), 0)

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="page-title">💝 Dons & Actions caritatives</p>
          <p className="page-subtitle">Paramétrage et suivi des reversements aux associations</p>
        </div>
        <div className="flex-gap">
          <SemaineSelector value={semaineId} onChange={setSemaineId} />
          <button className="btn no-print" onClick={() => window.print()}>🖨️ Imprimer</button>
          {semaineId && (
            <button className="btn btn-primary no-print" onClick={() => { setShowForm(!showForm); setEditId(null); setForm(EMPTY_DON) }}>
              + Ajouter un don
            </button>
          )}
        </div>
      </div>

      <div className="page-body">
        {alert && <div className={`alert alert-${alert.type}`}>{alert.msg}</div>}

        {!semaineId ? (
          <div className="empty-state">
            <div className="empty-state-icon">💝</div>
            <p>Sélectionnez une semaine pour gérer les dons</p>
          </div>
        ) : (
          <>
            {/* Formulaire */}
            {showForm && (
              <div className="card mb-16">
                <div className="card-title">{editId ? 'Modifier le don' : 'Nouveau don'}</div>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Association bénéficiaire *</label>
                    <input className="form-input" value={form.association} onChange={e => setForm(f => ({ ...f, association: e.target.value }))}
                      placeholder="Octobre Rose, Resto du Cœur..." />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Description (optionnel)</label>
                    <input className="form-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Ex: 50% de la marge buvette reversé..." />
                  </div>
                </div>

                <hr className="divider" />
                <div className="card-title">Type de calcul</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                  {Object.entries(TYPE_LABELS).map(([key, label]) => (
                    <button key={key} className={'btn' + (form.type_calcul === key ? ' btn-primary' : '')}
                      onClick={() => setForm(f => ({ ...f, type_calcul: key }))}>
                      {TYPE_ICONS[key]} {label}
                    </button>
                  ))}
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">
                      {form.type_calcul === 'montant_fixe_par_produit' ? 'Montant par produit (€) *' : 'Taux (%) *'}
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input className="form-input" type="number" step="0.01" min="0" max={form.type_calcul !== 'montant_fixe_par_produit' ? "100" : undefined}
                        value={form.taux} onChange={e => setForm(f => ({ ...f, taux: e.target.value }))}
                        placeholder={form.type_calcul === 'montant_fixe_par_produit' ? '0.50' : '50'} />
                      {form.type_calcul !== 'montant_fixe_par_produit' && <span style={{ whiteSpace: 'nowrap', color: 'var(--gray-400)' }}>%</span>}
                    </div>
                    <div className="text-muted text-sm mt-4">
                      {form.type_calcul === 'pct_marge' && 'Ex: 50 = 50% de la marge nette reversé'}
                      {form.type_calcul === 'pct_ca' && 'Ex: 10 = 10% du chiffre d\'affaires reversé'}
                      {form.type_calcul === 'montant_fixe_par_produit' && 'Ex: 0.50 = 0,50€ reversé par produit vendu'}
                    </div>
                  </div>
                </div>

                <hr className="divider" />
                <div className="card-title">Périmètre du don</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  {[['total', '🛒 Toute la buvette'], ['categorie', '📂 Une catégorie'], ['produits', '🎯 Produits spécifiques']].map(([key, label]) => (
                    <button key={key} className={'btn' + (form.perimetre === key ? ' btn-primary' : '')}
                      onClick={() => setForm(f => ({ ...f, perimetre: key }))}>
                      {label}
                    </button>
                  ))}
                </div>

                {form.perimetre === 'categorie' && (
                  <div className="form-group" style={{ maxWidth: 300 }}>
                    <label className="form-label">Catégorie</label>
                    <select className="form-select" value={form.categorie} onChange={e => setForm(f => ({ ...f, categorie: e.target.value }))}>
                      <option value="">— Choisir —</option>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}

                {form.perimetre === 'produits' && (
                  <div>
                    <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>Produits concernés</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {CATEGORIES.map(cat => (
                        <div key={cat} style={{ width: '100%' }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', marginBottom: 4, marginTop: 8 }}>{cat}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {produits.filter(p => p.categorie === cat).map(p => {
                              const sel = form.produits_sel.includes(p.nom)
                              return (
                                <button key={p.nom} className={'btn btn-sm' + (sel ? ' btn-primary' : '')}
                                  style={{ fontSize: 11, padding: '3px 8px' }}
                                  onClick={() => setForm(f => ({
                                    ...f,
                                    produits_sel: sel ? f.produits_sel.filter(s => s !== p.nom) : [...f.produits_sel, p.nom]
                                  }))}>
                                  {sel ? '✓ ' : ''}{p.nom}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preview calcul */}
                {preview && (
                  <div style={{
                    background: 'var(--green-light)', border: '1px solid rgba(26,107,60,.2)',
                    borderRadius: 8, padding: 16, marginTop: 16
                  }}>
                    <div style={{ fontWeight: 700, color: 'var(--green)', marginBottom: 8 }}>
                      📊 Estimation du don
                    </div>
                    <div style={{ display: 'flex', gap: 24, fontSize: 13 }}>
                      <div>
                        <div style={{ color: 'var(--gray-400)', fontSize: 11 }}>
                          {form.type_calcul === 'montant_fixe_par_produit' ? 'Quantité vendue' : 'Base de calcul'}
                        </div>
                        <div style={{ fontWeight: 600 }}>
                          {form.type_calcul === 'montant_fixe_par_produit'
                            ? `${Math.round(preview.base)} produits`
                            : fmt(preview.base)}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--gray-400)', fontSize: 11 }}>Taux appliqué</div>
                        <div style={{ fontWeight: 600 }}>
                          {form.type_calcul === 'montant_fixe_par_produit'
                            ? `${fmt(parseFloat(form.taux) || 0)} × produit`
                            : `${form.taux}%`}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--gray-400)', fontSize: 11 }}>Don calculé</div>
                        <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--green)' }}>
                          {fmt(preview.montant)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="form-group mt-16">
                  <label className="form-label">Notes</label>
                  <input className="form-input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Notes libres..." />
                </div>

                <div className="flex-gap mt-16">
                  <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? <span className="spinner" /> : '💾'} {editId ? 'Mettre à jour' : 'Enregistrer le don'}
                  </button>
                  <button className="btn" onClick={() => { setShowForm(false); setEditId(null); setForm(EMPTY_DON) }}>Annuler</button>
                </div>
              </div>
            )}

            {/* KPIs */}
            {dons.length > 0 && (
              <div className="metrics-grid mb-16">
                <div className="metric-card" style={{ borderLeft: '3px solid var(--green)' }}>
                  <div className="metric-label">Total dons calculés</div>
                  <div className="metric-value" style={{ color: 'var(--green)' }}>{fmt(totalDons)}</div>
                  <div className="metric-sub">{dons.filter(d => d.statut !== 'annule').length} association(s)</div>
                </div>
                <div className="metric-card green">
                  <div className="metric-label">Déjà versé</div>
                  <div className="metric-value">{fmt(totalVerse)}</div>
                  <div className="metric-sub">{dons.filter(d => d.statut === 'verse').length} versement(s)</div>
                </div>
                <div className="metric-card amber">
                  <div className="metric-label">En attente de versement</div>
                  <div className="metric-value">{fmt(totalDons - totalVerse)}</div>
                  <div className="metric-sub">{dons.filter(d => d.statut === 'calcule').length} à verser</div>
                </div>
              </div>
            )}

            {/* Liste dons */}
            <div className="card">
              <div className="card-title">Dons de la semaine</div>
              {loading ? <div className="loading-page" style={{ minHeight: 80 }}><div className="spinner" /></div>
                : dons.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">💝</div>
                    <p>Aucun don configuré pour cette semaine</p>
                    <p className="text-sm mt-4">Cliquez sur "+ Ajouter un don" pour configurer un reversement caritatif.</p>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Association</th>
                          <th>Type</th>
                          <th>Périmètre</th>
                          <th className="num">Base calcul</th>
                          <th className="num">Don calculé</th>
                          <th className="num">Versé</th>
                          <th>Statut</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {dons.map(d => (
                          <tr key={d.id}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{d.association}</div>
                              {d.description && <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{d.description}</div>}
                            </td>
                            <td>
                              <span style={{ fontSize: 12 }}>
                                {TYPE_ICONS[d.type_calcul]} {TYPE_LABELS[d.type_calcul]}
                                <br />
                                <span style={{ color: 'var(--gray-400)', fontSize: 11 }}>
                                  {d.type_calcul === 'montant_fixe_par_produit'
                                    ? `${fmt(d.taux)} / produit`
                                    : `${Math.round(d.taux * 100)}%`}
                                </span>
                              </span>
                            </td>
                            <td>
                              {d.perimetre === 'total' && <span className="badge badge-blue">Toute la buvette</span>}
                              {d.perimetre === 'categorie' && <span className="badge badge-gray">{d.categorie}</span>}
                              {d.perimetre === 'produits' && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                                  {d.produits?.slice(0, 2).map((p, i) => (
                                    <span key={i} className="badge badge-gray" style={{ fontSize: 10 }}>{p.split(' ')[0]}</span>
                                  ))}
                                  {d.produits?.length > 2 && <span className="badge badge-gray" style={{ fontSize: 10 }}>+{d.produits.length - 2}</span>}
                                </div>
                              )}
                            </td>
                            <td className="num">
                              {d.type_calcul === 'montant_fixe_par_produit'
                                ? `${Math.round(d.base_calcul)} produits`
                                : fmt(d.base_calcul)}
                            </td>
                            <td className="num positive" style={{ fontSize: 15, fontWeight: 700 }}>{fmt(d.montant_calcule)}</td>
                            <td className="num">{d.montant_verse ? fmt(d.montant_verse) : '—'}</td>
                            <td><span className={`badge ${STATUT_COLORS[d.statut]}`}>{STATUT_LABELS[d.statut]}</span></td>
                            <td>
                              <div className="flex-gap">
                                {d.statut === 'calcule' && (
                                  <button className="btn btn-sm btn-primary" onClick={() => handleVerse(d)} title="Marquer comme versé">
                                    ✅ Versé
                                  </button>
                                )}
                                <button className="btn btn-sm" onClick={() => startEdit(d)}>✏️</button>
                                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(d.id)}>🗑️</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        <tr className="tr-total">
                          <td colSpan={4}>Total</td>
                          <td className="num positive">{fmt(totalDons)}</td>
                          <td className="num">{totalVerse ? fmt(totalVerse) : '—'}</td>
                          <td colSpan={2}></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
            </div>

            {/* Note bilan */}
            {dons.length > 0 && (
              <div className="alert alert-info mt-16">
                ℹ️ Les dons (<strong>{fmt(totalDons)}</strong>) apparaissent automatiquement comme charge dans le bilan de la semaine, réduisant la marge nette.
              </div>
            )}
          </>
        )}
      </div>
    
      <style>{`
        @media print {
          .sidebar, .no-print, button, .btn, select, input { display: none !important; }
          .print-show { display: block !important; }
          .app-layout { display: block !important; }
          .main-content { margin-left: 0 !important; padding: 0 !important; }
          .page-body { padding: 0 !important; }
          .card { box-shadow: none !important; border: 1px solid #ddd !important; break-inside: avoid; page-break-inside: avoid; margin-bottom: 12px !important; }
          table { font-size: 11px; width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd !important; padding: 4px 7px !important; }
          th { background: #6B3FA0 !important; color: white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          tr { break-inside: avoid; page-break-inside: avoid; }
          .badge { border: 1px solid #ccc !important; font-size: 9px !important; }
          .positive { color: #1A6B3C !important; }
          .negative { color: #DC2626 !important; }
          .tr-total td { background: #f5f5f5 !important; font-weight: 700 !important; }
          .recharts-wrapper, .recharts-responsive-container { display: none !important; }
          .metrics-grid { display: grid !important; grid-template-columns: repeat(3, 1fr) !important; gap: 8px !important; }
          .metric-card { border: 1px solid #ddd !important; padding: 8px !important; }
          @page { margin: 15mm 12mm; size: A4 portrait; }
        }
      `}</style>
    </div>
  )
}
