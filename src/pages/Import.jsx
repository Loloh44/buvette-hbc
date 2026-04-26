import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { parseSumUpFile, fmt } from '../lib/sumup'
import { useSortable } from '../hooks/useSortable.jsx'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getISOWeek(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
}

function groupByWeek(ventes) {
  const groups = {}
  ventes.forEach(v => {
    const date = new Date(v.date_vente)
    const annee = date.getFullYear()
    const numero = getISOWeek(date)
    const key = `${annee}-${numero}`
    if (!groups[key]) {
      groups[key] = {
        key, annee, numero,
        date_debut: v.date_vente.slice(0, 10),
        date_fin: v.date_vente.slice(0, 10),
        ventes: [],
        ca: 0,
        theme: '',
      }
    }
    groups[key].ventes.push(v)
    groups[key].ca += v.prix_ttc || 0
    if (v.date_vente < groups[key].date_debut) groups[key].date_debut = v.date_vente.slice(0, 10)
    if (v.date_vente > groups[key].date_fin) groups[key].date_fin = v.date_vente.slice(0, 10)
  })
  return Object.values(groups).sort((a, b) => a.key.localeCompare(b.key))
}

// ─── Modal Mapping ────────────────────────────────────────────────────────────
function MappingModal({ nomSumup, produits, onSave, onClose }) {
  const [mode, setMode] = useState('existing')
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
      const { data, error } = await supabase.from('produits')
        .insert({ nom: newNom, categorie: newCat, prix_vente: newPrix ? parseFloat(newPrix) : null, actif: true })
        .select().single()
      if (error) { alert('Erreur : ' + error.message); setSaving(false); return }
      produitNom = data.nom; produitId = data.id; categorie = data.categorie
    }
    await supabase.from('product_mappings').upsert(
      { nom_sumup: nomSumup, produit_id: produitId, produit_nom: produitNom, categorie },
      { onConflict: 'nom_sumup' }
    )
    onSave({ nomSumup, produitNom, produitId, categorie })
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'white', borderRadius: 12, padding: 28, width: 440, boxShadow: '0 8px 32px rgba(0,0,0,.2)' }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Associer un produit</div>
        <div style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 20 }}>
          Nom SumUp : <strong style={{ color: 'var(--amber)' }}>"{nomSumup}"</strong>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button className={'btn btn-sm' + (mode === 'existing' ? ' btn-primary' : '')} onClick={() => setMode('existing')}>Produit existant</button>
          <button className={'btn btn-sm' + (mode === 'new' ? ' btn-primary' : '')} onClick={() => setMode('new')}>+ Nouveau produit</button>
        </div>
        {mode === 'existing' ? (
          <div className="form-group">
            <label className="form-label">Produit officiel</label>
            <select className="form-select" value={selectedProduit} onChange={e => setSelectedProduit(e.target.value)}>
              <option value="">— Sélectionner —</option>
              {['Boissons', 'Snacking', 'Boutique', 'Dons', 'Inconnu'].map(cat => (
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
              <label className="form-label">Nom officiel</label>
              <input className="form-input" value={newNom} onChange={e => setNewNom(e.target.value)} />
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Catégorie</label>
                <select className="form-select" value={newCat} onChange={e => setNewCat(e.target.value)}>
                  {['Boissons', 'Snacking', 'Boutique', 'Dons', 'Inconnu'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Prix vente (€)</label>
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
    onSave(); setSaving(false)
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

// ─── Week Confirmation Card ───────────────────────────────────────────────────
function WeekCard({ group, index, existingSemaines, onChange }) {
  const existing = existingSemaines.find(s => s.annee === group.annee && s.numero === group.numero)

  return (
    <div style={{
      border: '1px solid var(--gray-200)', borderRadius: 10, padding: 16, marginBottom: 12,
      borderLeft: `4px solid ${existing ? 'var(--green)' : 'var(--amber)'}`
    }}>
      <div className="flex-between" style={{ marginBottom: 12 }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Semaine {group.numero} — {group.annee}</span>
          <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--gray-400)' }}>
            {group.date_debut} → {group.date_fin}
          </span>
          {existing && <span className="badge badge-green" style={{ marginLeft: 8 }}>Semaine existante</span>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{fmt(group.ca)}</div>
          <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{group.ventes.length} ventes</div>
        </div>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Thème / Événement</label>
          <input
            className="form-input"
            value={group.theme}
            onChange={e => onChange(index, 'theme', e.target.value)}
            placeholder={existing?.theme || 'Ex: Movember, Fête du club...'}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Caisse début (€)</label>
          <input
            className="form-input"
            type="number"
            step="0.01"
            value={group.caisse_debut || ''}
            onChange={e => onChange(index, 'caisse_debut', e.target.value)}
            placeholder="0"
          />
        </div>
      </div>

      {existing && (
        <div className="alert alert-info" style={{ marginTop: 8, marginBottom: 0 }}>
          ℹ️ Cette semaine existe déjà — les nouvelles ventes seront ajoutées, les doublons ignorés.
        </div>
      )}
    </div>
  )
}

// ─── Main Import Page ─────────────────────────────────────────────────────────
export default function ImportPage() {
  const [step, setStep] = useState('upload') // upload | mapping | weeks | importing | done
  const [file, setFile] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [weekGroups, setWeekGroups] = useState([])
  const [semaines, setSemaines] = useState([])
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState(null)
  const [drag, setDrag] = useState(false)
  const [mappings, setMappings] = useState({})
  const [produits, setProduits] = useState([])
  const [mappingModal, setMappingModal] = useState(null)
  const [existingRefs, setExistingRefs] = useState(new Set())
  const [importResults, setImportResults] = useState([])

  // Manage ventes
  const [semaineFilter, setSemaineFilter] = useState('')
  const [ventes, setVentes] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [reassignModal, setReassignModal] = useState(false)
  const [viewMode, setViewMode] = useState('import')
  const { sorted: sortedVentes, Th } = useSortable(ventes, 'date_vente', 'desc')

  useEffect(() => { loadProduits(); loadSemaines() }, [])
  useEffect(() => { if (semaineFilter) loadVentes() }, [semaineFilter])

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

      // Load existing refs
      const { data: existingVentes } = await supabase
        .from('ventes').select('ref_transaction, description, prix_ttc').not('ref_transaction', 'is', null)
      const refs = new Set(existingVentes?.map(v => `${v.ref_transaction}||${v.description}||${v.prix_ttc}`) || [])
      setExistingRefs(refs)

      // Dedup within file
      // IMPORTANT: SumUp exports ONE LINE PER ARTICLE for a single transaction
      // (same ref_transaction, different articles). We must NOT dedup by ref alone.
      // Dedup key = ref + description + prix to catch true duplicates only.
      const seenRefs = new Set()
      const deduped = []
      let dupCount = 0
      result.ventes.forEach(v => {
        const key = v._dedup_key || `${v.date_vente}|${v.description}|${v.prix_ttc}`
        if (seenRefs.has(key)) { dupCount++; return }
        seenRefs.add(key)
        const mapped = m[v.description?.toLowerCase()]
        if (mapped) { v.description = mapped.produit_nom; v.categorie = mapped.categorie }
        deduped.push(v)
      })

      result.ventes = deduped
      result.dupInFile = dupCount
      result.dupInDB = deduped.filter(v => v.ref_transaction && refs.has(v.ref_transaction)).length

      setParsed(result)

      // Group by week
      const groups = groupByWeek(deduped)
      setWeekGroups(groups)
      setStep('mapping')
    } catch (e) {
      setAlert({ type: 'error', msg: 'Erreur lecture : ' + e.message })
    }
  }

  // Unknown names
  const unknownNames = parsed ? [...new Set(
    parsed.ventes.map(v => v.description).filter(d => {
      const inMappings = mappings[d?.toLowerCase()]
      const inProduits = produits.some(p => p.nom.toLowerCase() === d?.toLowerCase())
      return !inMappings && !inProduits
    })
  )] : []

  function applyMapping(result) {
    setMappings(m => ({ ...m, [result.nomSumup.toLowerCase()]: result }))
    setParsed(p => ({
      ...p,
      ventes: p.ventes.map(v => v.description === result.nomSumup
        ? { ...v, description: result.produitNom, categorie: result.categorie }
        : v
      )
    }))
    setWeekGroups(groups => groups.map(g => ({
      ...g,
      ventes: g.ventes.map(v => v.description === result.nomSumup
        ? { ...v, description: result.produitNom, categorie: result.categorie }
        : v
      )
    })))
    setMappingModal(null)
    loadProduits()
  }

  function updateWeekGroup(index, field, value) {
    setWeekGroups(groups => groups.map((g, i) => i === index ? { ...g, [field]: value } : g))
  }

  async function handleImport() {
    setLoading(true); setAlert(null); setStep('importing')
    const results = []

    for (const group of weekGroups) {
      try {
        // Find or create semaine
        let semaineId
        const existing = semaines.find(s => s.annee === group.annee && s.numero === group.numero)
        if (existing) {
          semaineId = existing.id
          // Update theme/caisse if provided
          if (group.theme || group.caisse_debut) {
            await supabase.from('semaines').update({
              theme: group.theme || existing.theme,
              caisse_debut: group.caisse_debut ? parseFloat(group.caisse_debut) : existing.caisse_debut,
            }).eq('id', semaineId)
          }
        } else {
          const { data: s, error } = await supabase.from('semaines').insert({
            annee: group.annee,
            numero: group.numero,
            date_debut: group.date_debut,
            date_fin: group.date_fin,
            theme: group.theme || null,
            caisse_debut: group.caisse_debut ? parseFloat(group.caisse_debut) : 0,
            caisse_fin: 0,
          }).select().single()
          if (error) throw error
          semaineId = s.id
        }

        // Filter duplicates
        const toInsert = group.ventes.filter(v => {
          if (!v._dedup_key && !v.ref_transaction) return true
          const key = v._dedup_key || v.ref_transaction
          return !existingRefs.has(key)
        })
        const skipped = group.ventes.length - toInsert.length

        // Insert in batches
        const batch = 200
        for (let i = 0; i < toInsert.length; i += batch) {
          const chunk = toInsert.slice(i, i + batch).map(v => ({ ...v, semaine_id: semaineId }))
          const { error } = await supabase.from('ventes').insert(chunk)
          if (error) throw error
        }

        results.push({ group, inserted: toInsert.length, skipped, ok: true })
      } catch (e) {
        results.push({ group, error: e.message, ok: false })
      }
    }

    setImportResults(results)
    setStep('done')
    setLoading(false)
    loadSemaines()
  }

  // Manage
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

  const inputRef = useRef()

  return (
    <div>
      {mappingModal && (
        <MappingModal nomSumup={mappingModal} produits={produits} onSave={applyMapping} onClose={() => setMappingModal(null)} />
      )}
      {reassignModal && (
        <ReassignModal venteIds={[...selected]} semaines={semaines} onSave={() => { setReassignModal(false); loadVentes() }} onClose={() => setReassignModal(false)} />
      )}

      <div className="page-header">
        <div>
          <p className="page-title">Import & Gestion des ventes</p>
          <p className="page-subtitle">Import SumUp multi-semaines · Gestion des ventes</p>
        </div>
        <div className="flex-gap">
          <button className={'btn' + (viewMode === 'import' ? ' btn-primary' : '')} onClick={() => setViewMode('import')}>📂 Import</button>
          <button className={'btn' + (viewMode === 'manage' ? ' btn-primary' : '')} onClick={() => setViewMode('manage')}>📋 Gérer les ventes</button>
        </div>
      </div>

      <div className="page-body">
        {alert && <div className={`alert alert-${alert.type}`}>{alert.msg}</div>}

        {/* ── IMPORT ── */}
        {viewMode === 'import' && (
          <>
            {/* Step: Upload */}
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
                  <div className="upload-sub">Export SumUp — peut contenir plusieurs semaines</div>
                </div>
              </div>
            )}

            {/* Step: Mapping */}
            {step === 'mapping' && parsed && (
              <>
                <div className="metrics-grid" style={{ maxWidth: 700 }}>
                  <div className="metric-card green">
                    <div className="metric-label">Semaines détectées</div>
                    <div className="metric-value">{weekGroups.length}</div>
                  </div>
                  <div className="metric-card green">
                    <div className="metric-label">Ventes valides</div>
                    <div className="metric-value">{parsed.ventes.length}</div>
                    <div className="metric-sub">CA : {fmt(parsed.ventes.reduce((s, v) => s + v.prix_ttc, 0))}</div>
                  </div>
                  <div className="metric-card amber">
                    <div className="metric-label">Doublons ignorés</div>
                    <div className="metric-value">{parsed.dupInFile + parsed.dupInDB}</div>
                  </div>
                  <div className="metric-card" style={{ borderLeft: unknownNames.length ? '3px solid var(--amber)' : '3px solid var(--green)' }}>
                    <div className="metric-label">Noms inconnus</div>
                    <div className="metric-value" style={{ color: unknownNames.length ? 'var(--amber)' : 'var(--green)' }}>{unknownNames.length}</div>
                  </div>
                </div>

                {unknownNames.length > 0 && (
                  <div className="card mb-16" style={{ maxWidth: 700 }}>
                    <div className="card-title">⚠️ Noms de produits non reconnus</div>
                    <p className="text-muted text-sm mb-16">Associez-les maintenant ou passez cette étape — vous pourrez le faire plus tard dans "Produits".</p>
                    {unknownNames.map(name => (
                      <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--gray-100)' }}>
                        <span className="badge badge-amber">"{name}"</span>
                        <button className="btn btn-sm" onClick={() => setMappingModal(name)}>🔗 Associer</button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex-gap mb-16" style={{ maxWidth: 700 }}>
                  <button className="btn btn-primary" onClick={() => setStep('weeks')}>
                    Continuer → Confirmer les semaines
                  </button>
                  <button className="btn" onClick={() => { setStep('upload'); setParsed(null) }}>Annuler</button>
                </div>
              </>
            )}

            {/* Step: Weeks confirmation */}
            {step === 'weeks' && (
              <div style={{ maxWidth: 700 }}>
                <div className="card mb-16">
                  <div className="card-title">Semaines détectées dans le fichier</div>
                  <p className="text-muted text-sm mb-16">
                    Vérifiez et complétez les informations pour chaque semaine. Les semaines déjà existantes en base sont indiquées en vert.
                  </p>
                  {weekGroups.map((group, i) => (
                    <WeekCard
                      key={group.key}
                      group={group}
                      index={i}
                      existingSemaines={semaines}
                      onChange={updateWeekGroup}
                    />
                  ))}
                </div>

                <div className="flex-gap">
                  <button className="btn btn-primary btn-lg" onClick={handleImport} disabled={loading}>
                    {loading ? <span className="spinner" /> : '⬆️'} Importer {parsed.ventes.length} ventes en {weekGroups.length} semaine(s)
                  </button>
                  <button className="btn" onClick={() => setStep('mapping')}>← Retour</button>
                </div>
              </div>
            )}

            {/* Step: Importing */}
            {step === 'importing' && (
              <div className="card" style={{ textAlign: 'center', padding: 40, maxWidth: 500 }}>
                <div className="spinner" style={{ width: 40, height: 40, margin: '0 auto 16px', borderWidth: 3 }} />
                <div style={{ fontSize: 16, fontWeight: 600 }}>Import en cours…</div>
                <p className="text-muted mt-8">Traitement de {weekGroups.length} semaine(s)</p>
              </div>
            )}

            {/* Step: Done */}
            {step === 'done' && (
              <div className="card" style={{ maxWidth: 600 }}>
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                  <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>Import terminé !</div>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Semaine</th>
                      <th>Thème</th>
                      <th className="num">Importées</th>
                      <th className="num">Doublons</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResults.map((r, i) => (
                      <tr key={i}>
                        <td><strong>S{r.group.numero} {r.group.annee}</strong></td>
                        <td>{r.group.theme || <span className="text-muted">—</span>}</td>
                        <td className="num positive">{r.ok ? r.inserted : '—'}</td>
                        <td className="num">{r.ok ? r.skipped : '—'}</td>
                        <td>{r.ok ? <span className="badge badge-green">✓ OK</span> : <span className="badge badge-red">Erreur</span>}</td>
                      </tr>
                    ))}
                    <tr className="tr-total">
                      <td colSpan={2}>Total</td>
                      <td className="num positive">{importResults.reduce((s, r) => s + (r.inserted || 0), 0)}</td>
                      <td className="num">{importResults.reduce((s, r) => s + (r.skipped || 0), 0)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
                <div className="flex-gap mt-16">
                  <button className="btn btn-primary" onClick={() => { setStep('upload'); setParsed(null); setFile(null); setWeekGroups([]) }}>
                    📂 Nouvel import
                  </button>
                  <button className="btn" onClick={() => setViewMode('manage')}>📋 Gérer les ventes</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── MANAGE ── */}
        {viewMode === 'manage' && (
          <div className="card">
            <div className="flex-between mb-16">
              <div className="flex-gap">
                <div className="card-title" style={{ marginBottom: 0 }}>Ventes importées</div>
                <select
                  style={{ padding: '6px 10px', border: '1px solid var(--gray-300)', borderRadius: 6, fontSize: 13 }}
                  value={semaineFilter} onChange={e => setSemaineFilter(e.target.value)}
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
                      <th><input type="checkbox" checked={selected.size === ventes.length && ventes.length > 0} onChange={toggleAll} /></th>
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
                  {ventes.length} ventes · CA : {fmt(ventes.reduce((s, v) => s + v.prix_ttc, 0))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
