import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/sumup'
import SemaineSelector from '../components/SemaineSelector.jsx'

const CATEGORIES = ['Boissons', 'Snacking', 'Boutique', 'Marche de Noel', 'Dons', 'Inconnu']
const CAT_ICONS = { Boissons: '🍺', Snacking: '🥐', Boutique: '👕', 'Marche de Noel': '🎄', Dons: '💝', Inconnu: '❓' }

export default function BilanPage() {
  const [semaineId, setSemaineId] = useState('')
  const [semaine, setSemaine] = useState(null)
  const [bilan, setBilan] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (semaineId) loadBilan()
  }, [semaineId])

  async function loadBilan() {
    setLoading(true)

    const { data: sem } = await supabase.from('semaines').select('*').eq('id', semaineId).single()
    setSemaine(sem)

    const { data: ventes } = await supabase
      .from('ventes')
      .select('prix_ttc, moyen_paiement, categorie, description, quantite, type_transaction')
      .eq('semaine_id', semaineId)

    const { data: achats } = await supabase
      .from('achats')
      .select('total_ttc, fournisseur, num_facture, article, date_achat, imputations(*)')
      .eq('semaine_id', semaineId)

    if (!ventes) { setLoading(false); return }

    const ventesOnly = ventes.filter(v => v.type_transaction === 'Vente')
    const remboursements = ventes.filter(v => v.type_transaction === 'Refund').reduce((s, v) => s + v.prix_ttc, 0)

    // CA par catégorie
    const catStats = {}
    CATEGORIES.forEach(c => { catStats[c] = { nb: 0, ca: 0, achat: 0 } })

    ventesOnly.forEach(v => {
      const c = v.categorie || 'Inconnu'
      if (!catStats[c]) catStats[c] = { nb: 0, ca: 0, achat: 0 }
      catStats[c].nb++
      catStats[c].ca += v.prix_ttc || 0
    })

    // Imputations par catégorie (produit fini → catégorie)
    const prodCat = {}
    if (achats) {
      achats.forEach(a => {
        a.imputations?.forEach(imp => {
          const cat = imp.categorie || 'Inconnu'
          if (!catStats[cat]) catStats[cat] = { nb: 0, ca: 0, achat: 0 }
          catStats[cat].achat += imp.cout_total_categorie || 0
          // Also sum by produit
          if (!prodCat[imp.produit_fini]) prodCat[imp.produit_fini] = 0
          prodCat[imp.produit_fini] += imp.cout_total_categorie || 0
        })
      })
    }

    // Moyens de paiement
    const paiements = {}
    ventesOnly.forEach(v => {
      const p = v.moyen_paiement || 'Inconnu'
      if (!paiements[p]) paiements[p] = { nb: 0, montant: 0 }
      paiements[p].nb++
      paiements[p].montant += v.prix_ttc || 0
    })

    // Frais SumUp (1.75%)
    const cbTotal = Object.entries(paiements)
      .filter(([p]) => p !== 'Espèces')
      .reduce((s, [, d]) => s + d.montant, 0)
    const fraisSumup = -(cbTotal * 0.0175)

    // Par produit
    const byProduit = {}
    ventesOnly.forEach(v => {
      const key = v.description || 'Inconnu'
      if (!byProduit[key]) byProduit[key] = { qte: 0, ca: 0, cat: v.categorie }
      byProduit[key].qte += v.quantite || 0
      byProduit[key].ca += v.prix_ttc || 0
    })

    const totalCA = ventesOnly.reduce((s, v) => s + (v.prix_ttc || 0), 0)
    const totalAchats = (achats || []).reduce((s, a) => s + (a.total_ttc || 0), 0)
    const fraisCommission = fraisSumup
    const totalCharges = totalAchats + fraisCommission
    const marge = totalCA + totalCharges // charges are negative

    // Récap espèces
    const especes = paiements['Espèces']?.montant || 0
    const caisseDiff = (sem?.caisse_fin || 0) - (sem?.caisse_debut || 0)
    const transNonEnr = caisseDiff - especes

    setBilan({
      semaine: sem,
      catStats,
      paiements,
      byProduit,
      totalCA,
      totalAchats,
      fraisSumup,
      marge,
      especes,
      caisseDiff,
      transNonEnr,
      achats: achats || [],
      remboursements,
    })

    setLoading(false)
  }

  function handlePrint() {
    window.print()
  }

  if (loading) return <div className="loading-page"><div className="spinner" /><span>Calcul du bilan…</span></div>

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="page-title">Bilan hebdomadaire</p>
          <p className="page-subtitle">Récapitulatif complet pour le bureau</p>
        </div>
        <div className="flex-gap">
          <SemaineSelector value={semaineId} onChange={setSemaineId} />
          {bilan && <button className="btn" onClick={handlePrint}>🖨️ Imprimer</button>}
        </div>
      </div>

      <div className="page-body">
        {!semaineId && (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <p>Sélectionnez une semaine pour afficher le bilan</p>
          </div>
        )}

        {bilan && semaine && (
          <>
            {/* Header bilan */}
            <div className="card mb-16" style={{ background: 'var(--green)', color: 'white' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>
                    Semaine n°{semaine.numero} — {semaine.theme || 'Buvette'}
                  </div>
                  <div style={{ opacity: .8, fontSize: 13 }}>
                    Du {semaine.date_debut} au {semaine.date_fin}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 28, fontWeight: 800 }}>{fmt(bilan.totalCA)}</div>
                  <div style={{ opacity: .8, fontSize: 12 }}>Chiffre d'affaires</div>
                </div>
              </div>
            </div>

            {/* Totaux */}
            <div className="metrics-grid">
              <div className="metric-card green">
                <div className="metric-label">CA total</div>
                <div className="metric-value">{fmt(bilan.totalCA)}</div>
              </div>
              <div className="metric-card red">
                <div className="metric-label">Achats + Frais</div>
                <div className="metric-value">{fmt(bilan.totalAchats + bilan.fraisSumup)}</div>
              </div>
              <div className="metric-card" style={{ borderLeft: '3px solid var(--green)' }}>
                <div className="metric-label">Marge brute</div>
                <div className="metric-value" style={{ color: bilan.marge >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {fmt(bilan.marge)}
                </div>
                <div className="metric-sub">
                  {bilan.totalCA ? Math.round(bilan.marge / bilan.totalCA * 100) : 0}% du CA
                </div>
              </div>
              <div className="metric-card amber">
                <div className="metric-label">Frais SumUp (1.75%)</div>
                <div className="metric-value">{fmt(bilan.fraisSumup)}</div>
              </div>
            </div>

            <div className="grid-2">
              {/* CA par catégorie */}
              <div className="card">
                <div className="card-title">Par catégorie d'articles</div>
                <table>
                  <thead>
                    <tr>
                      <th>Catégorie</th>
                      <th className="num">Nb</th>
                      <th className="num">CA</th>
                      <th className="num">Achats</th>
                      <th className="num">Marge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(bilan.catStats)
                      .filter(([, d]) => d.ca > 0 || d.achat !== 0)
                      .map(([cat, d]) => (
                        <tr key={cat}>
                          <td>{CAT_ICONS[cat] || '•'} {cat}</td>
                          <td className="num">{d.nb}</td>
                          <td className="num">{fmt(d.ca)}</td>
                          <td className="num negative">{d.achat ? fmt(-d.achat) : '—'}</td>
                          <td className={'num ' + (d.ca - d.achat >= 0 ? 'positive' : 'negative')}>
                            {fmt(d.ca - d.achat)}
                          </td>
                        </tr>
                      ))}
                    <tr className="tr-total">
                      <td>Total</td>
                      <td className="num">{Object.values(bilan.catStats).reduce((s, d) => s + d.nb, 0)}</td>
                      <td className="num">{fmt(bilan.totalCA)}</td>
                      <td className="num negative">{fmt(-bilan.totalAchats)}</td>
                      <td className={'num ' + (bilan.marge >= 0 ? 'positive' : 'negative')}>{fmt(bilan.marge)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Moyens de paiement + espèces */}
              <div>
                <div className="card" style={{ marginBottom: 12 }}>
                  <div className="card-title">Moyens de paiement</div>
                  <table>
                    <thead><tr><th>Mode</th><th className="num">Nb</th><th className="num">Montant</th></tr></thead>
                    <tbody>
                      {Object.entries(bilan.paiements)
                        .sort((a, b) => b[1].montant - a[1].montant)
                        .map(([p, d]) => (
                          <tr key={p}>
                            <td>{p === 'Espèces' ? '💵' : '💳'} {p}</td>
                            <td className="num">{d.nb}</td>
                            <td className="num">{fmt(d.montant)}</td>
                          </tr>
                        ))}
                      <tr className="tr-total">
                        <td>Total</td>
                        <td className="num">{Object.values(bilan.paiements).reduce((s, d) => s + d.nb, 0)}</td>
                        <td className="num">{fmt(bilan.totalCA)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="card">
                  <div className="card-title">Récap espèces</div>
                  <table>
                    <tbody>
                      <tr><td>Caisse début</td><td className="num">{fmt(semaine.caisse_debut)}</td></tr>
                      <tr><td>Caisse fin</td><td className="num">{fmt(semaine.caisse_fin)}</td></tr>
                      <tr><td>Recettes espèces</td><td className="num positive">{fmt(bilan.especes)}</td></tr>
                      <tr className="tr-total"><td>Transactions non enr.</td><td className="num">{fmt(bilan.transNonEnr)}</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Détail achats */}
            <div className="card mt-16">
              <div className="card-title">Détail des achats</div>
              {bilan.achats.length === 0 ? (
                <p className="text-muted text-sm">Aucun achat saisi pour cette semaine</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Fournisseur</th>
                      <th>N° Facture</th>
                      <th>Article</th>
                      <th className="num">TTC</th>
                      <th>Produits imputés</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bilan.achats.map(a => (
                      <tr key={a.id}>
                        <td>{a.date_achat}</td>
                        <td>{a.fournisseur}</td>
                        <td className="text-muted">{a.num_facture || '—'}</td>
                        <td>{a.article}</td>
                        <td className="num negative">{fmt(-a.total_ttc)}</td>
                        <td>
                          {a.imputations?.map((imp, i) => (
                            <span key={i} style={{ fontSize: 11 }}>
                              {imp.produit_fini} ({fmt(imp.cout_total_categorie)})
                              {i < a.imputations.length - 1 ? ', ' : ''}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                    <tr className="tr-total">
                      <td colSpan={4}>Total achats</td>
                      <td className="num negative">{fmt(-bilan.totalAchats)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>

            {/* Par produit */}
            <div className="card mt-16">
              <div className="card-title">Détail par produit</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th>Catégorie</th>
                      <th className="num">Qté</th>
                      <th className="num">CA</th>
                      <th className="num">Coût achat</th>
                      <th className="num">Marge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(bilan.byProduit)
                      .sort((a, b) => b[1].ca - a[1].ca)
                      .map(([prod, d]) => {
                        const cout = bilan.achats.reduce((s, a) => {
                          const imp = a.imputations?.find(i => i.produit_fini === prod)
                          return s + (imp?.cout_total_categorie || 0)
                        }, 0)
                        const marge = d.ca - cout
                        return (
                          <tr key={prod}>
                            <td>{prod}</td>
                            <td><span className="badge badge-gray">{d.cat}</span></td>
                            <td className="num">{Math.round(d.qte)}</td>
                            <td className="num">{fmt(d.ca)}</td>
                            <td className="num">{cout ? fmt(-cout) : '—'}</td>
                            <td className={'num ' + (marge >= 0 ? 'positive' : 'negative')}>{fmt(marge)}</td>
                          </tr>
                        )
                      })}
                    <tr className="tr-total">
                      <td colSpan={3}>Total</td>
                      <td className="num">{fmt(bilan.totalCA)}</td>
                      <td className="num negative">{fmt(-bilan.totalAchats)}</td>
                      <td className={'num ' + (bilan.marge >= 0 ? 'positive' : 'negative')}>{fmt(bilan.marge)}</td>
                    </tr>
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
