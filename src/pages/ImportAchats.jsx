import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/sumup'
import SemaineSelector from '../components/SemaineSelector.jsx'

// Parse CSV robuste (gère les guillemets, virgules dans les valeurs, etc.)
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) throw new Error('Fichier CSV vide ou invalide')

  const parseRow = (line) => {
    const result = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    result.push(current.trim())
    return result
  }

  const headers = parseRow(lines[0])
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = parseRow(line)
    const obj = {}
    headers.forEach((h, i) => { obj[h] = values[i] || '' })
    return obj
  })
}

const REQUIRED = ['fournisseur', 'date_achat', 'article', 'total_ttc']

const PREVIEW_COLS = [
  { key: 'date_achat', label: 'Date', width: 90 },
  { key: 'fournisseur', label: 'Fournisseur', width: 160 },
  { key: 'num_facture', label: 'N° Facture', width: 120 },
  { key: 'article', label: 'Article', width: 220 },
  { key: 'quantite', label: 'Qté', width: 50, align: 'right' },
  { key: 'unite', label: 'Unité', width: 70 },
  { key: 'total_ttc', label: 'TTC (€)', width: 80, align: 'right', format: v => fmt(parseFloat(v) || 0) },
  { key: 'taux_tva', label: 'TVA', width: 60, format: v => v ? `${Math.round(parseFloat(v) * 100)}%` : '—' },
  { key: 'produit_fini', label: 'Produit imputé', width: 150 },
  { key: 'categorie', label: 'Catégorie', width: 90 },
]

