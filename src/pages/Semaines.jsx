import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/sumup'

const EMPTY = {
  annee: new Date().getFullYear(), numero: '', date_debut: '', date_fin: '',
  theme: '', caisse_debut: 0, caisse_fin: 0, notes: ''
}

export default function SemainesPage() {
  const [semaines, setSemaines] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [alert, setAlert] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('semaines')
      .select('*, ventes(count), achats(count)')
      .order('annee', { ascending: false })
      .order('numero', { ascending: false })
    setSemaines(data || [])
    setLoading(false)
  }

  async function handleSave() {
    if (!form.numero || !form.date_debut) return setAlert({ type: 'error', msg: 'Numéro et date début requis' })
    setAlert(null)
    const payload = { ...form, annee: +form.annee, numero: +form.numero, caisse_debut: +form.caisse_debut || 0, caisse_fin: +form.caisse_fin || 0 }
    if (editId) {
      const { error } = await supabase.from('semaines').update(payload).eq('id', editId)
      if (error) return setAlert({ type: 'error', msg: error.message })
    } else {
      const { error } = await supabase.from('semaines').insert(payload)
      if (error) return setAlert({ type: 'error', msg: error.message })
    }
    setAlert({ type: 'success', msg: editId ? 'Semaine mise à jour' : 'Semaine créée' })
    setForm(EMPTY); setEditId(null); setShowForm(false)
    load()
  }

  async function handleDelete(id) {
    if (!confirm('Supprimer cette semaine ? Les ventes et achats associés seront aussi supprimés.')) return
    await supabase.from('semaines').delete().eq('id', id)
    load()
  }

  function startEdit(s) {
    setForm({ annee: s.annee, numero: s.numero, date_debut: s.date_debut, date_fin: s.date_fin || '', theme: s.theme || '', caisse_debut: s.caisse_debut || 0, caisse_fin: s.caisse_fin || 0, notes: s.notes || '' })
    setEditId(s.id); setShowForm(true)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="page-title">Gestion des semaines</p>
          <p className="page-subtitle">Créer et gérer les périodes de buvette</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setEditId(null); setForm(EMPTY) }}>
          + Nouvelle semaine
        </button>
      </div>

      <div className="page-body">
        {alert && <div className={`alert alert-${alert.type}`}>{alert.msg}</div>}

        {showForm && (
          <div className="card mb-16">
            <div className="card-title">{editId ? 'Modifier la semaine' : 'Nouvelle semaine'}</div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Année</label>
                <input className="form-input" type="number" value={form.annee} onChange={e => setForm(f => ({ ...f, annee: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Semaine n° *</label>
                <input className="form-input" type="number" value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} placeholder="Ex: 17" />
              </div>
              <div className="form-group">
                <label className="form-label">Date début *</label>
                <input className="form-input" type="date" value={form.date_debut} onChange={e => setForm(f => ({ ...f, date_debut: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Date fin</label>
                <input className="form-input" type="date" value={form.date_fin} onChange={e => setForm(f => ({ ...f, date_fin: e.target.value }))} />
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Thème / Événement</label>
                <input className="form-input" value={form.theme} onChange={e => setForm(f => ({ ...f, theme: e.target.value }))} placeholder="Ex: Movember, Fête du club, Octobre Rose..." />
              </div>
              <div className="form-group">
                <label className="form-label">Caisse début (€)</label>
                <input className="form-input" type="number" step="0.01" value={form.caisse_debut} onChange={e => setForm(f => ({ ...f, caisse_debut: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Caisse fin (€)</label>
                <input className="form-input" type="number" step="0.01" value={form.caisse_fin} onChange={e => setForm(f => ({ ...f, caisse_fin: e.target.value }))} />
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Notes</label>
                <textarea className="form-textarea" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes libres…" />
              </div>
            </div>
            <div className="flex-gap mt-16">
              <button className="btn btn-primary" onClick={handleSave}>💾 {editId ? 'Mettre à jour' : 'Créer'}</button>
              <button className="btn" onClick={() => { setShowForm(false); setEditId(null) }}>Annuler</button>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-title">Toutes les semaines</div>
          {loading ? <div className="loading-page" style={{ minHeight: 100 }}><div className="spinner" /></div> :
            semaines.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📅</div>
                <p>Aucune semaine créée</p>
                <p className="text-sm mt-4">Créez une semaine pour commencer à importer des données SumUp.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Semaine</th>
                      <th>Période</th>
                      <th>Thème</th>
                      <th className="num">Ventes</th>
                      <th className="num">Caisse début</th>
                      <th className="num">Caisse fin</th>
                      <th>Notes</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {semaines.map(s => (
                      <tr key={s.id}>
                        <td><strong>S{s.numero} {s.annee}</strong></td>
                        <td className="text-muted">{s.date_debut} → {s.date_fin}</td>
                        <td>{s.theme ? <span className="badge badge-green">{s.theme}</span> : <span className="text-muted">—</span>}</td>
                        <td className="num">{s.ventes?.[0]?.count ?? 0} lignes</td>
                        <td className="num">{fmt(s.caisse_debut)}</td>
                        <td className="num">{fmt(s.caisse_fin)}</td>
                        <td className="text-muted text-sm">{s.notes || '—'}</td>
                        <td>
                          <div className="flex-gap">
                            <button className="btn btn-sm" onClick={() => startEdit(s)}>✏️</button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s.id)}>🗑️</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
      </div>
    </div>
  )
}
