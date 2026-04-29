import { useState, useEffect } from 'react'
import { useSortable } from '../hooks/useSortable.jsx'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/sumup'

export default function ProduitsPage() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [annee, setAnnee] = useState(new Date().getFullYear())
  const [catFilter, setCatFilter] = useState('Tous')
  const [semaines, setSemaines] = useState([])
  const [semaineFilter, setSemaineFilter] = useState('')

  useEffect(() => {
    loadData()
    loadSemaines()
  }, [annee])

  async function loadSemaines() {
    const { data } = await supabase.from('semaines').select('id, numero, theme, date_debut').eq('annee', annee).order('numero')
    setSemaines(data || [])
  }

  async function loadData() {
    setLoading(true)
    let q = supabase
      .from('v_ca_par_produit')
      .select('*')

    if (semaineFilter) {
      q = q.eq('semaine_id', semaineFilter)
    } else {
      const { data: sems } = await supabase.from('semaines').select('id').eq('annee', annee)
      if (sems?.length) {
        q = q.in('semaine_id', sems.map(s => s.id))
      }
    }

    const { data: rows } = await q

    // Charger les sorties stock validées pour la même période
    let stockQ = supabase
      .from('mouvements_stock')
      .select('*, articles_stock(nom, unite_stock)')
      .eq('type_mouvement', 'sortie')
      .eq('envoye_bilan', true)
    if (semaineFilter) {
      stockQ = stockQ.eq('semaine_id', semaineFilter)
    } else {
      const { data: sems2 } = await supabase.from('semaines').select('id').eq('annee', annee)
      if (sems2?.length) stockQ = stockQ.in('semaine_id', sems2.map(s => s.id))
    }
    const { data: sortiesStock } = await stockQ

    // Charger toutes les associations stock → produits vendus
    const { data: assocs } = await supabase
      .from('stock_associations')
      .select('article_stock_id, produit_vendu, consommation_par_vente, unite')

    // Aggregate by produit — coûts directs depuis v_ca_par_produit
    const byProduit = {}
    rows?.forEach(r => {
      if (!byProduit[r.produit]) byProduit[r.produit] = { produit: r.produit, categorie: r.categorie, qte: 0, ca: 0, cout: 0 }
      byProduit[r.produit].qte += r.quantite_vendue || 0
      byProduit[r.produit].ca += r.ca || 0
      byProduit[r.produit].cout += r.cout_achat || 0
    })

    // Ajouter les coûts stock proportionnellement aux consommations
    if (sortiesStock?.length && assocs?.length) {
      for (const sortie of sortiesStock) {
        const assocsArticle = assocs.filter(a => a.article_stock_id === sortie.article_stock_id)
        if (!assocsArticle.length) continue

        // Calculer la consommation totale et par produit
        let totalConso = 0
        const consoParProduit = {}
        assocsArticle.forEach(assoc => {
          const prod = byProduit[assoc.produit_vendu]
          if (!prod) return
          const conso = prod.qte * assoc.consommation_par_vente
          consoParProduit[assoc.produit_vendu] = conso
          totalConso += conso
        })

        if (totalConso > 0) {
          Object.entries(consoParProduit).forEach(([produit, conso]) => {
            if (byProduit[produit]) {
              byProduit[produit].cout += Math.round((conso / totalConso) * (sortie.cout_total || 0) * 100) / 100
            }
          })
        }
      }
    }

    setData(Object.values(byProduit).sort((a, b) => b.ca - a.ca))
    setLoading(false)
  }

  useEffect(() => { loadData() }, [semaineFilter, annee])

  const cats = ['Tous', ...new Set(data.map(d => d.categorie).filter(Boolean))]
  const filtered = catFilter === 'Tous' ? data : data.filter(d => d.categorie === catFilter)
  const { sorted, Th } = useSortable(filtered, 'ca', 'desc')

  function exportCSV() {
    const rows = sorted.map(d => ({
      produit: d.produit,
      categorie: d.categorie,
      qte: Math.round(d.qte),
      ca: d.ca.toFixed(2),
      cout: d.cout.toFixed(2),
      marge: (d.ca - d.cout).toFixed(2),
      marge_pct: d.ca > 0 ? Math.round((d.ca - d.cout) / d.ca * 100) + '%' : '—',
    }))
    const headers = ['Produit','Catégorie','Qté vendue','CA (€)','Coût (€)','Marge (€)','Marge %']
    const bom = '\uFEFF'; const sep = ';'
    const lines = [headers.join(sep), ...rows.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g,'""')}"`).join(sep))]
    const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = 'produits_' + new Date().toISOString().slice(0,10) + '.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const totCA = filtered.reduce((s, d) => s + d.ca, 0)
  const totCout = filtered.reduce((s, d) => s + d.cout, 0)
  const totMarge = totCA - totCout

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="page-title">Produits</p>
          <p className="page-subtitle">Quantités vendues et marges par article</p>
        </div>
        <div className="flex-gap">
          <select
            style={{ padding: '6px 10px', border: '1px solid var(--gray-300)', borderRadius: 6, fontSize: 13 }}
            value={annee} onChange={e => { setAnnee(+e.target.value); setSemaineFilter('') }}
          >
            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            style={{ padding: '6px 10px', border: '1px solid var(--gray-300)', borderRadius: 6, fontSize: 13 }}
            value={semaineFilter} onChange={e => setSemaineFilter(e.target.value)}
          >
            <option value="">Toute la saison</option>
            {semaines.map(s => <option key={s.id} value={s.id}>S{s.numero} — {s.theme || s.date_debut}</option>)}
          </select>
          <button className="btn no-print" onClick={() => window.print()}>🖨️ Imprimer</button>
          <button className="btn no-print" onClick={exportCSV}>📊 Exporter CSV</button>
        </div>
      </div>

      <div className="page-body">
        <div className="flex-gap mb-16">
          {cats.map(c => (
            <button
              key={c}
              className={'btn btn-sm' + (catFilter === c ? ' btn-primary' : '')}
              onClick={() => setCatFilter(c)}
            >{c}</button>
          ))}
        </div>

        {loading ? (
          <div className="loading-page"><div className="spinner" /></div>
        ) : (
          <div className="card">
            <div className="flex-between mb-16">
              <div className="card-title" style={{ marginBottom: 0 }}>
                {filtered.length} produits
              </div>
              <div className="flex-gap text-sm">
                <span>CA : <strong>{fmt(totCA)}</strong></span>
                <span>Achats : <strong className="negative">{fmt(-totCout)}</strong></span>
                <span>Marge : <strong style={{ color: totMarge >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(totMarge)}</strong></span>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th>Catégorie</th>
                    <th className="num">Qté vendue</th>
                    <th className="num">CA</th>
                    <th className="num">Coût achat</th>
                    <th className="num">Marge</th>
                    <th className="num">Marge %</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(d => {
                    const marge = d.ca - d.cout
                    const margePct = d.ca ? marge / d.ca : null
                    return (
                      <tr key={d.produit}>
                        <td style={{ fontWeight: 500 }}>{d.produit}</td>
                        <td><span className="badge badge-gray">{d.categorie}</span></td>
                        <td className="num">{Math.round(d.qte)}</td>
                        <td className="num">{fmt(d.ca)}</td>
                        <td className="num">{d.cout ? <span className="negative">{fmt(-d.cout)}</span> : '—'}</td>
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
                    <td className="num negative">{fmt(-totCout)}</td>
                    <td className={'num ' + (totMarge >= 0 ? 'positive' : 'negative')}>{fmt(totMarge)}</td>
                    <td className="num">{totCA ? `${Math.round(totMarge / totCA * 100)}%` : '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
