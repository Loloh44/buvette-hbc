/**
 * calculs.js — Fonctions de calcul partagées pour la buvette HBC La Fillière
 *
 * RÈGLE MARGE (source de vérité unique) :
 *   Marge nette = CA total
 *                − achats directs  (fournisseur ≠ 'Stock' ET article_stock_id IS NULL)
 *                − sorties stock validées (envoye_bilan = true)
 *                − dons (montant_calcule, statut ≠ 'annule')
 *
 * Les frais SumUp sont déjà dans les achats directs (fournisseur = 'SumUp').
 * Ne jamais les recalculer à partir du CA CB × taux.
 */

/**
 * Calcule la marge nette pour une ou plusieurs semaines.
 *
 * @param {Array} ventes         - lignes ventes (type_transaction, prix_ttc)
 * @param {Array} achats         - lignes achats (total_ttc, article_stock_id, fournisseur)
 * @param {Array} sortiesStock   - lignes mouvements_stock (type_mouvement, envoye_bilan, cout_total)
 * @param {Array} dons           - lignes dons (montant_calcule) — déjà filtrées statut ≠ 'annule'
 *
 * @returns {{ ca, achatsDirects, totalSortiesStock, totalDons, charges, marge, margePct }}
 */
export function calculerMarge(ventes = [], achats = [], sortiesStock = [], dons = []) {
  // CA = somme des ventes (type_transaction = 'Vente')
  const ventesOnly = ventes.filter(v => v.type_transaction === 'Vente')
  const ca = ventesOnly.reduce((s, v) => s + (v.prix_ttc || 0), 0)

  // Achats directs = hors stock (ni liés à un article_stock, ni générés par sortie stock)
  const achatsDirects = achats
    .filter(a => !a.article_stock_id && a.fournisseur !== 'Stock')
    .reduce((s, a) => s + (a.total_ttc || 0), 0)

  // Sorties stock validées = envoyées au bilan
  const totalSortiesStock = sortiesStock
    .filter(m => m.type_mouvement === 'sortie' && m.envoye_bilan)
    .reduce((s, m) => s + (m.cout_total || 0), 0)

  // Dons (déjà filtrés statut ≠ 'annule' côté appelant)
  const totalDons = dons.reduce((s, d) => s + (d.montant_calcule || 0), 0)

  const charges = achatsDirects + totalSortiesStock + totalDons
  const marge = ca - charges
  const margePct = ca > 0 ? marge / ca : 0

  return { ca, achatsDirects, totalSortiesStock, totalDons, charges, marge, margePct }
}

/**
 * Version par semaine : calcule la marge pour chaque semaine_id
 * à partir de tableaux multi-semaines (issus de requêtes .in('semaine_id', ids)).
 *
 * @param {string}  semaineId
 * @param {Array}   ventes       - toutes les ventes (multi-semaines)
 * @param {Array}   achats       - tous les achats (multi-semaines)
 * @param {Array}   sortiesStock - tous les mouvements stock (multi-semaines)
 * @param {Array}   dons         - tous les dons (multi-semaines)
 *
 * @returns {{ ca, achatsDirects, totalSortiesStock, totalDons, charges, marge, margePct }}
 */
export function calculerMargeSemaine(semaineId, ventes, achats, sortiesStock, dons) {
  const v = ventes.filter(x => x.semaine_id === semaineId)
  const a = achats.filter(x => x.semaine_id === semaineId)
  const s = sortiesStock.filter(x => x.semaine_id === semaineId)
  const d = dons.filter(x => x.semaine_id === semaineId)
  return calculerMarge(v, a, s, d)
}
