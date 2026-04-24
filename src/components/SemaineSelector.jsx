import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function SemaineSelector({ value, onChange, className }) {
  const [semaines, setSemaines] = useState([])

  useEffect(() => {
    supabase
      .from('semaines')
      .select('id, annee, numero, date_debut, date_fin, theme')
      .order('annee', { ascending: false })
      .order('numero', { ascending: false })
      .then(({ data }) => {
        setSemaines(data || [])
        if (!value && data?.length) onChange(data[0].id)
      })
  }, [])

  return (
    <div className={'semaine-selector ' + (className || '')}>
      <label style={{ fontSize: 12, color: 'var(--gray-400)', fontWeight: 600 }}>Semaine</label>
      <select value={value || ''} onChange={e => onChange(e.target.value)}>
        <option value="">— Choisir —</option>
        {semaines.map(s => (
          <option key={s.id} value={s.id}>
            S{s.numero} {s.annee} — {s.theme || ''} ({s.date_debut})
          </option>
        ))}
      </select>
    </div>
  )
}
