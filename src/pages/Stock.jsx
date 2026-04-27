import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/sumup'
import SemaineSelector from '../components/SemaineSelector.jsx'

// ─── Calcul FIFO ──────────────────────────────────────────────────────────────
// Retourne le coût total d'une sortie selon FIFO
function calculerFIFO(lots, qteSortie) {
  // lots = [{quantite_restante, cout_unitaire}] triés par date croissante
  let reste = qteSortie
  let coutTotal = 0
  const detail = []
  for (const lot of lots) {
    if (reste <= 0) break
    const pris = Math.min(reste, lot.quantite_restante)
    coutTotal += pris * lot.cout_unitaire
    detail.push({ pris, cout_unitaire: lot.cout_unitaire })
    reste -= pris
  }
  return { coutTotal: Math.round(coutTotal * 100) / 100, detail, manquant: reste }
}

// ─── Modal Entrée Stock ───────────────────────────────────────────────────────
function EntreeModal({ article, semaines, achats, onSave, onClose }) {
  const [form, setForm] = useState({
    quantite: '',
    cout_unitaire: '',
    date_mouvement: new Date().toISOString().slice(0, 10),
    semaine_id: '',
    achat_id: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  const coutTotal = (parseFloat(form.quantite) || 0) * (parseFloat(form.cout_unitaire) || 0)

  async function handleSave() {
    if (!form.quantite || !form.cout_unitaire) return
    setSaving(true)
    await supabase.from('mouvements_stock').insert({
      article_stock_id: article.id,
      semaine_id: form.semaine_id || null,
      achat_id: form.achat_id || null,
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

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'white', borderRadius:12, padding:28, width:460 }}>
        <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>📦 Entrée en stock</div>
        <div style={{ fontSize:13, color:'var(--gray-400)', marginBottom:20 }}>{article.nom} — {article.unite_stock}</div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
          <div className="form-group">
            <label className="form-label">Quantité ({article.unite_stock}) *</label>
            <input className="form-input" type="number" step="0.5" min="0" value={form.quantite}
              onChange={e => setForm(f=>({...f, quantite:e.target.value}))} placeholder="Ex: 5" autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Prix unitaire (€) *</label>
            <input className="form-input" type="number" step="0.01" min="0" value={form.cout_unitaire}
              onChange={e => setForm(f=>({...f, cout_unitaire:e.target.value}))} placeholder="Ex: 120.00" />
          </div>
          <div className="form-group">
            <label className="form-label">Date réception</label>
            <input className="form-input" type="date" value={form.date_mouvement}
              onChange={e => setForm(f=>({...f, date_mouvement:e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Semaine (optionnel)</label>
            <select className="form-select" value={form.semaine_id} onChange={e => setForm(f=>({...f, semaine_id:e.target.value}))}>
              <option value="">— Aucune —</option>
              {semaines.map(s => <option key={s.id} value={s.id}>{s.annee} S{s.numero} {s.theme ? `— ${s.theme}` : ''}</option>)}
            </select>
          </div>
        </div>

        <div className="form-group" style={{ marginBottom:16 }}>
          <label className="form-label">Notes (lien facture, fournisseur...)</label>
          <input className="form-input" value={form.notes} onChange={e => setForm(f=>({...f, notes:e.target.value}))}
            placeholder="Ex: Facture Promocash 175910" />
        </div>

        {coutTotal > 0 && (
          <div style={{ background:'var(--green-light)', borderRadius:8, padding:12, marginBottom:16, fontSize:13 }}>
            <strong style={{ color:'var(--green)' }}>
              Valeur entrée : {parseFloat(form.quantite)} {article.unite_stock} × {fmt(parseFloat(form.cout_unitaire))} = {fmt(coutTotal)}
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

// ─── Modal Calcul Sorties Semaine ─────────────────────────────────────────────
function SortiesModal({ article, associations, semaineId, lots, onSave, onClose }) {
  const [ventesData, setVentesData] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sortiesCalc, setSortiesCalc] = useState([])

  useEffect(() => { calcSorties() }, [])

  async function calcSorties() {
    setLoading(true)
    // Charger les ventes de la semaine pour les produits associés
    const produits = associations.map(a => a.produit_vendu)
    const { data: ventes } = await supabase
      .from('ventes')
      .select('description, quantite')
      .eq('semaine_id', semaineId)
      .eq('type_transaction', 'Vente')
      .in('description', produits)

    const qtesVendues = {}
    ventes?.forEach(v => {
      qtesVendues[v.description] = (qtesVendues[v.description] || 0) + (v.quantite || 0)
    })

    // Calculer les sorties par produit
    let totalLitres = 0
    const detail = associations.map(assoc => {
      const qteVendue = qtesVendues[assoc.produit_vendu] || 0
      const litresConsommes = qteVendue * assoc.consommation_par_vente
      totalLitres += litresConsommes
      return {
        produit: assoc.produit_vendu,
        qteVendue,
        conso: assoc.consommation_par_vente,
        unite: assoc.unite,
        litresTotal: litresConsommes,
      }
    })

    // Convertir litres → unités stock (selon contenance)
    const contenance = article.contenance_litres || 1
    const unitesSorties = article.unite_stock === 'canette' || article.unite_stock === 'bouteille'
      ? totalLitres / contenance
      : totalLitres / contenance // fûts aussi

    // Calcul FIFO
    const fifo = calculerFIFO(lots, unitesSorties)

    setSortiesCalc({ detail, totalLitres, unitesSorties: Math.round(unitesSorties * 1000) / 1000, fifo })
    setVentesData(qtesVendues)
    setLoading(false)
  }

  async function handleSave() {
    if (!sortiesCalc || sortiesCalc.unitesSorties <= 0) return
    setSaving(true)

    // Récupérer la date de fin de semaine
    const { data: sem } = await supabase.from('semaines').select('date_fin').eq('id', semaineId).single()

    await supabase.from('mouvements_stock').insert({
      article_stock_id: article.id,
      semaine_id: semaineId,
      type_mouvement: 'sortie',
      quantite: sortiesCalc.unitesSorties,
      cout_unitaire: sortiesCalc.unitesSorties > 0
        ? Math.round(sortiesCalc.fifo.coutTotal / sortiesCalc.unitesSorties * 10000) / 10000
        : 0,
      cout_total: sortiesCalc.fifo.coutTotal,
      date_mouvement: sem?.date_fin || new Date().toISOString().slice(0, 10),
      notes: `Calculé auto depuis ventes : ${sortiesCalc.detail.map(d => `${d.produit}(${d.qteVendue})`).join(', ')}`,
    })

    setSaving(false)
    onSave()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'white', borderRadius:12, padding:28, width:520, maxHeight:'90vh', overflow:'auto' }}>
        <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>📊 Calculer les sorties</div>
        <div style={{ fontSize:13, color:'var(--gray-400)', marginBottom:20 }}>{article.nom} — depuis les ventes de la semaine</div>

        {loading ? <div className="loading-page" style={{ minHeight:80 }}><div className="spinner"/></div> : (
          <>
            <div className="card mb-16">
              <div className="card-title">Ventes de la semaine</div>
              <table>
                <thead><tr><th>Produit vendu</th><th className="num">Qté vendue</th><th className="num">Conso/vente</th><th className="num">Total consommé</th></tr></thead>
                <tbody>
                  {sortiesCalc.detail.map(d => (
                    <tr key={d.produit}>
                      <td>{d.produit}</td>
                      <td className="num">{d.qteVendue}</td>
                      <td className="num">{d.conso} {d.unite}</td>
                      <td className="num positive">{d.litresTotal.toFixed(2)} {d.unite}</td>
                    </tr>
                  ))}
                  <tr className="tr-total">
                    <td colSpan={3}>Total consommé</td>
                    <td className="num">{sortiesCalc.totalLitres.toFixed(2)} L</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="card mb-16">
              <div className="card-title">Calcul FIFO</div>
              <table>
                <tbody>
                  <tr>
                    <td>Contenance par {article.unite_stock}</td>
                    <td className="num">{article.contenance_litres} L</td>
                  </tr>
                  <tr>
                    <td>Unités sorties ({article.unite_stock})</td>
                    <td className="num"><strong>{sortiesCalc.unitesSorties}</strong></td>
                  </tr>
                  <tr className="tr-total">
                    <td>Coût FIFO</td>
                    <td className="num negative"><strong>{fmt(sortiesCalc.fifo.coutTotal)}</strong></td>
                  </tr>
                </tbody>
              </table>
              {sortiesCalc.fifo.detail.length > 0 && (
                <div style={{ marginTop:8, fontSize:11, color:'var(--gray-400)' }}>
                  Détail lots : {sortiesCalc.fifo.detail.map(d => `${d.pris.toFixed(2)} × ${fmt(d.cout_unitaire)}`).join(' + ')}
                </div>
              )}
              {sortiesCalc.fifo.manquant > 0.001 && (
                <div className="alert alert-warning mt-8">
                  ⚠️ Stock insuffisant — manque {sortiesCalc.fifo.manquant.toFixed(2)} {article.unite_stock}
                </div>
              )}
            </div>
          </>
        )}

        <div className="flex-gap">
          <button className="btn btn-primary" onClick={handleSave}
            disabled={saving || loading || !sortiesCalc || sortiesCalc.unitesSorties <= 0}>
            {saving ? <span className="spinner"/> : '💾'} Enregistrer la sortie ({sortiesCalc?.unitesSorties || 0} {article.unite_stock})
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
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('stock') // stock | mouvements | articles
  const [entreeModal, setEntreeModal] = useState(null)
  const [sortiesModal, setSortiesModal] = useState(null)
  const [alert, setAlert] = useState(null)

  // Gestion des articles
  const [showArticleForm, setShowArticleForm] = useState(false)
  const [articleForm, setArticleForm] = useState({ nom:'', unite_stock:'fût', contenance_litres:'', ordre:0 })
  const [editArticleId, setEditArticleId] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: arts }, { data: mvts }, { data: assocs }, { data: sems }] = await Promise.all([
      supabase.from('articles_stock').select('*').eq('actif', true).order('ordre'),
      supabase.from('mouvements_stock').select('*, articles_stock(nom, unite_stock, contenance_litres)').order('date_mouvement'),
      supabase.from('stock_associations').select('*, articles_stock(nom)').order('article_stock_id'),
      supabase.from('semaines').select('*').order('annee', { ascending:false }).order('numero', { ascending:false }),
    ])
    setArticles(arts || [])
    setMouvements(mvts || [])
    setAssociations(assocs || [])
    setSemaines(sems || [])
    setLoading(false)
  }

  // ── Calcul stock actuel par article (FIFO) ─────────────────────────────────
  function getStockArticle(articleId) {
    const mvtsArticle = mouvements
      .filter(m => m.article_stock_id === articleId)
      .sort((a, b) => new Date(a.date_mouvement) - new Date(b.date_mouvement))

    // Reconstituer les lots FIFO
    const lots = []
    let qteStock = 0
    let valeurStock = 0

    for (const m of mvtsArticle) {
      if (m.type_mouvement === 'entree') {
        lots.push({ quantite_restante: m.quantite, cout_unitaire: m.cout_unitaire, date: m.date_mouvement })
        qteStock += m.quantite
        valeurStock += m.cout_total || 0
      } else if (m.type_mouvement === 'sortie') {
        let sortiReste = m.quantite
        qteStock -= m.quantite
        for (const lot of lots) {
          if (sortiReste <= 0) break
          const pris = Math.min(sortiReste, lot.quantite_restante)
          lot.quantite_restante -= pris
          valeurStock -= pris * lot.cout_unitaire
          sortiReste -= pris
        }
      }
    }

    const coutMoyen = qteStock > 0 ? valeurStock / qteStock : 0
    return { qteStock: Math.round(qteStock * 1000) / 1000, valeurStock: Math.round(valeurStock * 100) / 100, coutMoyen: Math.round(coutMoyen * 100) / 100, lots: lots.filter(l => l.quantite_restante > 0.001) }
  }

  // Mouvements filtrés par semaine
  const mvtsFiltres = semaineId
    ? mouvements.filter(m => m.semaine_id === semaineId)
    : mouvements

  const totalValeurStock = articles.reduce((s, a) => s + getStockArticle(a.id).valeurStock, 0)

  async function saveArticle() {
    if (!articleForm.nom.trim()) return
    const payload = { nom: articleForm.nom.trim(), unite_stock: articleForm.unite_stock, contenance_litres: parseFloat(articleForm.contenance_litres) || null, ordre: parseInt(articleForm.ordre) || 0 }
    if (editArticleId) await supabase.from('articles_stock').update(payload).eq('id', editArticleId)
    else await supabase.from('articles_stock').insert(payload)
    setShowArticleForm(false); setEditArticleId(null)
    setArticleForm({ nom:'', unite_stock:'fût', contenance_litres:'', ordre:0 })
    load()
  }

  async function deleteArticle(id) {
    if (!confirm('Supprimer cet article du stock ?')) return
    await supabase.from('articles_stock').update({ actif: false }).eq('id', id)
    load()
  }

  async function deleteMouvement(id) {
    if (!confirm('Supprimer ce mouvement ?')) return
    await supabase.from('mouvements_stock').delete().eq('id', id)
    load()
  }

  return (
    <div>
      {entreeModal && (
        <EntreeModal
          article={entreeModal}
          semaines={semaines}
          achats={[]}
          onSave={() => { setEntreeModal(null); load(); setAlert({ type:'success', msg:'Entrée en stock enregistrée ✅' }) }}
          onClose={() => setEntreeModal(null)}
        />
      )}
      {sortiesModal && (
        <SortiesModal
          article={sortiesModal}
          associations={associations.filter(a => a.article_stock_id === sortiesModal.id)}
          semaineId={semaineId}
          lots={getStockArticle(sortiesModal.id).lots}
          onSave={() => { setSortiesModal(null); load(); setAlert({ type:'success', msg:'Sorties calculées et enregistrées ✅' }) }}
          onClose={() => setSortiesModal(null)}
        />
      )}

      <div className="page-header">
        <div>
          <p className="page-title">📦 Gestion du stock</p>
          <p className="page-subtitle">Boissons — valorisation FIFO — sorties automatiques depuis les ventes</p>
        </div>
        <div className="flex-gap">
          <SemaineSelector value={semaineId} onChange={setSemaineId} />
          {tab === 'articles' && (
            <button className="btn btn-primary" onClick={() => { setShowArticleForm(true); setEditArticleId(null); setArticleForm({ nom:'', unite_stock:'fût', contenance_litres:'', ordre:0 }) }}>
              + Nouvel article
            </button>
          )}
        </div>
      </div>

      <div className="page-body">
        {alert && <div className={`alert alert-${alert.type}`} onClick={() => setAlert(null)}>{alert.msg}</div>}

        {/* Onglets */}
        <div style={{ display:'flex', gap:4, borderBottom:'0.5px solid var(--gray-200)', marginBottom:20 }}>
          {[['stock','📊 Stock actuel'], ['mouvements','📋 Mouvements'], ['articles','⚙️ Articles']].map(([key, label]) => (
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
                <div className="metric-card amber">
                  <div className="metric-label">Sorties cette semaine</div>
                  <div className="metric-value">
                    {fmt(mvtsFiltres.filter(m => m.type_mouvement === 'sortie').reduce((s, m) => s + (m.cout_total || 0), 0))}
                  </div>
                </div>
              )}
            </div>

            {!semaineId && (
              <div className="alert alert-info mb-16">
                💡 Sélectionnez une semaine pour calculer les sorties automatiquement depuis les ventes.
              </div>
            )}

            <div className="card">
              <div className="card-title">État du stock — valorisation FIFO</div>
              {loading ? <div className="loading-page" style={{ minHeight:80 }}><div className="spinner"/></div> : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Article</th>
                        <th>Unité</th>
                        <th className="num">Qté en stock</th>
                        <th className="num">Coût moyen</th>
                        <th className="num">Valeur stock</th>
                        <th>Lots FIFO</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {articles.map(a => {
                        const { qteStock, valeurStock, coutMoyen, lots } = getStockArticle(a.id)
                        const assocs = associations.filter(x => x.article_stock_id === a.id)
                        return (
                          <tr key={a.id} style={{ background: qteStock <= 0 ? 'var(--amber-light)' : '' }}>
                            <td>
                              <div style={{ fontWeight:500 }}>{a.nom}</div>
                              <div style={{ fontSize:11, color:'var(--gray-400)' }}>
                                {assocs.map(x => `${x.produit_vendu} (${x.consommation_par_vente}${x.unite})`).join(' · ')}
                              </div>
                            </td>
                            <td>{a.unite_stock}</td>
                            <td className="num">
                              <span style={{ fontWeight:700, color: qteStock <= 0 ? 'var(--red)' : qteStock < 2 ? 'var(--amber)' : 'var(--green)' }}>
                                {qteStock}
                              </span>
                            </td>
                            <td className="num">{coutMoyen ? fmt(coutMoyen) : '—'}</td>
                            <td className="num" style={{ fontWeight:600 }}>{fmt(valeurStock)}</td>
                            <td style={{ fontSize:11, color:'var(--gray-400)' }}>
                              {lots.map((l, i) => (
                                <span key={i} className="badge badge-gray" style={{ fontSize:10, marginRight:3 }}>
                                  {l.quantite_restante.toFixed(1)} × {fmt(l.cout_unitaire)}
                                </span>
                              ))}
                            </td>
                            <td>
                              <div className="flex-gap">
                                <button className="btn btn-sm btn-primary" onClick={() => setEntreeModal(a)} title="Ajouter une entrée">
                                  📦 Entrée
                                </button>
                                {semaineId && assocs.length > 0 && (
                                  <button className="btn btn-sm" onClick={() => setSortiesModal(a)} title="Calculer sorties depuis ventes">
                                    📊 Sorties
                                  </button>
                                )}
                              </div>
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

        {/* ── MOUVEMENTS ── */}
        {tab === 'mouvements' && (
          <div className="card">
            <div className="flex-between mb-16">
              <div className="card-title" style={{ marginBottom:0 }}>
                Historique des mouvements
                {semaineId && <span className="badge badge-blue" style={{ marginLeft:8 }}>Semaine filtrée</span>}
              </div>
              <div className="text-sm text-muted">{mvtsFiltres.length} mouvement(s)</div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Article</th>
                    <th>Type</th>
                    <th className="num">Quantité</th>
                    <th className="num">Prix unitaire</th>
                    <th className="num">Total</th>
                    <th>Notes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {mvtsFiltres.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign:'center', padding:32, color:'var(--gray-400)' }}>Aucun mouvement</td></tr>
                  ) : (
                    mvtsFiltres.sort((a,b) => new Date(b.date_mouvement) - new Date(a.date_mouvement)).map(m => (
                      <tr key={m.id}>
                        <td>{m.date_mouvement}</td>
                        <td style={{ fontWeight:500 }}>{m.articles_stock?.nom}</td>
                        <td>
                          {m.type_mouvement === 'entree'
                            ? <span className="badge badge-green">📦 Entrée</span>
                            : m.type_mouvement === 'sortie'
                            ? <span className="badge badge-amber">📤 Sortie</span>
                            : <span className="badge badge-gray">📋 Inventaire</span>}
                        </td>
                        <td className="num">{m.quantite} {m.articles_stock?.unite_stock}</td>
                        <td className="num">{m.cout_unitaire ? fmt(m.cout_unitaire) : '—'}</td>
                        <td className="num" style={{ fontWeight:600, color: m.type_mouvement === 'entree' ? 'var(--green)' : 'var(--red)' }}>
                          {m.type_mouvement === 'entree' ? '+' : '-'}{fmt(Math.abs(m.cout_total || 0))}
                        </td>
                        <td style={{ fontSize:11, color:'var(--gray-400)', maxWidth:200 }}>{m.notes || '—'}</td>
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
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 80px', gap:12, marginBottom:12 }}>
                  <div className="form-group">
                    <label className="form-label">Nom *</label>
                    <input className="form-input" value={articleForm.nom} onChange={e => setArticleForm(f=>({...f,nom:e.target.value}))}
                      placeholder="Ex: Fût bière pression" autoFocus />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Unité</label>
                    <select className="form-select" value={articleForm.unite_stock} onChange={e => setArticleForm(f=>({...f,unite_stock:e.target.value}))}>
                      {['fût','bouteille','canette','bag-in-box','carton','pièce'].map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Contenance (L)</label>
                    <input className="form-input" type="number" step="0.01" value={articleForm.contenance_litres}
                      onChange={e => setArticleForm(f=>({...f,contenance_litres:e.target.value}))} placeholder="Ex: 30" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Ordre</label>
                    <input className="form-input" type="number" value={articleForm.ordre} onChange={e => setArticleForm(f=>({...f,ordre:e.target.value}))} />
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
                  <thead><tr><th>Article</th><th>Unité</th><th className="num">Contenance</th><th>Produits associés</th><th></th></tr></thead>
                  <tbody>
                    {articles.map(a => {
                      const assocs = associations.filter(x => x.article_stock_id === a.id)
                      return (
                        <tr key={a.id}>
                          <td style={{ fontWeight:500 }}>{a.nom}</td>
                          <td>{a.unite_stock}</td>
                          <td className="num">{a.contenance_litres ? `${a.contenance_litres} L` : '—'}</td>
                          <td>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
                              {assocs.map(x => (
                                <span key={x.id} className="badge badge-blue" style={{ fontSize:10 }}>
                                  {x.produit_vendu} ({x.consommation_par_vente}{x.unite})
                                </span>
                              ))}
                              {assocs.length === 0 && <span className="badge badge-amber" style={{ fontSize:10 }}>⚠️ Aucune association</span>}
                            </div>
                          </td>
                          <td>
                            <div className="flex-gap">
                              <button className="btn btn-sm" onClick={() => { setArticleForm({...a}); setEditArticleId(a.id); setShowArticleForm(true) }}>✏️</button>
                              <button className="btn btn-danger btn-sm" onClick={() => deleteArticle(a.id)}>🗑️</button>
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
              <p className="text-muted text-sm mb-16">Définit combien de litres/unités sont consommés par vente d'un produit SumUp</p>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Article stock</th><th>Produit vendu (SumUp)</th><th className="num">Conso par vente</th><th>Unité</th><th>Notes</th></tr></thead>
                  <tbody>
                    {associations.map(x => (
                      <tr key={x.id}>
                        <td style={{ fontWeight:500 }}>{x.articles_stock?.nom}</td>
                        <td>{x.produit_vendu}</td>
                        <td className="num">{x.consommation_par_vente}</td>
                        <td>{x.unite}</td>
                        <td className="text-muted">{x.notes || '—'}</td>
                      </tr>
                    ))}
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