export default function ImportAchatsPage() {
  const [semaineId, setSemaineId] = useState('')
  const [file, setFile] = useState(null)
  const [rows, setRows] = useState([])
  const [errors, setErrors] = useState([])
  const [step, setStep] = useState('upload') // upload | preview | done
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState(null)
  const [drag, setDrag] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const inputRef = useRef()

  function handleFile(f) {
    if (!f) return
    setFile(f)
    setAlert(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const parsed = parseCSV(e.target.result)
        // Validation
        const errs = []
        const missing = REQUIRED.filter(col => !Object.keys(parsed[0] || {}).includes(col))
        if (missing.length) errs.push(`Colonnes manquantes : ${missing.join(', ')}`)
        parsed.forEach((row, i) => {
          if (!row.fournisseur) errs.push(`Ligne ${i + 2} : fournisseur manquant`)
          if (!row.article) errs.push(`Ligne ${i + 2} : article manquant`)
          if (!row.total_ttc || isNaN(parseFloat(row.total_ttc))) errs.push(`Ligne ${i + 2} : total_ttc invalide`)
        })
        setErrors(errs)
        setRows(parsed)
        setStep('preview')
      } catch (err) {
        setAlert({ type: 'error', msg: 'Erreur de lecture : ' + err.message })
      }
    }
    reader.readAsText(f, 'UTF-8')
  }

  async function handleImport() {
    if (!semaineId) return setAlert({ type: 'error', msg: 'Sélectionnez une semaine' })
    if (errors.length) return setAlert({ type: 'error', msg: 'Corrigez les erreurs avant d\'importer' })

    setLoading(true)
    setAlert(null)
    let inserted = 0, skipped = 0

    try {
      // Grouper par fournisseur+facture pour créer 1 achat par groupe avec ses imputations
      const groupes = {}
      rows.forEach(row => {
        const key = `${row.fournisseur}||${row.num_facture || ''}||${row.date_achat}`
        if (!groupes[key]) groupes[key] = []
        groupes[key].push(row)
      })

      for (const [, lignes] of Object.entries(groupes)) {
        const first = lignes[0]

        for (const row of lignes) {
          const ttc = parseFloat(row.total_ttc) || 0
          const tva = parseFloat(row.taux_tva) || 0.055
          const ht = tva > 0 ? ttc / (1 + tva) : ttc

          // Insérer l'achat
          const { data: achat, error } = await supabase
            .from('achats')
            .insert({
              semaine_id: semaineId,
              fournisseur: row.fournisseur,
              num_facture: row.num_facture || null,
              date_achat: row.date_achat || null,
              article: row.article,
              quantite: row.quantite ? parseFloat(row.quantite) : null,
              unite: row.unite || null,
              total_ht: Math.round(ht * 10000) / 10000,
              taux_tva: tva,
              total_ttc: ttc,
            })
            .select()
            .single()

          if (error) { skipped++; continue }

          // Insérer l'imputation si produit_fini renseigné
          if (row.produit_fini && achat) {
            await supabase.from('imputations').insert({
              achat_id: achat.id,
              produit_fini: row.produit_fini,
              categorie: row.categorie || null,
              cout_total_categorie: ttc,
            })
          }

          inserted++
        }
      }

      setImportResult({ inserted, skipped, total: rows.length })
      setStep('done')
    } catch (err) {
      setAlert({ type: 'error', msg: 'Erreur import : ' + err.message })
    }
    setLoading(false)
  }

  const totalTTC = rows.reduce((s, r) => s + (parseFloat(r.total_ttc) || 0), 0)
  const fournisseurs = [...new Set(rows.map(r => r.fournisseur).filter(Boolean))]

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="page-title">📥 Import achats (CSV)</p>
          <p className="page-subtitle">Glissez le CSV généré depuis Claude → insertion automatique en base</p>
        </div>
        <SemaineSelector value={semaineId} onChange={setSemaineId} />
      </div>

      <div className="page-body">
        {alert && <div className={`alert alert-${alert.type}`}>{alert.msg}</div>}

        {/* Étape upload */}
        {step === 'upload' && (
          <div style={{ maxWidth: 600 }}>
            <div className="card mb-16">
              <div className="card-title">Format attendu du fichier CSV</div>
              <p className="text-muted text-sm" style={{ marginBottom: 10 }}>
                Le fichier doit contenir les colonnes suivantes (générées automatiquement par Claude) :
              </p>
              <div style={{ background: 'var(--gray-50)', borderRadius: 6, padding: 10, fontSize: 11, fontFamily: 'monospace', color: 'var(--gray-600)', lineHeight: 1.8 }}>
                <strong>fournisseur</strong>, <strong>num_facture</strong>, <strong>date_achat</strong>, <strong>article</strong>,<br />
                quantite, unite, <strong>total_ht</strong>, taux_tva, <strong>total_ttc</strong>, produit_fini, categorie
              </div>
              <p className="text-muted text-sm mt-8">
                💡 Déposez vos justificatifs dans une conversation Claude → demandez "génère-moi le CSV achats buvette" → déposez le fichier ici.
              </p>
            </div>

            <div className="card">
              <div className="card-title">Fichier CSV</div>
              <div
                className={'upload-zone' + (drag ? ' drag-over' : '')}
                onClick={() => inputRef.current.click()}
                onDragOver={e => { e.preventDefault(); setDrag(true) }}
                onDragLeave={() => setDrag(false)}
                onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]) }}
              >
                <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
                <div className="upload-icon">📄</div>
                <div className="upload-title">Cliquer ou glisser-déposer</div>
                <div className="upload-sub">Fichier .csv généré par Claude</div>
              </div>
            </div>
          </div>
        )}

        {/* Étape preview */}
        {step === 'preview' && rows.length > 0 && (
          <>
            {/* Erreurs */}
            {errors.length > 0 && (
              <div className="alert alert-error" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                <strong>⚠️ {errors.length} erreur(s) détectée(s) :</strong>
                {errors.map((e, i) => <div key={i} style={{ fontSize: 12 }}>• {e}</div>)}
              </div>
            )}

            {/* Stats */}
            <div className="metrics-grid mb-16">
              <div className="metric-card green">
                <div className="metric-label">Lignes à importer</div>
                <div className="metric-value">{rows.length}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Total TTC</div>
                <div className="metric-value">{fmt(totalTTC)}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Fournisseurs</div>
                <div className="metric-value">{fournisseurs.length}</div>
                <div className="metric-sub">{fournisseurs.slice(0, 2).join(', ')}{fournisseurs.length > 2 ? '...' : ''}</div>
              </div>
              <div className={`metric-card ${errors.length ? 'red' : 'green'}`}>
                <div className="metric-label">Validation</div>
                <div className="metric-value">{errors.length ? '❌ Erreurs' : '✅ OK'}</div>
              </div>
            </div>

            {/* Tableau preview */}
            <div className="card mb-16">
              <div className="flex-between mb-16">
                <div className="card-title" style={{ marginBottom: 0 }}>Aperçu — {file?.name}</div>
                <button className="btn btn-sm" onClick={() => { setStep('upload'); setRows([]); setErrors([]) }}>
                  🔄 Changer de fichier
                </button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ minWidth: 900 }}>
                  <thead>
                    <tr>
                      {PREVIEW_COLS.map(col => (
                        <th key={col.key} style={{ textAlign: col.align || 'left', minWidth: col.width }}>{col.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i}>
                        {PREVIEW_COLS.map(col => (
                          <td key={col.key} style={{ textAlign: col.align || 'left', fontSize: 12 }}>
                            {col.format ? col.format(row[col.key]) : (row[col.key] || <span className="text-muted">—</span>)}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="tr-total">
                      <td colSpan={6}>Total ({rows.length} articles)</td>
                      <td style={{ textAlign: 'right' }}>{fmt(totalTTC)}</td>
                      <td colSpan={3}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {!semaineId && (
              <div className="alert alert-warning">⚠️ Sélectionnez une semaine en haut de page avant d'importer</div>
            )}

            <div className="flex-gap">
              <button
                className="btn btn-primary btn-lg"
                onClick={handleImport}
                disabled={loading || errors.length > 0 || !semaineId}
              >
                {loading ? <span className="spinner" /> : '⬆️'} Importer {rows.length} achats en base
              </button>
              <button className="btn" onClick={() => { setStep('upload'); setRows([]); setErrors([]) }}>Annuler</button>
            </div>
          </>
        )}

        {/* Étape done */}
        {step === 'done' && importResult && (
          <div className="card" style={{ maxWidth: 500, textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Import réussi !</div>
            <div className="metrics-grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 20 }}>
              <div className="metric-card green">
                <div className="metric-label">Achats insérés</div>
                <div className="metric-value">{importResult.inserted}</div>
              </div>
              <div className="metric-card amber">
                <div className="metric-label">Ignorés (erreurs)</div>
                <div className="metric-value">{importResult.skipped}</div>
              </div>
            </div>
            <div className="flex-gap mt-16" style={{ justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => { setStep('upload'); setRows([]); setFile(null) }}>
                📄 Nouvel import
              </button>
              <a href="/bilan" className="btn">📋 Voir le bilan</a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
