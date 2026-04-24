import * as XLSX from 'xlsx'

const MONTH_MAP = {
  'janv.': 0, 'févr.': 1, 'mars': 2, 'avr.': 3, 'mai': 4, 'juin': 5,
  'juil.': 6, 'août': 7, 'sept.': 8, 'oct.': 9, 'nov.': 10, 'déc.': 11
}

function parseFrenchDate(str) {
  if (!str) return null
  const s = String(str).trim()
  // Format: "16 avr. 2026 22:16"
  const m = s.match(/(\d{1,2})\s+(\S+)\s+(\d{4})\s+(\d{2}):(\d{2})/)
  if (m) {
    const [, day, monthStr, year, hour, min] = m
    const month = MONTH_MAP[monthStr.toLowerCase()]
    if (month !== undefined) {
      return new Date(+year, month, +day, +hour, +min)
    }
  }
  // Try ISO or Excel serial
  if (!isNaN(str)) {
    const d = XLSX.SSF.parse_date_code(+str)
    if (d) return new Date(d.y, d.m - 1, d.d, d.H, d.M)
  }
  const d = new Date(str)
  return isNaN(d) ? null : d
}

function getISOWeek(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
}

export function parseSumUpFile(buffer) {
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })

  if (!rows.length) throw new Error('Fichier vide ou format non reconnu')

  // Detect columns (SumUp may vary)
  const firstRow = rows[0]
  const keys = Object.keys(firstRow)
  const hasCol = (name) => keys.some(k => k.toLowerCase().includes(name.toLowerCase()))

  const ventes = []
  let skipped = 0

  for (const row of rows) {
    const dateRaw = row['Date'] || row['date'] || ''
    const date = parseFrenchDate(dateRaw)
    if (!date) { skipped++; continue }

    const prix = parseFloat(
      String(row['Prix (TTC)'] || row['Prix TTC'] || row['Montant'] || row['prix_ttc'] || 0)
        .replace(',', '.')
    )
    const description = String(row['Description'] || row['description'] || 'Inconnu').trim()
    const categorie = String(row['Catégorie'] || row['categorie'] || row['Categorie article'] || '').trim() || null
    const paiement = String(row['Moyen de paiement'] || row['moyen_paiement'] || '').trim()
    const compte = String(row['Compte'] || row['compte'] || '').trim()
    const ref = String(row['Réf. transaction'] || row['ref_transaction'] || '').trim()
    const quantite = parseFloat(row['Quantité'] || row['quantite'] || 1)
    const type = String(row['Type'] || row['type'] || 'Vente').trim()

    ventes.push({
      date_vente: date.toISOString(),
      ref_transaction: ref || null,
      type_transaction: type,
      moyen_paiement: paiement || null,
      quantite: isNaN(quantite) ? 1 : quantite,
      description,
      categorie: normalizeCategorie(categorie),
      prix_ttc: isNaN(prix) ? 0 : prix,
      compte: compte || null,
      annee: date.getFullYear(),
      mois: date.getMonth() + 1,
      semaine_numero: getISOWeek(date),
    })
  }

  return { ventes, skipped, total: rows.length }
}

function normalizeCategorie(raw) {
  if (!raw) return 'Inconnu'
  const r = raw.toLowerCase()
  if (r.includes('boisson')) return 'Boissons'
  if (r.includes('snack')) return 'Snacking'
  if (r.includes('boutique')) return 'Boutique'
  if (r.includes('don')) return 'Dons'
  if (r.includes('marche') || r.includes('noël') || r.includes('noel')) return 'Marche de Noel'
  if (r.includes('inconnu') || r === '') return 'Inconnu'
  return raw
}

export function detectSemaine(ventes) {
  if (!ventes.length) return null
  const dates = ventes.map(v => new Date(v.date_vente)).filter(d => !isNaN(d))
  const min = new Date(Math.min(...dates))
  const max = new Date(Math.max(...dates))
  return {
    annee: min.getFullYear(),
    numero: getISOWeek(min),
    date_debut: min.toISOString().slice(0, 10),
    date_fin: max.toISOString().slice(0, 10),
  }
}

export function fmt(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n ?? 0)
}

export function fmtPct(n) {
  if (!n) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 }).format(n)
}
