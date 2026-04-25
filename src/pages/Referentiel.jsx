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
        <div style={{ fontWeight:700, fontSize:16, marginBottom:20 }}>
          {cat?.id ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
        </div>
        {error && <div className="alert alert-error" style={{ marginBottom:12 }}>{error}</div>}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="form-group">
            <label className="form-label">Nom *</label>
            <input className="form-input" value={form.nom} onChange={e => setForm(f=>({...f,nom:e.target.value}))} placeholder="Ex: Boissons chaudes" autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Icône</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
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
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner"/> : '💾'} {cat?.id ? 'Mettre à jour' : 'Créer'}
          </button>
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
    const payload = {
      nom: form.nom.trim(),
      categorie: form.categorie,
      prix_vente: form.prix_vente ? parseFloat(form.prix_vente) : null,
      actif: form.actif,
    }
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
        <div style={{ fontWeight:700, fontSize:16, marginBottom:20 }}>
          {produit?.id ? 'Modifier le produit' : 'Nouveau produit'}
        </div>
        {error && <div className="alert alert-error" style={{ marginBottom:12 }}>{error}</div>}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="form-group">
            <label className="form-label">Nom du produit *</label>
            <input className="form-input" value={form.nom} onChange={e => setForm(f=>({...f,nom:e.target.value}))} placeholder="Ex: Verre bière" autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Catégorie *</label>
            <select className="form-select" value={form.categorie} onChange={e => setForm(f=>({...f,categorie:e.target.value}))}>
              {categories.map(c => <option key={c.id} value={c.nom}>{c.icone} {c.nom}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Prix de vente (€)</label>
            <input className="form-input" type="number" step="0.01" value={form.prix_vente} onChange={e => setForm(f=>({...f,prix_vente:e.target.value}))} placeholder="Ex: 2.50" style={{ maxWidth:150 }} />
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input type="checkbox" id="actif" checked={form.actif} onChange={e => setForm(f=>({...f,actif:e.target.checked}))} />
            <label htmlFor="actif" style={{ fontSize:13 }}>Produit actif (visible dans les listes)</label>
          </div>
        </div>
        <div className="flex-gap mt-16">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner"/> : '💾'} {produit?.id ? 'Mettre à jour' : 'Créer'}
          </button>
          <button className="btn" onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function ReferentielPage() {
  const [tab, setTab] = useState('produits') // produits | categories
  const [categories, setCategories] = useState([])
  const [produits, setProduits] = useState([])
  const [loading, setLoading] = useState(true)
  const [catFilter, setCatFilter] = useState('Tous')
  const [showInactif, setShowInactif] = useState(false)
  const [search, setSearch] = useState('')
  const [catModal, setCatModal] = useState(null)
  const [prodModal, setProdModal] = useState(null)
  const [alert, setAlert] = useState(null)

  const filtered = produits.filter(p => {
    if (!showInactif && !p.actif) return false
    if (catFilter !== 'Tous' && p.categorie !== catFilter) return false
    if (search && !p.nom.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })
  const { sorted, Th } = useSortable(filtered, 'nom', 'asc')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: cats }, { data: prods }] = await Promise.all([
      supabase.from('categories').select('*').order('ordre').order('nom'),
      supabase.from('produits').select('*').order('categorie').order('nom'),
    ])
    setCategories(cats || [])
    setProduits(prods || [])
    setLoading(false)
  }

  async function deleteCategorie(cat) {
    const nb = produits.filter(p => p.categorie === cat.nom).length
    if (nb > 0) {
      return setAlert({ type:'error', msg:`Impossible : ${nb} produit(s) utilisent cette catégorie. Réaffectez-les d'abord.` })
    }
    if (!confirm(`Supprimer la catégorie "${cat.nom}" ?`)) return
    await supabase.from('categories').delete().eq('id', cat.id)
    load()
  }

  async function deleteProduit(p) {
    if (!confirm(`Supprimer le produit "${p.nom}" ?`)) return
    const { error } = await supabase.from('produits').delete().eq('id', p.id)
    if (error) return setAlert({ type:'error', msg: error.message })
    load()
  }

  async function toggleActif(p) {
    await supabase.from('produits').update({ actif: !p.actif }).eq('id', p.id)
    load()
  }

  const catCounts = {}
  produits.forEach(p => { catCounts[p.categorie] = (catCounts[p.categorie] || 0) + 1 })

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
          <p className="page-subtitle">Gestion des catégories et des produits</p>
        </div>
        <button className="btn btn-primary" onClick={() => tab === 'categories' ? setCatModal('new') : setProdModal('new')}>
          + {tab === 'categories' ? 'Nouvelle catégorie' : 'Nouveau produit'}
        </button>
      </div>

      <div className="page-body">
        {alert && <div className={`alert alert-${alert.type}`} onClick={() => setAlert(null)}>{alert.msg}</div>}

        {/* Onglets */}
        <div style={{ display:'flex', gap:4, borderBottom:'0.5px solid var(--gray-200)', marginBottom:20 }}>
          {[['produits','🍺 Produits'], ['categories','📂 Catégories']].map(([key, label]) => (
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
                  <thead>
                    <tr>
                      <th>Icône</th>
                      <th>Nom</th>
                      <th className="num">Ordre</th>
                      <th className="num">Nb produits</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map(c => (
                      <tr key={c.id}>
                        <td style={{ fontSize:24 }}>{c.icone}</td>
                        <td style={{ fontWeight:500 }}>{c.nom}</td>
                        <td className="num">{c.ordre}</td>
                        <td className="num">
                          <span className="badge badge-gray">{catCounts[c.nom] || 0} produits</span>
                        </td>
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
            <div className="alert alert-warning mt-16">
              ⚠️ Supprimer une catégorie est impossible si des produits y sont rattachés. Réaffectez-les d'abord.
            </div>
          </div>
        )}

        {/* ── PRODUITS ── */}
        {tab === 'produits' && (
          <>
            {/* Filtres */}
            <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:16, flexWrap:'wrap' }}>
              <input className="form-input" placeholder="Rechercher un produit..." value={search}
                onChange={e => setSearch(e.target.value)} style={{ maxWidth:240 }} />
              <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                <button className={'btn btn-sm' + (catFilter==='Tous' ? ' btn-primary' : '')} onClick={() => setCatFilter('Tous')}>Tous</button>
                {categories.map(c => (
                  <button key={c.id} className={'btn btn-sm' + (catFilter===c.nom ? ' btn-primary' : '')} onClick={() => setCatFilter(c.nom)}>
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
                <div className="card-title" style={{ marginBottom:0 }}>
                  {sorted.length} produit(s)
                  {catFilter !== 'Tous' && <span style={{ marginLeft:8 }} className="badge badge-green">{catFilter}</span>}
                </div>
                <div className="text-sm text-muted">
                  {produits.filter(p => !p.actif).length} inactif(s)
                </div>
              </div>

              {loading ? <div className="loading-page" style={{ minHeight:80 }}><div className="spinner"/></div> : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <Th col="nom">Nom du produit</Th>
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
                          <td>
                            <span className="badge badge-gray">
                              {categories.find(c => c.nom === p.categorie)?.icone || '📦'} {p.categorie}
                            </span>
                          </td>
                          <td className="num">{p.prix_vente ? fmt(p.prix_vente) : '—'}</td>
                          <td>
                            <button onClick={() => toggleActif(p)} style={{ border:'none', background:'none', cursor:'pointer', padding:0 }}>
                              {p.actif
                                ? <span className="badge badge-green">✅ Actif</span>
                                : <span className="badge badge-gray">⏸ Inactif</span>}
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
      </div>
    </div>
  )
}
