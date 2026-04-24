import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseSumUpFile, detectSemaine, fmt } from '../lib/sumup'

export default function ImportPage() {
  const [step, setStep] = useState('upload') // upload | preview | semaine | done
  const [file, setFile] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [semaines, setSemaines] = useState([])
  const [selectedSemaine, setSelectedSemaine] = useState('')
  const [newSemaine, setNewSemaine] = useState({ numero: '', annee: new Date().getFullYear(), date_debut: '', date_fin: '', theme: '' })
  const [createNew, setCreateNew] = useState(false)
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState(null)
  const [drag, setDrag] = useState(false)
  const inputRef = useRef()

  async function handleFile(f) {
    if (!f) return
    setFile(f)
    setAlert(null)
    try {
      const buffer = await f.arrayBuffer()
      const result = parseSumUpFile(new Uint8Array(buffer))
      setParsed(result)
      const detected = detectSemaine(result.ventes)
      setNewSemaine(s => ({ ...s, ...detected }))

      // Load existing semaines
      const { data } = await supabase.from('semaines').select('*').order('annee', { ascending: false }).order('numero', { ascending: false })
      setSemaines(data || [])

      setStep('preview')
    } catch (e) {
      setAlert({ type: 'error', msg: 'Erreur lors de la lecture du fichier : ' + e.message })
    }
  }

  async function handleImport() {
    setLoading(true)
    setAlert(null)
    try {
      let semaineId = selectedSemaine

      if (createNew || !semaineId) {
        // Create semaine
        const { data: s, error } = await supabase
          .from('semaines')
          .insert({ ...newSemaine, annee: +newSemaine.annee, numero: +newSemaine.numero })
          .select().single()
        if (error) throw error
        semaineId = s.id
      }

      // Delete existing ventes for this semaine
      await supabase.from('ventes').delete().eq('semaine_id', semaineId)

      // Insert ventes in batches
      const batch = 200
      for (let i = 0; i < parsed.ventes.length; i += batch) {
        const chunk = parsed.ventes.slice(i, i + batch).map(v => ({ ...v, semaine_id: semaineId }))
        const { error } = await supabase.from('ventes').insert(chunk)
        if (error) throw error
      }

      setAlert({ type: 'success', msg: `✅ ${parsed.ventes.length} ventes importées avec succès !` })
      setStep('done')
    } catch (e) {
      setAlert({ type: 'error', msg: 'Erreur import : ' + e.message })
    }
    setLoading(false)
  }

  const catStats = parsed ? Object.entries(
    parsed.ventes.reduce((acc, v) => {
      const c = v.categorie || 'Inconnu'
      acc[c] = (acc[c] || 0) + v.prix_ttc
      return acc
    }, {})
  ).sort((a, b) => b[1] - a[1]) : []

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="page-title">Import SumUp</p>
          <p className="page-subtitle">Importer l'export hebdomadaire des ventes</p>
        </div>
      </div>

      <div className="page-body" style={{ maxWidth: 700 }}>
        {alert && (
          <div className={`alert alert-${alert.type}`}>{alert.msg}</div>
        )}

        {step === 'upload' && (
          <div className="card">
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
            <div className="card">
              <div className="card-title">Aperçu — {file?.name}</div>
              <div className="metrics-grid" style={{ marginBottom: 0 }}>
                <div className="metric-card green">
                  <div className="metric-label">Ventes</div>
                  <div className="metric-value">{parsed.ventes.length}</div>
                  <div className="metric-sub">{parsed.skipped} lignes ignorées</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">CA total</div>
                  <div className="metric-value">{fmt(parsed.ventes.reduce((s, v) => s + v.prix_ttc, 0))}</div>
                </div>
              </div>

              <div className="mt-16">
                <table>
                  <thead><tr><th>Catégorie</th><th className="num">CA</th></tr></thead>
                  <tbody>
                    {catStats.map(([c, v]) => (
                      <tr key={c}><td>{c}</td><td className="num">{fmt(v)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card mt-16">
              <div className="card-title">Associer à une semaine</div>

              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <button
                  className={'btn' + (!createNew ? ' btn-primary' : '')}
                  onClick={() => setCreateNew(false)}
                >Semaine existante</button>
                <button
                  className={'btn' + (createNew ? ' btn-primary' : '')}
                  onClick={() => setCreateNew(true)}
                >Créer une nouvelle semaine</button>
              </div>

              {!createNew ? (
                <div className="form-group">
                  <label className="form-label">Choisir la semaine</label>
                  <select className="form-select" value={selectedSemaine} onChange={e => setSelectedSemaine(e.target.value)}>
                    <option value="">— Nouvelle semaine auto —</option>
                    {semaines.map(s => (
                      <option key={s.id} value={s.id}>
                        S{s.numero} {s.annee} — {s.theme || 'Sans thème'} ({s.date_debut})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Semaine n°</label>
                    <input className="form-input" type="number" value={newSemaine.numero} onChange={e => setNewSemaine(s => ({ ...s, numero: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Année</label>
                    <input className="form-input" type="number" value={newSemaine.annee} onChange={e => setNewSemaine(s => ({ ...s, annee: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Date début</label>
                    <input className="form-input" type="date" value={newSemaine.date_debut} onChange={e => setNewSemaine(s => ({ ...s, date_debut: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Date fin</label>
                    <input className="form-input" type="date" value={newSemaine.date_fin} onChange={e => setNewSemaine(s => ({ ...s, date_fin: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1/-1' }}>
                    <label className="form-label">Thème / Événement</label>
                    <input className="form-input" type="text" value={newSemaine.theme} placeholder="Ex: Movember, Octobre Rose..." onChange={e => setNewSemaine(s => ({ ...s, theme: e.target.value }))} />
                  </div>
                </div>
              )}

              <div className="flex-gap mt-16">
                <button className="btn btn-primary" onClick={handleImport} disabled={loading}>
                  {loading ? <span className="spinner" /> : '⬆️'} Importer {parsed.ventes.length} ventes
                </button>
                <button className="btn" onClick={() => setStep('upload')}>Annuler</button>
              </div>
            </div>
          </>
        )}

        {step === 'done' && (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Import réussi !</div>
            <p className="text-muted">Les ventes ont été enregistrées en base de données.</p>
            <div className="flex-gap mt-16" style={{ justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => { setStep('upload'); setParsed(null); setFile(null) }}>
                📂 Nouvel import
              </button>
              <a href="/bilan" className="btn">📋 Voir le bilan</a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
