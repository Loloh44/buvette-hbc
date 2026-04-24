import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/sumup'
import SemaineSelector from '../components/SemaineSelector.jsx'

const EMPTY_ACHAT = {
  fournisseur: '', num_facture: '', date_achat: new Date().toISOString().slice(0, 10),
  article: '', quantite: '', unite: '', total_ht: '', taux_tva: 0.055, total_ttc: ''
}

export default function AchatsPage() {
  const [semaineId, setSemaineId] = useState('')
  const [achats, setAchats] = useState([])
  const [produits, setProduits] = useState([])
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState(null)
  const [form, setForm] = useState(EMPTY_ACHAT)
  const [imputations, setImputations] = useState([{ produit_fini: '', quantite_categorie: '', cout_total_categorie: '' }])
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    loadProduits()
  }, [])

  useEffect(() => {
    if (semaineId) loadAchats()
  }, [semaineId])

  async function loadProduits() {
    const { data } = await supabase.from('produits').select('nom, categorie').eq('actif', true).order('nom')
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
    if (!isNaN(ht) && !isNaN(tva)) {
      setForm(f => ({ ...f, total_ttc: (ht * (1 + tva)).toFixed(4) }))
    }
  }

  async function handleSave() {
    if (!semaineId) return setAlert({ type: 'error', msg: 'Choisissez une semaine' })
    if (!form.article || !form.total_ttc) return setAlert({ type: 'error', msg: 'Article et montant TTC requis' })
    setLoading(true)
    setAlert(null)
    try {
      const achatData = {
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
      }

      let achatId = editId
      if (editId) {
        await supabase.from('achats').update(achatData).eq('id', editId)
        await supabase.from('imputations').delete().eq('achat_id', editId)
      } else {
        const { data } = await supabase.from('achats').insert(achatData).select().single()
        achatId = data.id
      }

      // Insert imputations
      const validImputations = imputations.filter(i => i.produit_fini && i.cout_total_categorie)
      if (validImputations.length > 0) {
        await supabase.from('imputations').insert(
          validImputations.map(i => ({
            achat_id: achatId,
            produit_fini: i.produit_fini,
            categorie: produits.find(p => p.nom === i.produit_fini)?.categorie || null,
            quantite_totale: i.quantite_totale ? parseFloat(i.quantite_totale) : null,
            quantite_categorie: i.quantite_categorie ? parseFloat(i.quantite_categorie) : null,
            cout_unitaire: i.cout_unitaire ? parseFloat(i.cout_unitaire) : null,
            cout_total_categorie: parseFloat(i.cout_total_categorie),
          }))
        )
      }

      setAlert({ type: 'success', msg: editId ? 'Achat mis à jour' : 'Achat ajouté' })
      setForm(EMPTY_ACHAT)
      setImputations([{ produit_fini: '', quantite_categorie: '', cout_total_categorie: '' }])
      setEditId(null)
      setShowForm(false)
      loadAchats()
    } catch (e) {
      setAlert({ type: 'error', msg: e.message })
    }
    setLoading(false)
  }

  async function handleDelete(id) {
    if (!confirm('Supprimer cet achat ?')) return
    await supabase.from('achats').delete().eq('id', id)
    loadAchats()
  }

  function startEdit(a) {
    setForm({ ...a, date_achat: a.date_achat || '' })
    setImputations(a.imputations?.length ? a.imputations : [{ produit_fini: '', quantite_categorie: '', cout_total_categorie: '' }])
    setEditId(a.id)
    setShowForm(true)
  }

  const totalAchats = achats.reduce((s, a) => s + (a.total_ttc || 0), 0)

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="page-title">Saisie des achats</p>
          <p className="page-subtitle">Tickets de caisse et répartition par produit fini</p>
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

        {showForm && (
          <div className="card mb-16">
            <div className="card-title">{editId ? 'Modifier' : 'Nouvel'} achat</div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Fournisseur *</label>
                <input className="form-input" value={form.fournisseur} onChange={e => setForm(f => ({ ...f, fournisseur: e.target.value }))} placeholder="PromoCash, Point G..." />
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
            </div>

            <hr className="divider" />
            <div className="card-title">Imputation par produit fini</div>
            <p className="text-muted text-sm mb-16">Répartissez le coût de cet article sur les produits finis (comme dans votre Excel).</p>

            {imputations.map((imp, idx) => (
              <div key={idx} className="form-grid" style={{ marginBottom: 10, padding: '10px', background: 'var(--gray-50)', borderRadius: 6 }}>
                <div className="form-group">
                  <label className="form-label">Produit fini</label>
                  <select className="form-select" value={imp.produit_fini} onChange={e => setImputations(arr => arr.map((a, i) => i === idx ? { ...a, produit_fini: e.target.value } : a))}>
                    <option value="">— Choisir —</option>
                    {produits.map(p => <option key={p.nom} value={p.nom}>{p.nom}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Qté allouée</label>
                  <input className="form-input" type="number" value={imp.quantite_categorie} onChange={e => setImputations(arr => arr.map((a, i) => i === idx ? { ...a, quantite_categorie: e.target.value } : a))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Coût total (€) *</label>
                  <input className="form-input" type="number" step="0.01" value={imp.cout_total_categorie} onChange={e => setImputations(arr => arr.map((a, i) => i === idx ? { ...a, cout_total_categorie: e.target.value } : a))} />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button className="btn btn-danger btn-sm" onClick={() => setImputations(arr => arr.filter((_, i) => i !== idx))} disabled={imputations.length === 1}>✕</button>
                </div>
              </div>
            ))}
            <button className="btn btn-sm mt-8" onClick={() => setImputations(arr => [...arr, { produit_fini: '', quantite_categorie: '', cout_total_categorie: '' }])}>
              + Ajouter une imputation
            </button>

            <div className="flex-gap mt-16">
              <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
                {loading ? <span className="spinner" /> : '💾'} {editId ? 'Mettre à jour' : 'Enregistrer'}
              </button>
              <button className="btn" onClick={() => { setShowForm(false); setEditId(null); setForm(EMPTY_ACHAT) }}>Annuler</button>
            </div>
          </div>
        )}

        {/* Liste des achats */}
        <div className="card">
          <div className="flex-between mb-16">
            <div className="card-title" style={{ marginBottom: 0 }}>Achats enregistrés</div>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Total : {fmt(totalAchats)}</span>
          </div>

          {!semaineId ? (
            <div className="empty-state">Sélectionnez une semaine pour voir les achats</div>
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
                    <th>Imputations</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {achats.map(a => (
                    <tr key={a.id}>
                      <td>{a.date_achat}</td>
                      <td>{a.fournisseur}</td>
                      <td>{a.article}</td>
                      <td>{a.quantite} {a.unite}</td>
                      <td className="num" style={{ fontWeight: 600 }}>{fmt(a.total_ttc)}</td>
                      <td>
                        {a.imputations?.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {a.imputations.map((imp, i) => (
                              <span key={i} className="badge badge-blue" title={fmt(imp.cout_total_categorie)}>
                                {imp.produit_fini?.split(' ')[0]}
                              </span>
                            ))}
                          </div>
                        ) : <span className="text-muted text-sm">—</span>}
                      </td>
                      <td>
                        <div className="flex-gap">
                          <button className="btn btn-sm" onClick={() => startEdit(a)}>✏️</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(a.id)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr className="tr-total">
                    <td colSpan={4}>Total</td>
                    <td className="num">{fmt(totalAchats)}</td>
                    <td colSpan={2}></td>
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
