import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/sumup'
import SemaineSelector from '../components/SemaineSelector.jsx'

const CATEGORIES = ['Boissons', 'Snacking', 'Boutique', 'Dons', 'Inconnu']

export default function TicketPage() {
  const [semaineId, setSemaineId] = useState('')
  const [image, setImage] = useState(null)
  const [imageBase64, setImageBase64] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [articles, setArticles] = useState([])
  const [fournisseur, setFournisseur] = useState('')
  const [dateAchat, setDateAchat] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [alert, setAlert] = useState(null)
  const [drag, setDrag] = useState(false)
  const [produits, setProduits] = useState([])
  const inputRef = useRef()

  async function loadProduits() {
    const { data } = await supabase.from('produits').select('*').eq('actif', true).order('nom')
    setProduits(data || [])
  }

  async function handleImage(file) {
    if (!file) return
    setImage(URL.createObjectURL(file))
    setAlert(null)
    setArticles([])

    // Convert to base64
    const reader = new FileReader()
    reader.onload = async (e) => {
      const base64 = e.target.result.split(',')[1]
      const mediaType = file.type || 'image/jpeg'
      setImageBase64({ base64, mediaType })
      await analyzeTicket(base64, mediaType)
    }
    reader.readAsDataURL(file)
    await loadProduits()
  }

  async function analyzeTicket(base64, mediaType) {
    setAnalyzing(true)
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: base64 }
              },
              {
                type: 'text',
                text: `Analyse ce ticket de caisse et extrait tous les articles achetés.
Réponds UNIQUEMENT avec un JSON valide, sans texte avant ou après, sans balises markdown.
Format exact :
{
  "fournisseur": "nom du magasin ou fournisseur",
  "date": "YYYY-MM-DD ou null si non visible",
  "articles": [
    {
      "article": "nom de l'article",
      "quantite": 1,
      "unite": "kg ou L ou pièces ou bouteilles etc",
      "prix_unitaire": 0.00,
      "total_ttc": 0.00,
      "taux_tva": 0.055
    }
  ],
  "total_general": 0.00
}
Si la TVA n'est pas visible, utilise 0.055 (5.5%) pour alimentaire et 0.1 pour restauration.
Pour la quantité, utilise des nombres (ex: 1, 2, 0.5).`
              }
            ]
          }]
        })
      })

      const data = await response.json()
      const text = data.content?.[0]?.text || ''

      let parsed
      try {
        parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
      } catch {
        throw new Error('Réponse IA invalide — réessayez ou saisissez manuellement')
      }

      if (parsed.fournisseur) setFournisseur(parsed.fournisseur)
      if (parsed.date) setDateAchat(parsed.date)
      if (parsed.articles?.length) {
        setArticles(parsed.articles.map((a, i) => ({
          id: i,
          article: a.article || '',
          quantite: a.quantite || 1,
          unite: a.unite || '',
          prix_unitaire: a.prix_unitaire || 0,
          total_ttc: a.total_ttc || 0,
          taux_tva: a.taux_tva || 0.055,
          produit_fini: '',
          inclure: true,
        })))
      }
    } catch (e) {
      setAlert({ type: 'error', msg: e.message })
    }
    setAnalyzing(false)
  }

  function updateArticle(id, field, value) {
    setArticles(arr => arr.map(a => a.id === id ? { ...a, [field]: value } : a))
  }

  function removeArticle(id) {
    setArticles(arr => arr.filter(a => a.id !== id))
  }

  function addArticle() {
    setArticles(arr => [...arr, {
      id: Date.now(), article: '', quantite: 1, unite: '', prix_unitaire: 0, total_ttc: 0, taux_tva: 0.055, produit_fini: '', inclure: true
    }])
  }

  async function handleSave() {
    if (!semaineId) return setAlert({ type: 'error', msg: 'Sélectionnez une semaine' })
    const toSave = articles.filter(a => a.inclure && a.article && a.total_ttc > 0)
    if (!toSave.length) return setAlert({ type: 'error', msg: 'Aucun article valide à enregistrer' })

    setSaving(true)
    setAlert(null)
    try {
      for (const a of toSave) {
        const { data: achat } = await supabase.from('achats').insert({
          semaine_id: semaineId,
          fournisseur: fournisseur || 'Inconnu',
          date_achat: dateAchat,
          article: a.article,
          quantite: parseFloat(a.quantite) || null,
          unite: a.unite || null,
          total_ht: a.taux_tva ? parseFloat(a.total_ttc) / (1 + parseFloat(a.taux_tva)) : parseFloat(a.total_ttc),
          taux_tva: parseFloat(a.taux_tva) || 0.055,
          total_ttc: parseFloat(a.total_ttc),
        }).select().single()

        // Create imputation if product linked
        if (achat && a.produit_fini) {
          const prod = produits.find(p => p.id === a.produit_fini)
          await supabase.from('imputations').insert({
            achat_id: achat.id,
            produit_fini: prod?.nom || a.produit_fini,
            categorie: prod?.categorie || null,
            cout_total_categorie: parseFloat(a.total_ttc),
          })
        }
      }

      setAlert({ type: 'success', msg: `✅ ${toSave.length} article(s) enregistré(s) dans les achats` })
      setArticles([])
      setImage(null)
      setFournisseur('')
    } catch (e) {
      setAlert({ type: 'error', msg: 'Erreur : ' + e.message })
    }
    setSaving(false)
  }

  const totalTTC = articles.filter(a => a.inclure).reduce((s, a) => s + (parseFloat(a.total_ttc) || 0), 0)

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="page-title">📷 Scan de ticket</p>
          <p className="page-subtitle">Photo ou image d'un ticket → extraction automatique par IA</p>
        </div>
        <SemaineSelector value={semaineId} onChange={setSemaineId} />
      </div>

      <div className="page-body">
        {alert && <div className={`alert alert-${alert.type}`}>{alert.msg}</div>}

        <div className="grid-2" style={{ alignItems: 'start' }}>
          {/* Left: Upload */}
          <div>
            <div className="card mb-16">
              <div className="card-title">Photo du ticket</div>
              <div
                className={'upload-zone' + (drag ? ' drag-over' : '')}
                style={{ padding: '24px' }}
                onClick={() => inputRef.current.click()}
                onDragOver={e => { e.preventDefault(); setDrag(true) }}
                onDragLeave={() => setDrag(false)}
                onDrop={e => { e.preventDefault(); setDrag(false); handleImage(e.dataTransfer.files[0]) }}
              >
                <input ref={inputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => handleImage(e.target.files[0])} />
                {image ? (
                  <img src={image} alt="ticket" style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 8, objectFit: 'contain' }} />
                ) : (
                  <>
                    <div className="upload-icon">📷</div>
                    <div className="upload-title">Photo ou image du ticket</div>
                    <div className="upload-sub">JPG, PNG — depuis votre appareil photo ou fichier</div>
                  </>
                )}
              </div>
              {image && (
                <button className="btn btn-sm mt-8" onClick={() => { setImage(null); setArticles([]) }}>
                  🔄 Changer de ticket
                </button>
              )}
            </div>

            {image && (
              <div className="card">
                <div className="card-title">Informations générales</div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Fournisseur</label>
                    <input className="form-input" value={fournisseur} onChange={e => setFournisseur(e.target.value)} placeholder="PromoCash, Intermarché..." />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Date</label>
                    <input className="form-input" type="date" value={dateAchat} onChange={e => setDateAchat(e.target.value)} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right: Articles */}
          <div>
            {analyzing && (
              <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                <div className="spinner" style={{ width: 36, height: 36, margin: '0 auto 12px', borderWidth: 3 }} />
                <div style={{ fontWeight: 600 }}>Analyse du ticket en cours…</div>
                <p className="text-muted text-sm mt-8">L'IA extrait les articles, quantités et prix</p>
              </div>
            )}

            {!analyzing && articles.length > 0 && (
              <div className="card">
                <div className="flex-between mb-16">
                  <div className="card-title" style={{ marginBottom: 0 }}>
                    Articles détectés ({articles.filter(a => a.inclure).length})
                  </div>
                  <span style={{ fontWeight: 700 }}>Total : {fmt(totalTTC)}</span>
                </div>

                {articles.map(a => (
                  <div key={a.id} style={{
                    border: '1px solid var(--gray-200)', borderRadius: 8, padding: 12, marginBottom: 10,
                    opacity: a.inclure ? 1 : 0.4,
                    borderLeft: `3px solid ${a.inclure ? 'var(--green)' : 'var(--gray-300)'}`
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
                        <input type="checkbox" checked={a.inclure} onChange={e => updateArticle(a.id, 'inclure', e.target.checked)} />
                        Inclure
                      </label>
                      <button className="btn btn-danger btn-sm" onClick={() => removeArticle(a.id)}>✕</button>
                    </div>

                    <div className="form-grid" style={{ marginBottom: 8 }}>
                      <div className="form-group" style={{ gridColumn: '1/-1' }}>
                        <label className="form-label">Article</label>
                        <input className="form-input" value={a.article} onChange={e => updateArticle(a.id, 'article', e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Quantité</label>
                        <input className="form-input" type="number" step="0.001" value={a.quantite} onChange={e => updateArticle(a.id, 'quantite', e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Unité</label>
                        <input className="form-input" value={a.unite} onChange={e => updateArticle(a.id, 'unite', e.target.value)} placeholder="kg, L, boîtes..." />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Total TTC (€)</label>
                        <input className="form-input" type="number" step="0.01" value={a.total_ttc} onChange={e => updateArticle(a.id, 'total_ttc', e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">TVA</label>
                        <select className="form-select" value={a.taux_tva} onChange={e => updateArticle(a.id, 'taux_tva', e.target.value)}>
                          <option value="0.055">5.5%</option>
                          <option value="0.1">10%</option>
                          <option value="0.2">20%</option>
                          <option value="0">0%</option>
                        </select>
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Imputer à un produit fini (optionnel)</label>
                      <select className="form-select" value={a.produit_fini} onChange={e => updateArticle(a.id, 'produit_fini', e.target.value)}>
                        <option value="">— Sans imputation —</option>
                        {['Boissons', 'Snacking', 'Boutique', 'Dons'].map(cat => (
                          <optgroup key={cat} label={cat}>
                            {produits.filter(p => p.categorie === cat).map(p => (
                              <option key={p.id} value={p.id}>{p.nom}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}

                <button className="btn btn-sm mb-16" onClick={addArticle}>+ Ajouter un article manuellement</button>

                <div style={{ borderTop: '1px solid var(--gray-200)', paddingTop: 12 }}>
                  <div className="flex-between mb-16">
                    <span style={{ fontWeight: 700 }}>Total à enregistrer</span>
                    <span style={{ fontWeight: 700, fontSize: 18 }}>{fmt(totalTTC)}</span>
                  </div>
                  <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={handleSave} disabled={saving || !semaineId}>
                    {saving ? <span className="spinner" /> : '💾'} Enregistrer {articles.filter(a => a.inclure).length} article(s) dans les achats
                  </button>
                </div>
              </div>
            )}

            {!analyzing && articles.length === 0 && image && (
              <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🤔</div>
                <p style={{ fontWeight: 600 }}>Aucun article extrait</p>
                <p className="text-muted text-sm mt-8">L'image n'est peut-être pas assez nette.<br />Vous pouvez ajouter les articles manuellement.</p>
                <button className="btn btn-sm mt-16" onClick={addArticle}>+ Ajouter manuellement</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
