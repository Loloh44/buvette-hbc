import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/sumup'
import { useSortable } from '../hooks/useSortable.jsx'

export default function ProduitsPage() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [annee, setAnnee] = useState(new Date().getFullYear())
  const [catFilter, setCatFilter] = useState('Tous')
  const [semaines, setSemaines] = useState([])
  const [semaineFilter, setSemaineFilter] = useState('')
  const [mappings, setMappings] = useState([])
  const [tab, setTab] = useState('produits') // produits | mappings

  const filtered = catFilter === 'Tous' ? data : data.filter(d => d.categorie === catFilter)
  const { sorted, Th } = useSortable(filtered, 'ca', 'desc')

  useEffect(() => { loadData(); loadSemaines(); loadMappings() }, [annee])
  useEffect(() => { loadData() }, [semaineFilter])

  async function loadSemaines() {
    const { data } = await supabase.from('semaines').select('id, numero, theme, date_debut, annee').eq('annee', annee).order('numero')
    setSemaines(data || [])
  }

  async function loadMappings() {
    const { data } = await supabase.from('product_mappings').select('*').order('nom_sumup')
    setMappings(data || [])
  }

  async function deleteMapping(id) {
    if (!confirm('Supprimer cette association ?')) return
    await supabase.from('product_mappings').delete().eq('id', id)
    loadMappings()
  }

  async function loadData() {
    setLoading(true)
    let q = supabase.from('v_ca_par_produit').select('*')
    if (semaineFilter) {
      q = q.eq('semaine_id', semaineFilter)
    } else {
      const { data: sems } = await supabase.from('semaines').select('id').eq('annee', annee)
      if (sems?.length) q = q.in('semaine_id', sems.map(s => s.id))
    }
    const { data: rows } = await q

    const byProduit = {}
    rows?.forEach(r => {
      if (!byProduit[r.produit]) byProduit[r.produit] = { produit: r.produit, categorie: r.categorie, qte: 0, ca: 0, cout: 0 }
      byProduit[r.produit].qte += r.quantite_vendue || 0
      byProduit[r.produit].ca += r.ca || 0
      byProduit[r.produit].cout += r.cout_achat || 0
    })
    setData(Object.values(byProduit))
    setLoading(false)
  }

  const cats = ['Tous', ...new Set(data.map(d => d.categorie).filter(Boolean))]
  const totCA = sorted.reduce((s, d) => s + d.ca, 0)
  const totCout = sorted.reduce((s, d) => s + d.cout, 0)
  const totMarge = totCA - totCout

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="page-title">Produits</p>
          <p className="page-subtitle">Volumes, marges et associations de noms</p>
        </div>
        <div className="flex-gap">
          <select style={{ padding: '6px 10px', border: '1px solid var(--gray-300)', borderRadius: 6, fontSize: 13 }}
            value={annee} onChange={e => { setAnnee(+e.target.value); setSemaineFilter('') }}>
            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select style={{ padding: '6px 10px', border: '1px solid var(--gray-300)', borderRadius: 6, fontSize: 13 }}
            value={semaineFilter} onChange={e => setSemaineFilter(e.target.value)}>
            <option value="">Toute la saison</option>
            {semaines.map(s => <option key={s.id} value={s.id}>S{s.numero} — {s.theme || s.date_debut}</option>)}
          </select>
        </div>
      </div>

      <div className="page-body">
        <div className="flex-gap mb-16">
          <button className={'btn btn-sm' + (tab === 'produits' ? ' btn-primary' : '')} onClick={() => setTab('produits')}>📊 Ventes par produit</button>
          <button className={'btn btn-sm' + (tab === 'mappings' ? ' btn-primary' : '')} onClick={() => setTab('mappings')}>🔗 Associations de noms ({mappings.length})</button>
        </div>

        {tab === 'produits' && (
          <>
            <div className="flex-gap mb-16">
              {cats.map(c => (
                <button key={c} className={'btn btn-sm' + (catFilter === c ? ' btn-primary' : '')} onClick={() => setCatFilter(c)}>{c}</button>
              ))}
            </div>
            <div className="card">
              <div className="flex-between mb-16">
                <div className="card-title" style={{ marginBottom: 0 }}>{sorted.length} produits</div>
                <div className="flex-gap text-sm">
                  <span>CA : <strong>{fmt(totCA)}</strong></span>
                  <span>Achats : <strong style={{ color: 'var(--red)' }}>{fmt(-totCout)}</strong></span>
                  <span>Marge : <strong style={{ color: totMarge >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(totMarge)}</strong></span>
                </div>
              </div>
              {loading ? <div className="loading-page" style={{ minHeight: 100 }}><div className="spinner" /></div> : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <Th col="produit">Produit</Th>
                        <Th col="categorie">Catégorie</Th>
                        <Th col="qte" className="num">Qté vendue</Th>
                        <Th col="ca" className="num">CA</Th>
                        <Th col="cout" className="num">Coût achat</Th>
                        <Th col="marge" className="num">Marge</Th>
                        <Th col="margePct" className="num">Marge %</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map(d => {
                        const marge = d.ca - d.cout
                        const margePct = d.ca ? marge / d.ca : null
                        return (
                          <tr key={d.produit}>
                            <td style={{ fontWeight: 500 }}>{d.produit}</td>
                            <td><span className="badge badge-gray">{d.categorie}</span></td>
                            <td className="num">{Math.round(d.qte)}</td>
                            <td className="num">{fmt(d.ca)}</td>
                            <td className="num">{d.cout ? <span style={{ color: 'var(--red)' }}>{fmt(-d.cout)}</span> : '—'}</td>
                            <td className={'num ' + (marge >= 0 ? 'positive' : 'negative')}>{fmt(marge)}</td>
                            <td className={'num ' + (margePct !== null && margePct >= 0 ? 'positive' : 'negative')}>
                              {margePct !== null ? `${Math.round(margePct * 100)}%` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                      <tr className="tr-total">
                        <td colSpan={3}>Total</td>
                        <td className="num">{fmt(totCA)}</td>
                        <td className="num" style={{ color: 'var(--red)' }}>{fmt(-totCout)}</td>
                        <td className={'num ' + (totMarge >= 0 ? 'positive' : 'negative')}>{fmt(totMarge)}</td>
                        <td className="num">{totCA ? `${Math.round(totMarge / totCA * 100)}%` : '—'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'mappings' && (
          <div className="card">
            <div className="card-title">Associations noms SumUp → produits officiels</div>
            <p className="text-muted text-sm mb-16">Ces associations sont appliquées automatiquement à chaque import. Supprimez-en une pour la reconfigurer.</p>
            {mappings.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🔗</div>
                <p>Aucune association créée</p>
                <p className="text-sm mt-4">Les associations se créent lors de l'import quand vous cliquez sur "Associer à un produit"</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nom SumUp importé</th>
                      <th>→</th>
                      <th>Produit officiel</th>
                      <th>Catégorie</th>
                      <th>Créé le</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappings.map(m => (
                      <tr key={m.id}>
                        <td><span className="badge badge-amber">"{m.nom_sumup}"</span></td>
                        <td style={{ color: 'var(--gray-300)' }}>→</td>
                        <td style={{ fontWeight: 500 }}>{m.produit_nom}</td>
                        <td><span className="badge badge-gray">{m.categorie}</span></td>
                        <td className="text-muted text-sm">{new Date(m.created_at).toLocaleDateString('fr-FR')}</td>
                        <td>
                          <button className="btn btn-danger btn-sm" onClick={() => deleteMapping(m.id)}>🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
