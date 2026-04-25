import { useState, useMemo } from 'react'

export function useSortable(data, defaultKey = null, defaultDir = 'asc') {
  const [sortKey, setSortKey] = useState(defaultKey)
  const [sortDir, setSortDir] = useState(defaultDir)

  const sorted = useMemo(() => {
    if (!sortKey || !data?.length) return data || []
    return [...data].sort((a, b) => {
      let va = a[sortKey]
      let vb = b[sortKey]
      // Numeric
      if (!isNaN(parseFloat(va)) && !isNaN(parseFloat(vb))) {
        va = parseFloat(va) || 0
        vb = parseFloat(vb) || 0
      } else {
        va = String(va ?? '').toLowerCase()
        vb = String(vb ?? '').toLowerCase()
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [data, sortKey, sortDir])

  function toggle(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function SortIcon({ col }) {
    if (sortKey !== col) return <span style={{ opacity: .3, marginLeft: 4 }}>⇅</span>
    return <span style={{ marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  function Th({ col, children, className = '' }) {
    return (
      <th
        className={className}
        onClick={() => toggle(col)}
        style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
      >
        {children}<SortIcon col={col} />
      </th>
    )
  }

  return { sorted, Th, sortKey, sortDir }
}
