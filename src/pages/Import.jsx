import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { parseSumUpFile, detectSemaine, fmt } from '../lib/sumup'
import { useSortable } from '../hooks/useSortable.jsx'

// ─── Modal Mapping ────────────────────────────────────────────────────────────
function MappingModal({ nomSumup, produits, onSave, onClose }) {
  const [mode, setMode] = useState('existing') // existing | new
  const [selectedProduit, setSelectedProduit] = useState('')
  const [newNom, setNewNom] = useState(nomSumup)
  const [newCat, setNewCat] = useState('Boissons')
  const [newPrix, setNewPrix] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    let produitNom, produitId, categorie

    if (mode === 'existing') {
      const p = produits.find(p => p.id === selectedProduit)
      if (!p) return setSaving(false)
      produitNom = p.nom; produitId = p.id; categorie = p.categorie
    } else {
      // Create new product
      const { data, error } = await supabase.from('produits')
        .insert({ nom: newNom, categorie: newCat, prix_vente: newPrix ? parseFloat(newPrix) : null, actif: true })
        .select().single()
      if (error) { alert('Erreur : ' + error.message); setSaving(false); return }
      produitNom = data.nom; produitId = data.id; categorie = data.categorie
    }

    // Save mapping
    await supabase.from('product_mappings').upsert({
      nom_sumup: nomSumup, produit_id: produitId, produit_nom: produitNom, categorie
    }, { onConflict: 'nom_sumup' })

    onSave({ nomSumup, produitNom, produitId, categorie })
    setSaving(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 999,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{ background: 'white', borderRadius: 12, padding: 28, width: 440, boxShadow: '0 8px 32px rgba(0,0,0,.2)' }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Associer un produit</div>
        <div style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 20 }}>
          Nom SumUp : <strong style={{ color: 'var(--amber)' }}>"{nomSumup}"</strong>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button className={'btn btn-sm' + (mode === 'existing' ? ' btn-primary' : '')} onClick={() => setMode('existing')}>
            Produit existant
          </button>
          <button className={'btn btn-sm' + (mode === 'new' ? ' btn-primary' : '')} onClick={() => setMode('new')}>
            + Créer un nouveau produit
          </button>
        </div>

        {mode === 'existing' ? (
          <div className="form-group">
            <label className="form-label">Choisir le produit officiel</label>
            <select className="form-select" value={selectedProduit} onChange={e => setSelectedProduit(e.target.value)}>
              <option value="">— Sélectionner —</option>
              {['Boissons','Snacking','Boutique','Dons','Inconnu'].map(cat => (
                <optgroup key={cat} label={cat}>
                  {produits.filter(p => p.categorie === cat).map(p => (
                    <option key={p.id} value={p.id}>{p.nom} {p.prix_vente ? `(${fmt(p.prix_vente)})` : ''}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">Nom officiel du produit</label>
              <input className="form-input" value={newNom} onChange={e => setNewNom(e.target.value)} />
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Catégorie</label>
                <select className="form-select" value={newCat} onChange={e => setNewCat(e.target.value)}>
                  {['Boissons','Snacking','Boutique','Dons','Inconnu'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Prix de vente (€)</label>
                <input className="form-input" type="number" step="0.01" value={newPrix} onChange={e => setNewPrix(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        <div className="flex-gap mt-16">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || (mode === 'existing' && !selectedProduit)}>
            {saving ? <span className="spinner" /> : '💾'} Associer et mémoriser
          </button>
          <button className="btn" onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  )
}

// ─── Reassign Modal ───────────────────────────────────────────────────────────
function ReassignModal({ venteIds, semaines, onSave, onClose }) {
  const [targetSemaine, setTargetSemaine] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!targetSemaine) return
    setSaving(true)
    await supabase.from('ventes').update({ semaine_id: targetSemaine }).in('id', venteIds)
    onSave()
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'white', borderRadius: 12, padding: 28, width: 380 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Réaffecter {venteIds.length} vente(s)</div>
        <div className="form-group">
          <label className="form-label">Nouvelle semaine</label>
          <select className="form-select" value={targetSemaine} onChange={e => setTargetSemaine(e.target.value)}>
            <option value="">— Choisir —</option>
            {semaines.map(s => <option key={s.id} value={s.id}>S{s.numero} {s.annee} — {s.theme || s.date_debut}</option>)}
          </select>
        </div>
        <div className="flex-gap mt-16">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !targetSemaine}>
            {saving ? <span className="spinner" /> : '↗️'} Réaffecter
          </button>
          <button className="btn" onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Import Page ─────────────────────────────────────────────────────────
export default function ImportPage() {
  const [step, setStep] = useState('upload')
  const [file, setFile] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [semaines, setSemaines] = useState([])
  const [selectedSemaine, setSelectedSemaine] = useState('')
  const [createNew, setCreateNew] = useState(false)
  const [newSemaine, setNewSemaine] = useState({ numero: '', annee: new Date().getFullYear(), date_debut: '', date_fin: '', theme: '' })
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState(null)
  const [drag, setDrag] = useState(false)
  const [mappings, setMappings] = useState({})
  const [produits, setProduits] = useState([])
  const [mappingModal, setMappingModal] = useState(null)
  const [existingRefs, setExistingRefs] = useState(new Set())
  const inputRef = useRef()

  // ── Ventes list state ──
  const [semaineFilter, setSemaineFilter] = useState('')
  const [ventes, setVentes] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [reassignModal, setReassignModal] = useState(false)
  const [viewMode, setViewMode] = useState('import') // import | manage
  const { sorted: sortedVentes, Th } = useSortable(ventes, 'date_vente', 'desc')

  useEffect(() => {
    loadProduits()
    loadSemaines()
  }, [])

  useEffect(() => {
    if (semaineFilter) loadVentes()
  }, [semaineFilter])

  async function loadProduits() {
    const { data } = await supabase.from('produits').select('*').eq('actif', true).order('nom')
    setProduits(data || [])
  }

  async function loadSemaines() {
    const { data } = await supabase.from('semaines').select('*').order('annee', { ascending: false }).order('numero', { ascending: false })
    setSemaines(data || [])
  }

  async function loadVentes() {
    const { data } = await supabase.from('ventes').select('*').eq('semaine_id', semaineFilter).order('date_vente', { ascending: false })
    setVentes(data || [])
    setSelected(new Set())
  }

  async function loadMappings() {
    const { data } = await supabase.from('product_mappings').select('*')
    const m = {}
    data?.forEach(r => { m[r.nom_sumup.toLowerCase()] = r })
    setMappings(m)
    return m
  }

  async function handleFile(f) {
    if (!f) return
    setFile(f); setAlert(null)
    try {
      const buffer = await f.arrayBuffer()
      const result = parseSumUpFile(new Uint8Array(buffer))
      const m = await loadMappings()

      // Load existing refs from DB
      const { data: existingVentes } = await supabase.from('ventes').select('ref_transaction').not('ref_transaction', 'is', null)
      const refs = new Set(existingVentes?.map(v => v.ref_transaction) || [])
      setExistingRefs(refs)

      // Dedup within file
      const seenRefs = new Set()
      const deduped = []
      let dupCount = 0
      result.ventes.forEach(v => {
        const key = v.ref_transaction || `${v.date_vente}|${v.description}|${v.prix_ttc}`
        if (seenRefs.has(key)) { dupCount++; return }
        seenRefs.add(key)
        // Apply mapping
        const mapped = m[v.description?.toLowerCase()]
        if (mapped) {
          v.description = mapped.produit_nom
          v.categorie = mapped.categorie
        }
        deduped.push(v)
      })

      result.ventes = deduped
      result.dupInFile = dupCount
      result.dupInDB = deduped.filter(v => v.ref_transaction && refs.has(v.ref_transaction)).length

      const detected = detectSemaine(result.ventes)
      setNewSemaine(s => ({ ...s, ...detected }))
      setParsed(result)
      setStep('preview')
    } catch (e) {
      setAlert({ type: 'error', msg: 'Erreur lecture : ' + e.message })
    }
  }

  async function handleImport() {
    setLoading(true); setAlert(null)
    try {
      let semaineId = selectedSemaine
      if (createNew || !semaineId) {
        const { data: s, error } = await supabase.from('semaines')
          .insert({ ...newSemaine, annee: +newSemaine.annee, numero: +newSemaine.numero })
          .select().single()
        if (error) throw error
        semaineId = s.id
      }

      // Filter out DB duplicates
      const toInsert = parsed.ventes.filter(v => !v.ref_transaction || !existingRefs.has(v.ref_transaction))

      const batch = 200
      for (let i = 0; i < toInsert.length; i += batch) {
        const chunk = toInsert.slice(i, i + batch).map(v => ({ ...v, semaine_id: semaineId }))
        const { error } = await supabase.from('ventes').insert(chunk)
        if (error) throw error
      }

      setAlert({ type: 'success', msg: `✅ ${toInsert.length} ventes importées — ${parsed.dupInFile + parsed.dupInDB} doublons ignorés` })
      setStep('done')
      loadSemaines()
    } catch (e) {
      setAlert({ type: 'error', msg: 'Erreur import : ' + e.message })
    }
    setLoading(false)
  }

  // Unknown product names (not in mappings, not in produits)
  const unknownNames = parsed ? [...new Set(
    parsed.ventes.map(v => v.description).filter(d => {
      const inMappings = mappings[d?.toLowerCase()]
      const inProduits = produits.some(p => p.nom.toLowerCase() === d?.toLowerCase())
      return !inMappings && !inProduits
    })
  )] : []

  // ── Manage ventes ──
  async function handleDeleteSelected() {
    if (!confirm(`Supprimer ${selected.size} vente(s) ?`)) return
    await supabase.from('ventes').delete().in('id', [...selected])
    loadVentes()
  }

  function toggleSelect(id) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleAll() {
    setSelected(s => s.size === ventes.length ? new Set() : new Set(ventes.map(v => v.id)))
  }

  const catStats = parsed ? Object.entries(
    parsed.ventes.reduce((acc, v) => { acc[v.categorie || 'Inconnu'] = (acc[v.categorie || 'Inconnu'] || 0) + v.prix_ttc; return acc }, {})
  ).sort((a, b) => b[1] - a[1]) : []

  return (
    <div>
      {mappingModal && (
        <MappingModal
          nomSumup={mappingModal}
          produits={produits}
          onSave={(result) => {
            setMappings(m => ({ ...m, [result.nomSumup.toLowerCase()]: result }))
            setParsed(p => ({
              ...p,
              ventes: p.ventes.map(v =>
                v.description === mappingModal
                  ? { ...v, description: result.produitNom, categorie: result.categorie }
                  : v
              )
            }))
            setMappingModal(null)
            loadProduits()
          }}
          onClose={() => setMappingModal(null)}
        />
      )}

      {reassignModal && (
        <ReassignModal
          venteIds={[...selected]}
          semaines={semaines}
          onSave={() => { setReassignModal(false); loadVentes() }}
          onClose={() => setReassignModal(false)}
        />
      )}

      <div className="page-header">
        <div>
          <p className="page-title">Import & Gestion des ventes</p>
          <p className="page-subtitle">Importer SumUp · Gérer les ventes importées</p>
        </div>
        <div className="flex-gap">
          <button className={'btn' + (viewMode === 'import' ? ' btn-primary' : '')} onClick={() => setViewMode('import')}>📂 Import</button>
          <button className={'btn' + (viewMode === 'manage' ? ' btn-primary' : '')} onClick={() => setViewMode('manage')}>📋 Gérer les ventes</button>
        </div>
      </div>

      <div className="page-body">
        {alert && <div className={`alert alert-${alert.type}`}>{alert.msg}</div>}

        {/* ── IMPORT MODE ── */}
        {viewMode === 'import' && (
          <>
            {step === 'upload' && (
              <div className="card" style={{ maxWidth: 600 }}>
                <div className="card-title">Fichier SumUp (.xlsx)</div>
                <div
                  className={'upload-zone' + (drag ? ' drag-over' : '')}
                  onClick={() => inputRef.current.click()}
                  onDragOver={e => { e.preventDefault(); setDrag(true) }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]) }}
                >
                  <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
                  <div className="upload-icon">📂</div>
                  <div className="upload-title">Cliquer ou glisser-déposer</div>
                  <div className="upload-sub">Export SumUp au format .xlsx</div>
                </div>
              </div>
            )}

            {step === 'preview' && parsed && (
              <>
                {/* Stats */}
                <div className="metrics-grid" style={{ maxWidth: 700 }}>
                  <div className="metric-card green">
                    <div className="metric-label">Ventes valides</div>
                    <div className="metric-value">{parsed.ventes.length}</div>
                    <div className="metric-sub">CA : {fmt(parsed.ventes.reduce((s, v) => s + v.prix_ttc, 0))}</div>
                  </div>
                  <div className="metric-card amber">
                    <div className="metric-label">Doublons fichier</div>
                    <div className="metric-value">{parsed.dupInFile}</div>
                    <div className="metric-sub">ignorés automatiquement</div>
                  </div>
                  <div className="metric-card amber">
                    <div className="metric-label">Déjà en base</div>
                    <div className="metric-value">{parsed.dupInDB}</div>
                    <div className="metric-sub">ne seront pas réimportés</div>
                  </div>
                  <div className="metric-card" style={{ borderLeft: unknownNames.length ? '3px solid var(--amber)' : '3px solid var(--green)' }}>
                    <div className="metric-label">Noms inconnus</div>
                    <div className="metric-value" style={{ color: unknownNames.length ? 'var(--amber)' : 'var(--green)' }}>{unknownNames.length}</div>
                    <div className="metric-sub">à associer ci-dessous</div>
                  </div>
                </div>

                {/* Unknown names mapping */}
                {unknownNames.length > 0 && (
                  <div className="card mb-16" style={{ maxWidth: 700 }}>
                    <div className="card-title">⚠️ Noms de produits non reconnus</div>
                    <p className="text-muted text-sm mb-16">Ces noms n'existent pas dans votre référentiel. Associez-les à un produit officiel pour que les marges soient calculées correctement.</p>
                    {unknownNames.map(name => (
                      <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--gray-100)' }}>
                        <span className="badge badge-amber">"{name}"</span>
                        <button className="btn btn-sm" onClick={() => setMappingModal(name)}>
                          🔗 Associer à un produit
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* CA par catégorie */}
                <div className="card mb-16" style={{ maxWidth: 700 }}>
                  <div className="card-title">Aperçu par catégorie</div>
                  <table>
                    <thead><tr><th>Catégorie</th><th className="num">CA</th></tr></thead>
                    <tbody>
                      {catStats.map(([c, v]) => <tr key={c}><td>{c}</td><td className="num">{fmt(v)}</td></tr>)}
                    </tbody>
                  </table>
                </div>

                {/* Semaine */}
                <div className="card" style={{ maxWidth: 700 }}>
                  <div className="card-title">Associer à une semaine</div>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                    <button className={'btn' + (!createNew ? ' btn-primary' : '')} onClick={() => setCreateNew(false)}>Semaine existante</button>
                    <button className={'btn' + (createNew ? ' btn-primary' : '')} onClick={() => setCreateNew(true)}>Nouvelle semaine</button>
                  </div>
                  {!createNew ? (
                    <div className="form-group">
                      <label className="form-label">Choisir la semaine</label>
                      <select className="form-select" value={selectedSemaine} onChange={e => setSelectedSemaine(e.target.value)}>
                        <option value="">— Auto (nouvelle) —</option>
                        {semaines.map(s => <option key={s.id} value={s.id}>S{s.numero} {s.annee} — {s.theme || 'Sans thème'} ({s.date_debut})</option>)}
                      </select>
                    </div>
                  ) : (
                    <div className="form-grid">
                      <div className="form-group"><label className="form-label">Semaine n°</label><input className="form-input" type="number" value={newSemaine.numero} onChange={e => setNewSemaine(s => ({ ...s, numero: e.target.value }))} /></div>
                      <div className="form-group"><label className="form-label">Année</label><input className="form-input" type="number" value={newSemaine.annee} onChange={e => setNewSemaine(s => ({ ...s, annee: e.target.value }))} /></div>
                      <div className="form-group"><label className="form-label">Date début</label><input className="form-input" type="date" value={newSemaine.date_debut} onChange={e => setNewSemaine(s => ({ ...s, date_debut: e.target.value }))} /></div>
                      <div className="form-group"><label className="form-label">Date fin</label><input className="form-input" type="date" value={newSemaine.date_fin} onChange={e => setNewSemaine(s => ({ ...s, date_fin: e.target.value }))} /></div>
                      <div className="form-group" style={{ gridColumn: '1/-1' }}><label className="form-label">Thème</label><input className="form-input" value={newSemaine.theme} onChange={e => setNewSemaine(s => ({ ...s, theme: e.target.value }))} placeholder="Movember, Octobre Rose..." /></div>
                    </div>
                  )}
                  <div className="flex-gap mt-16">
                    <button className="btn btn-primary" onClick={handleImport} disabled={loading}>
                      {loading ? <span className="spinner" /> : '⬆️'} Importer {parsed.ventes.length - parsed.dupInDB} ventes
                    </button>
                    <button className="btn" onClick={() => { setStep('upload'); setParsed(null); setFile(null) }}>Annuler</button>
                  </div>
                </div>
              </>
            )}

            {step === 'done' && (
              <div className="card" style={{ textAlign: 'center', padding: 40, maxWidth: 500 }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Import réussi !</div>
                <div className="flex-gap mt-16" style={{ justifyContent: 'center' }}>
                  <button className="btn btn-primary" onClick={() => { setStep('upload'); setParsed(null); setFile(null) }}>📂 Nouvel import</button>
                  <button className="btn" onClick={() => setViewMode('manage')}>📋 Gérer les ventes</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── MANAGE MODE ── */}
        {viewMode === 'manage' && (
          <div className="card">
            <div className="flex-between mb-16">
              <div className="flex-gap">
                <div className="card-title" style={{ marginBottom: 0 }}>Ventes importées</div>
                <select
                  style={{ padding: '6px 10px', border: '1px solid var(--gray-300)', borderRadius: 6, fontSize: 13 }}
                  value={semaineFilter}
                  onChange={e => setSemaineFilter(e.target.value)}
                >
                  <option value="">— Choisir une semaine —</option>
                  {semaines.map(s => <option key={s.id} value={s.id}>S{s.numero} {s.annee} — {s.theme || s.date_debut}</option>)}
                </select>
              </div>
              {selected.size > 0 && (
                <div className="flex-gap">
                  <span className="badge badge-blue">{selected.size} sélectionnée(s)</span>
                  <button className="btn btn-sm" onClick={() => setReassignModal(true)}>↗️ Réaffecter</button>
                  <button className="btn btn-danger btn-sm" onClick={handleDeleteSelected}>🗑️ Supprimer</button>
                </div>
              )}
            </div>

            {!semaineFilter ? (
              <div className="empty-state">Sélectionnez une semaine</div>
            ) : ventes.length === 0 ? (
              <div className="empty-state"><div className="empty-state-icon">📋</div><p>Aucune vente</p></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th><input type="checkbox" checked={selected.size === ventes.length} onChange={toggleAll} /></th>
                      <Th col="date_vente">Date</Th>
                      <Th col="description">Produit</Th>
                      <Th col="categorie">Catégorie</Th>
                      <Th col="quantite" className="num">Qté</Th>
                      <Th col="prix_ttc" className="num">TTC</Th>
                      <Th col="moyen_paiement">Paiement</Th>
                      <Th col="compte">Compte</Th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedVentes.map(v => (
                      <tr key={v.id} style={{ background: selected.has(v.id) ? 'var(--green-light)' : '' }}>
                        <td><input type="checkbox" checked={selected.has(v.id)} onChange={() => toggleSelect(v.id)} /></td>
                        <td className="text-muted text-sm">{new Date(v.date_vente).toLocaleDateString('fr-FR')}</td>
                        <td style={{ fontWeight: 500 }}>{v.description}</td>
                        <td><span className="badge badge-gray">{v.categorie}</span></td>
                        <td className="num">{v.quantite}</td>
                        <td className="num" style={{ fontWeight: 600 }}>{fmt(v.prix_ttc)}</td>
                        <td>{v.moyen_paiement}</td>
                        <td className="text-muted text-sm">{v.compte}</td>
                        <td>
                          <button className="btn btn-danger btn-sm" onClick={async () => {
                            await supabase.from('ventes').delete().eq('id', v.id)
                            loadVentes()
                          }}>🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--gray-400)', borderTop: '1px solid var(--gray-100)' }}>
                  {ventes.length} ventes · CA total : {fmt(ventes.reduce((s, v) => s + v.prix_ttc, 0))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
