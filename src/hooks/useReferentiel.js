// ══════════════════════════════════════════════════════════════════════════════
// Hook partagé — Référentiel HBC La Fillière
// Charge une seule fois : catégories, produits, mappings SumUp, moyens paiement
// Utilisé par toutes les pages pour avoir le même référentiel partout
// ══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

let _cache = null
let _listeners = []
let _loading = false

async function fetchReferentiel() {
  const [
    { data: categories },
    { data: produits },
    { data: mappings },
    { data: paiements },
    { data: parametres },
  ] = await Promise.all([
    supabase.from('categories').select('*').eq('actif', true).order('ordre').order('nom'),
    supabase.from('produits').select('*').eq('actif', true).order('categorie').order('nom'),
    supabase.from('product_mappings').select('*'),
    supabase.from('moyens_paiement').select('*').eq('actif', true).order('ordre'),
    supabase.from('parametres').select('*'),
  ])

  // Index mappings par nom SumUp pour accès O(1)
  const mappingsIndex = {}
  mappings?.forEach(m => {
    mappingsIndex[m.nom_sumup] = {
      produit: m.produit_nom,
      categorie: m.categorie,
    }
  })

  // Index paramètres par clé
  const paramsIndex = {}
  parametres?.forEach(p => { paramsIndex[p.cle] = p.valeur })

  // Moyens de paiement carte (soumis aux frais SumUp)
  const carteModes = new Set(
    paiements?.filter(p => p.est_carte).map(p => p.nom) || []
  )

  // Noms des catégories pour validation
  const categoriesNoms = categories?.map(c => c.nom) || []

  return {
    categories: categories || [],
    categoriesNoms,
    produits: produits || [],
    mappings: mappings || [],
    mappingsIndex,
    paiements: paiements || [],
    carteModes,
    parametres: paramsIndex,
    // Helpers
    mapperNom: (nomSumup) => mappingsIndex[nomSumup]?.produit || nomSumup,
    mapperCategorie: (nomSumup, fallback) => mappingsIndex[nomSumup]?.categorie || fallback || 'Divers',
    tauxSumup: parseFloat(paramsIndex['taux_sumup'] || '1.75') / 100,
    libelleFraisSumup: paramsIndex['frais_sumup_libelle'] || 'Frais SumUp',
    libelleEcartCaisse: paramsIndex['ecart_caisse_libelle'] || 'Écart de caisse (cash on the way)',
  }
}

export function useReferentiel() {
  const [ref, setRef] = useState(_cache)
  const [loading, setLoading] = useState(!_cache)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (_cache) { setRef(_cache); setLoading(false); return }

    const listener = (data) => { setRef(data); setLoading(false) }
    _listeners.push(listener)

    if (!_loading) {
      _loading = true
      fetchReferentiel()
        .then(data => {
          _cache = data
          _listeners.forEach(l => l(data))
          _listeners = []
          _loading = false
        })
        .catch(err => {
          setError(err)
          setLoading(false)
          _loading = false
        })
    }

    return () => { _listeners = _listeners.filter(l => l !== listener) }
  }, [])

  const reload = useCallback(async () => {
    _cache = null
    setLoading(true)
    try {
      const data = await fetchReferentiel()
      _cache = data
      setRef(data)
    } catch(err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  return { ref, loading, error, reload }
}

// Helper standalone pour les pages qui chargent le référentiel manuellement
export async function loadReferentiel() {
  if (_cache) return _cache
  const data = await fetchReferentiel()
  _cache = data
  return data
}

// Invalider le cache (à appeler après modification du référentiel)
export function invalidateReferentiel() {
  _cache = null
}
