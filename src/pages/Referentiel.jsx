import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/sumup'
import { useSortable } from '../hooks/useSortable.jsx'

// ─── Modal Catégorie ──────────────────────────────────────────────────────────
function CategorieModal({ cat, onSave, onClose }) {
  const [form, setForm] = useState({ nom: cat?.nom || '', icone: cat?.icone || '📦', ordre: cat?.ordre || 0 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!form.nom.trim()) return setError('Nom requis')
    setSaving(true); setError('')
    const payload = { nom: form.nom.trim(), icone: form.icone, ordre: parseInt(form.ordre) || 0 }
    let err
    if (cat?.id) {
      ({ error: err } = await supabase.from('categories').update(payload).eq('id', cat.id))
    } else {
      ({ error: err } = await supabase.from('categories').insert(payload))
    }
    if (err) { setError(err.message); setSaving(false); return }
    onSave()
  }

  const ICONES = ['🍺','🥐','👕','🎄','💝','❓','🛒','🍕','🎯','🎪','🏆','🎗️','🧃','🍫','🥤','🧁']

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'white', borderRadius:12, padding:28, width:380 }}>
        <div style={{ fontWeight:700, fontSize:16, marginBottom:20 }}>{cat?.id ? 'Modifier' : 'Nouvelle'} catégorie</div>
        {error && <div className="alert alert-error" style={{ marginBottom:12 }}>{error}</div>}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="form-group">
            <label className="form-label">Nom *</label>
            <input className="form-input" value={form.nom} onChange={e => setForm(f=>({...f,nom:e.target.value}))} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Icône</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {ICONES.map(ic => (
                <button key={ic} onClick={() => setForm(f=>({...f,icone:ic}))}
                  style={{ fontSize:20, padding:'4px 8px', border:`2px solid ${form.icone===ic?'var(--green)':'var(--gray-200)'}`, borderRadius:6, background:'none', cursor:'pointer' }}>
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Ordre d'affichage</label>
            <input className="form-input" type="number" value={form.ordre} onChange={e => setForm(f=>({...f,ordre:e.target.value}))} style={{ maxWidth:100 }} />
          </div>
        </div>
        <div className="flex-gap mt-16">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? <span className="spinner"/> : '💾'} {cat?.id ? 'Mettre à jour' : 'Créer'}</button>
          <button className="btn" onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Produit ────────────────────────────────────────────────────────────
function ProduitModal({ produit, categories, onSave, onClose }) {
  const [form, setForm] = useState({
    nom: produit?.nom || '',
    categorie: produit?.categorie || categories[0]?.nom || '',
    prix_vente: produit?.prix_vente || '',
    actif: produit?.actif ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!form.nom.trim()) return setError('Nom requis')
    if (!form.categorie) return setError('Catégorie requise')
    setSaving(true); setError('')
    const payload = { nom: form.nom.trim(), categorie: form.categorie, prix_vente: form.prix_vente ? parseFloat(form.prix_vente) : null, actif: form.actif }
    let err
    if (produit?.id) {
      ({ error: err } = await supabase.from('produits').update(payload).eq('id', produit.id))
    } else {
      ({ error: err } = await supabase.from('produits').insert(payload))
    }
    if (err) { setError(err.message); setSaving(false); return }
    onSave()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'white', borderRadius:12, padding:28, width:420 }}>
        <div style={{ fontWeight:700, fontSize:16, marginBottom:20 }}>{produit?.id ? 'Modifier' : 'Nouveau'} produit</div>
        {error && <div className="alert alert-error" style={{ marginBottom:12 }}>{error}</div>}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="form-group">
            <label className="form-label">Nom *</label>
            <input className="form-input" value={form.nom} onChange={e => setForm(f=>({...f,nom:e.target.value}))} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Catégorie *</label>
            <select className="form-select" value={form.categorie} onChange={e => setForm(f=>({...f,categorie:e.target.value}))}>
              {categories.map(c => <option key={c.id} value={c.nom}>{c.icone} {c.nom}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Prix de vente (€)</label>
            <input className="form-input" type="number" step="0.01" value={form.prix_vente} onChange={e => setForm(f=>({...f,prix_vente:e.target.value}))} style={{ maxWidth:150 }} />
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input type="checkbox" id="actif" checked={form.actif} onChange={e => setForm(f=>({...f,actif:e.target.checked}))} />
            <label htmlFor="actif" style={{ fontSize:13 }}>Produit actif</label>
          </div>
        </div>
        <div className="flex-gap mt-16">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? <span className="spinner"/> : '💾'} {produit?.id ? 'Mettre à jour' : 'Créer'}</button>
          <button className="btn" onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function ReferentielPage() {
  const [tab, setTab] = useState('produits') // produits | categories | paiements | parametres
  const [categories, setCategories] = useState([])
  const [produits, setProduits] = useState([])
  const [paiements, setPaiements] = useState([])
  const [parametres, setParametres] = useState({})
  const [loading, setLoading] = useState(true)
  const [catFilter, setCatFilter] = useState('Tous')
  const [showInactif, setShowInactif] = useState(false)
  const [search, setSearch] = useState('')
  const [catModal, setCatModal] = useState(null)
  const [prodModal, setProdModal] = useState(null)
  const [alert, setAlert] = useState(null)
  const [savingParam, setSavingParam] = useState(false)
  const [localParams, setLocalParams] = useState({})

  // Paiement form
  const [paiementForm, setPaiementForm] = useState({ nom: '', est_carte: true, ordre: 0 })

  // Mappings
  const [mappings, setMappings] = useState([])
  const [nomsSumup, setNomsSumup] = useState([])
  const [mappingLoading, setMappingLoading] = useState(false)
  const [editPaiementId, setEditPaiementId] = useState(null)
  const [showPaiementForm, setShowPaiementForm] = useState(false)

  const filtered = produits.filter(p => {
    if (!showInactif && !p.actif) return false
    if (catFilter !== 'Tous' && p.categorie !== catFilter) return false
    if (search && !p.nom.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })
  const { sorted, Th } = useSortable(filtered, 'nom', 'asc')

  useEffect(() => { load() }, [])
  useEffect(() => { if (tab === 'mappings') loadMappings() }, [tab])

  async function load() {
    setLoading(true)
    const [{ data: cats }, { data: prods }, { data: pays }, { data: params }] = await Promise.all([
      supabase.from('categories').select('*').order('ordre').order('nom'),
      supabase.from('produits').select('*').order('categorie').order('nom'),
      supabase.from('moyens_paiement').select('*').order('ordre').order('nom'),
      supabase.from('parametres').select('*'),
    ])
    setCategories(cats || [])
    setProduits(prods || [])
    setPaiements(pays || [])
    const paramMap = {}
    const localMap = {}
    params?.forEach(p => { paramMap[p.cle] = p; localMap[p.cle] = p.valeur })
    setParametres(paramMap)
    setLocalParams(localMap)
    setLoading(false)
  }

  // ── Paramètres ──────────────────────────────────────────────────────────────
  async function saveParam(cle) {
    setSavingParam(true)
    await supabase.from('parametres').update({ valeur: localParams[cle], updated_at: new Date().toISOString() }).eq('cle', cle)
    setAlert({ type: 'success', msg: 'Paramètre enregistré ✅' })
    setSavingParam(false)
    load()
  }

  // ── Moyens de paiement ───────────────────────────────────────────────────────
  async function savePaiement() {
    if (!paiementForm.nom.trim()) return setAlert({ type: 'error', msg: 'Nom requis' })
    const payload = { nom: paiementForm.nom.trim(), est_carte: paiementForm.est_carte, ordre: parseInt(paiementForm.ordre) || 0 }
    let err
    if (editPaiementId) {
      ({ error: err } = await supabase.from('moyens_paiement').update(payload).eq('id', editPaiementId))
    } else {
      ({ error: err } = await supabase.from('moyens_paiement').insert(payload))
    }
    if (err) return setAlert({ type: 'error', msg: err.message })
    setPaiementForm({ nom: '', est_carte: true, ordre: 0 })
    setEditPaiementId(null)
    setShowPaiementForm(false)
    setAlert({ type: 'success', msg: 'Moyen de paiement enregistré ✅' })
    load()
  }

  async function deletePaiement(p) {
    if (!confirm(`Supprimer "${p.nom}" ?`)) return
    await supabase.from('moyens_paiement').delete().eq('id', p.id)
    load()
  }

  async function togglePaiementActif(p) {
    await supabase.from('moyens_paiement').update({ actif: !p.actif }).eq('id', p.id)
    load()
  }

  function startEditPaiement(p) {
    setPaiementForm({ nom: p.nom, est_carte: p.est_carte, ordre: p.ordre })
    setEditPaiementId(p.id)
    setShowPaiementForm(true)
  }

  // ── Mappings ─────────────────────────────────────────────────────────────────
  async function loadMappings() {
    setMappingLoading(true)
    const [{ data: maps }, { data: ventes }] = await Promise.all([
      supabase.from('product_mappings').select('*').order('categorie').order('nom_sumup'),
      supabase.from('ventes').select('description, categorie').not('description', 'is', null).limit(50000),
    ])
    setMappings(maps || [])
    // Extraire noms SumUp distincts
    const distinct = {}
    ventes?.forEach(v => {
      if (v.description) distinct[v.description] = v.categorie
    })
    setNomsSumup(Object.entries(distinct).map(([nom, cat]) => ({ nom, categorie: cat })).sort((a,b) => a.nom.localeCompare(b.nom)))
    setMappingLoading(false)
  }

  async function saveMapping(nomSumup, produitOfficiel, categorie) {
    // Mise à jour optimiste immédiate de l'état local
    if (!produitOfficiel) {
      setMappings(prev => prev.filter(m => m.nom_sumup !== nomSumup))
    } else {
      setMappings(prev => {
        const exists = prev.find(m => m.nom_sumup === nomSumup)
        if (exists) {
          return prev.map(m => m.nom_sumup === nomSumup ? { ...m, produit_officiel: produitOfficiel, categorie } : m)
        }
        return [...prev, { nom_sumup: nomSumup, produit_officiel: produitOfficiel, categorie }]
      })
    }
    // Sauvegarde en base
    try {
      if (!produitOfficiel) {
        await supabase.from('product_mappings').delete().eq('nom_sumup', nomSumup)
      } else {
        const { data: existing } = await supabase
          .from('product_mappings').select('id').eq('nom_sumup', nomSumup).maybeSingle()
        if (existing?.id) {
          await supabase.from('product_mappings')
            .update({ produit_officiel: produitOfficiel, categorie })
            .eq('nom_sumup', nomSumup)
        } else {
          await supabase.from('product_mappings')
            .insert({ nom_sumup: nomSumup, produit_officiel: produitOfficiel, categorie })
        }
      }
    } catch(e) {
      console.error('saveMapping error:', e)
      // Recharger depuis la base en cas d'erreur
      loadMappings()
    }
  }

  // ── Catégories ───────────────────────────────────────────────────────────────
  async function deleteCategorie(cat) {
    const nb = produits.filter(p => p.categorie === cat.nom).length
    if (nb > 0) return setAlert({ type: 'error', msg: `Impossible : ${nb} produit(s) utilisent cette catégorie.` })
    if (!confirm(`Supprimer "${cat.nom}" ?`)) return
    await supabase.from('categories').delete().eq('id', cat.id)
    load()
  }

  async function deleteProduit(p) {
    if (!confirm(`Supprimer "${p.nom}" ?`)) return
    const { error } = await supabase.from('produits').delete().eq('id', p.id)
    if (error) return setAlert({ type: 'error', msg: error.message })
    load()
  }

  async function toggleActif(p) {
    await supabase.from('produits').update({ actif: !p.actif }).eq('id', p.id)
    load()
  }

  const catCounts = {}
  produits.forEach(p => { catCounts[p.categorie] = (catCounts[p.categorie] || 0) + 1 })

  const TABS = [
    ['produits', '🍺 Produits'],
    ['categories', '📂 Catégories'],
    ['paiements', '💳 Paiements'],
    ['mappings', '🔗 Associations SumUp'],
    ['parametres', '⚙️ Paramètres'],
  ]

  return (
    <div>
      {catModal !== null && (
        <CategorieModal cat={catModal === 'new' ? null : catModal} onSave={() => { setCatModal(null); load() }} onClose={() => setCatModal(null)} />
      )}
      {prodModal !== null && (
        <ProduitModal produit={prodModal === 'new' ? null : prodModal} categories={categories} onSave={() => { setProdModal(null); load() }} onClose={() => setProdModal(null)} />
      )}

      <div className="page-header">
        <div>
          <p className="page-title">📚 Référentiel</p>
          <p className="page-subtitle">Catégories, produits, paiements et paramètres</p>
        </div>
        {tab === 'categories' && <button className="btn btn-primary" onClick={() => setCatModal('new')}>+ Nouvelle catégorie</button>}
        {tab === 'produits' && <button className="btn btn-primary" onClick={() => setProdModal('new')}>+ Nouveau produit</button>}
        {tab === 'paiements' && (
          <button className="btn btn-primary" onClick={() => { setPaiementForm({ nom: '', est_carte: true, ordre: 0 }); setEditPaiementId(null); setShowPaiementForm(true) }}>
            + Nouveau moyen de paiement
          </button>
        )}
      </div>

      <div className="page-body">
        {alert && <div className={`alert alert-${alert.type}`} onClick={() => setAlert(null)}>{alert.msg}</div>}

        {/* Onglets */}
        <div style={{ display:'flex', gap:4, borderBottom:'0.5px solid var(--gray-200)', marginBottom:20 }}>
          {TABS.map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              padding:'8px 16px', border:'none', background:'none', cursor:'pointer', fontSize:13, fontWeight:500,
              borderBottom: tab===key ? '2px solid var(--green)' : '2px solid transparent',
              color: tab===key ? 'var(--green)' : 'var(--gray-400)', marginBottom:-1
            }}>{label}</button>
          ))}
        </div>

        {/* ── CATÉGORIES ── */}
        {tab === 'categories' && (
          <div className="card">
            <div className="card-title">Catégories ({categories.length})</div>
            {loading ? <div className="loading-page" style={{ minHeight:80 }}><div className="spinner"/></div> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Icône</th><th>Nom</th><th className="num">Ordre</th><th className="num">Nb produits</th><th></th></tr></thead>
                  <tbody>
                    {categories.map(c => (
                      <tr key={c.id}>
                        <td style={{ fontSize:24 }}>{c.icone}</td>
                        <td style={{ fontWeight:500 }}>{c.nom}</td>
                        <td className="num">{c.ordre}</td>
                        <td className="num"><span className="badge badge-gray">{catCounts[c.nom] || 0} produits</span></td>
                        <td>
                          <div className="flex-gap">
                            <button className="btn btn-sm" onClick={() => setCatModal(c)}>✏️</button>
                            <button className="btn btn-danger btn-sm" onClick={() => deleteCategorie(c)}>🗑️</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── PRODUITS ── */}
        {tab === 'produits' && (
          <>
            <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:16, flexWrap:'wrap' }}>
              <input className="form-input" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth:240 }} />
              <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                <button className={'btn btn-sm'+(catFilter==='Tous'?' btn-primary':'')} onClick={() => setCatFilter('Tous')}>Tous</button>
                {categories.map(c => (
                  <button key={c.id} className={'btn btn-sm'+(catFilter===c.nom?' btn-primary':'')} onClick={() => setCatFilter(c.nom)}>
                    {c.icone} {c.nom}
                  </button>
                ))}
              </div>
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, marginLeft:'auto', cursor:'pointer' }}>
                <input type="checkbox" checked={showInactif} onChange={e => setShowInactif(e.target.checked)} />
                Afficher inactifs
              </label>
            </div>
            <div className="card">
              <div className="flex-between mb-16">
                <div className="card-title" style={{ marginBottom:0 }}>{sorted.length} produit(s)</div>
                <div className="text-sm text-muted">{produits.filter(p => !p.actif).length} inactif(s)</div>
              </div>
              {loading ? <div className="loading-page" style={{ minHeight:80 }}><div className="spinner"/></div> : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <Th col="nom">Nom</Th>
                        <Th col="categorie">Catégorie</Th>
                        <Th col="prix_vente" className="num">Prix vente</Th>
                        <th>Statut</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map(p => (
                        <tr key={p.id} style={{ opacity: p.actif ? 1 : 0.5 }}>
                          <td style={{ fontWeight:500 }}>{p.nom}</td>
                          <td><span className="badge badge-gray">{categories.find(c => c.nom === p.categorie)?.icone || '📦'} {p.categorie}</span></td>
                          <td className="num">{p.prix_vente ? fmt(p.prix_vente) : '—'}</td>
                          <td>
                            <button onClick={() => toggleActif(p)} style={{ border:'none', background:'none', cursor:'pointer', padding:0 }}>
                              {p.actif ? <span className="badge badge-green">✅ Actif</span> : <span className="badge badge-gray">⏸ Inactif</span>}
                            </button>
                          </td>
                          <td>
                            <div className="flex-gap">
                              <button className="btn btn-sm" onClick={() => setProdModal(p)}>✏️</button>
                              <button className="btn btn-danger btn-sm" onClick={() => deleteProduit(p)}>🗑️</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── MOYENS DE PAIEMENT ── */}
        {tab === 'paiements' && (
          <div className="card">
            <div className="card-title">Moyens de paiement ({paiements.length})</div>
            <div className="alert alert-info mb-16">
              ℹ️ Les moyens marqués <strong>💳 Carte</strong> sont soumis aux frais SumUp. Les autres (espèces, virement...) ne le sont pas.
            </div>

            {showPaiementForm && (
              <div style={{ background:'var(--gray-50)', border:'1px solid var(--gray-200)', borderRadius:8, padding:16, marginBottom:16 }}>
                <div style={{ fontWeight:600, fontSize:13, marginBottom:12 }}>
                  {editPaiementId ? 'Modifier' : 'Nouveau'} moyen de paiement
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 80px', gap:10, marginBottom:12 }}>
                  <div className="form-group">
                    <label className="form-label">Nom *</label>
                    <input className="form-input" value={paiementForm.nom} onChange={e => setPaiementForm(f=>({...f,nom:e.target.value}))}
                      placeholder="Ex: Visa - Débit" autoFocus />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Type</label>
                    <select className="form-select" value={paiementForm.est_carte} onChange={e => setPaiementForm(f=>({...f,est_carte:e.target.value==='true'}))}>
                      <option value="true">💳 Carte bancaire (frais SumUp)</option>
                      <option value="false">💵 Espèces / Virement (sans frais)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Ordre</label>
                    <input className="form-input" type="number" value={paiementForm.ordre} onChange={e => setPaiementForm(f=>({...f,ordre:e.target.value}))} />
                  </div>
                </div>
                <div className="flex-gap">
                  <button className="btn btn-primary btn-sm" onClick={savePaiement}>💾 Enregistrer</button>
                  <button className="btn btn-sm" onClick={() => { setShowPaiementForm(false); setEditPaiementId(null) }}>Annuler</button>
                </div>
              </div>
            )}

            {loading ? <div className="loading-page" style={{ minHeight:80 }}><div className="spinner"/></div> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Nom</th><th>Type</th><th className="num">Ordre</th><th>Statut</th><th></th></tr></thead>
                  <tbody>
                    {paiements.map(p => (
                      <tr key={p.id} style={{ opacity: p.actif ? 1 : 0.5 }}>
                        <td style={{ fontWeight:500 }}>{p.nom}</td>
                        <td>
                          {p.est_carte
                            ? <span className="badge badge-blue">💳 Carte (frais SumUp)</span>
                            : <span className="badge badge-gray">💵 Sans frais</span>}
                        </td>
                        <td className="num">{p.ordre}</td>
                        <td>
                          <button onClick={() => togglePaiementActif(p)} style={{ border:'none', background:'none', cursor:'pointer', padding:0 }}>
                            {p.actif ? <span className="badge badge-green">✅ Actif</span> : <span className="badge badge-gray">⏸ Inactif</span>}
                          </button>
                        </td>
                        <td>
                          <div className="flex-gap">
                            <button className="btn btn-sm" onClick={() => startEditPaiement(p)}>✏️</button>
                            <button className="btn btn-danger btn-sm" onClick={() => deletePaiement(p)}>🗑️</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── MAPPINGS ── */}
        {tab === 'mappings' && (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div>
                <div style={{ fontWeight:600, fontSize:14 }}>Associations noms SumUp → Référentiel</div>
                <div style={{ fontSize:12, color:'var(--gray-400)', marginTop:2 }}>
                  Chaque nom SumUp peut être associé à un produit officiel de ton référentiel.
                  Les lignes <span style={{ color:'var(--amber)' }}>⚠️ sans association</span> sont comptées séparément dans les stats.
                </div>
              </div>
            </div>

            {mappingLoading ? <div className="loading-page" style={{ minHeight:80 }}><div className="spinner"/></div> : (
              <div className="card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Nom SumUp</th>
                        <th>Catégorie SumUp</th>
                        <th>→ Produit officiel (référentiel)</th>
                        <th>Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nomsSumup.map(({ nom, categorie: cat }) => {
                        const mapping = mappings.find(m => m.nom_sumup === nom)
                        const isMapped = !!mapping
                        return (
                          <tr key={nom} style={{ background: isMapped ? '' : 'var(--amber-light)' }}>
                            <td style={{ fontWeight:500 }}>{nom}</td>
                            <td><span className="badge badge-gray">{cat}</span></td>
                            <td>
                              <select
                                className="form-select"
                                style={{ maxWidth:280 }}
                                value={mapping?.produit_officiel || ''}
                                onChange={e => saveMapping(nom, e.target.value, cat)}
                              >
                                <option value="">— Aucune association —</option>
                                {['Boissons','Snacking','Boutique','Dons','Inconnu'].map(c => (
                                  <optgroup key={c} label={c}>
                                    {produits.filter(p => p.categorie === c && p.actif).map(p => (
                                      <option key={p.nom} value={p.nom}>{p.nom}</option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            </td>
                            <td>
                              {isMapped
                                ? <span className="badge badge-green">✅ Associé</span>
                                : <span className="badge badge-amber">⚠️ Non associé</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop:12, fontSize:12, color:'var(--gray-400)' }}>
                  {nomsSumup.length} noms SumUp · {mappings.length} associés · {nomsSumup.length - mappings.length} sans association
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PARAMÈTRES ── */}
        {tab === 'parametres' && (
          <div style={{ maxWidth: 600 }}>
            <div className="card mb-16">
              <div className="card-title">⚙️ Paramètres de calcul</div>

              {/* Taux SumUp */}
              <div style={{ borderBottom: '1px solid var(--gray-100)', paddingBottom: 20, marginBottom: 20 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  Taux de commission SumUp
                </div>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 12 }}>
                  {parametres['taux_sumup']?.description}
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ flex: 1, maxWidth: 160 }}>
                    <label className="form-label">Taux (%)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        className="form-input"
                        type="number"
                        step="0.01"
                        min="0"
                        max="10"
                        value={localParams['taux_sumup'] || ''}
                        onChange={e => setLocalParams(p => ({ ...p, taux_sumup: e.target.value }))}
                      />
                      <span style={{ color: 'var(--gray-400)', fontSize: 13 }}>%</span>
                    </div>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => saveParam('taux_sumup')} disabled={savingParam}>
                    {savingParam ? <span className="spinner"/> : '💾'} Enregistrer
                  </button>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--gray-400)' }}>
                  Valeur actuelle en base : <strong>{parametres['taux_sumup']?.valeur}%</strong> — 
                  appliquée au CA carte bancaire de chaque semaine
                </div>
              </div>

              {/* Libellé frais SumUp */}
              <div style={{ borderBottom: '1px solid var(--gray-100)', paddingBottom: 20, marginBottom: 20 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Libellé des frais SumUp (dans les achats)</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <input
                      className="form-input"
                      value={localParams['frais_sumup_libelle'] || ''}
                      onChange={e => setLocalParams(p => ({ ...p, frais_sumup_libelle: e.target.value }))}
                    />
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => saveParam('frais_sumup_libelle')} disabled={savingParam}>
                    💾 Enregistrer
                  </button>
                </div>
              </div>

              {/* Libellé écart caisse */}
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Libellé de l'écart de caisse (dans les ventes)</div>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 12 }}>
                  Affiché dans les ventes comme recette "cash on the way"
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <input
                      className="form-input"
                      value={localParams['ecart_caisse_libelle'] || ''}
                      onChange={e => setLocalParams(p => ({ ...p, ecart_caisse_libelle: e.target.value }))}
                    />
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => saveParam('ecart_caisse_libelle')} disabled={savingParam}>
                    💾 Enregistrer
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
