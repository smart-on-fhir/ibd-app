import { useState, useTransition, useEffect } from 'react'
import { SourceDialog }                       from 'clinical-primitives'
import { usePatientSearch }                   from '../hooks/usePatientSearch'
import { useDebounce }                        from '../hooks/useDebounce'
import type { SearchEntry }                   from '../hooks/usePatientSearch'


function Highlight({ text, query }: { text: string; query: string }) {
  const terms = query.trim().split(/\s+/).filter(Boolean)
  if (!terms.length) return <>{text}</>

  const pattern = new RegExp(`(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  const parts   = text.split(pattern)

  return (
    <>
      {parts.map((part, i) =>
        pattern.test(part)
          ? <mark key={i} className="rounded-xs bg-yellow-200 text-yellow-950 not-italic ring-1 ring-yellow-400/50">{part}</mark>
          : part
      )}
    </>
  )
}

function ToggleValue({ contents, query }: { contents: string, query: string }) {
  const [show, setShow] = useState(false)
  
  if (contents.length <= 100)
    return <Highlight text={contents} query={query} />
  
  return (
    <>
      <div className={ show ? undefined : "line-clamp-5" }>
        <Highlight text={contents} query={query} />
      </div>
      <button
        onClick={() => setShow(s => !s)}
        className="py-0.5 text-xs text-blue-500 underline cursor-pointer"
      >
        {show ? 'Show Less' : 'Show All'}
      </button>
    </>
  )
}

const RESOURCE_COLOR_MAP: Record<string, string> = {
  Condition        : 'bg-red-100 text-red-800',
  Observation      : 'bg-amber-100 text-amber-800',
  MedicationRequest: 'bg-blue-100 text-blue-800',
  ServiceRequest   : 'bg-purple-100 text-purple-800',
}

function ResultRow({ entry, query, onClick }: { entry: SearchEntry; query: string; onClick: () => void }) {
  return (
    <li className="flex items-baseline gap-x-3 gap-y-1 px-4 py-3 flex-wrap">
      <div className="min-w-[70%] flex-1">
        <div className="line-clamp-3 text-sm text-blue-800 font-medium hover:underline cursor-pointer" onClick={onClick}>
          <Highlight text={entry.label} query={query} />
        </div>
        {entry.sublabel && (
          <div className="text-xs text-gray-600" style={{ whiteSpace: 'pre-wrap' }}>
            <ToggleValue contents={entry.sublabel.replace(/(\r\n|\r|\n){3,}/g, "\n\n")} query={query} />
          </div>
        )}
      </div>
      <div className="flex items-center gap-x-2">
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${RESOURCE_COLOR_MAP[entry.resourceType] || 'bg-olive-200 text-olive-600'}`}>
          {entry.resourceType}
        </span>
        {entry.date && (
          <span className="shrink-0 text-xs text-gray-500">
            {entry.date.slice(0, 10)}
          </span>
        )}
      </div>
    </li>
  )
}

export function PatientSearch() {
  const [query, setQuery]             = useState('')
  const debouncedQuery                = useDebounce(query, 150)
  const { search, index }             = usePatientSearch()
  const [results, setResults]         = useState<SearchEntry[]>([])
  const [selected, setSelected]       = useState<SearchEntry | null>(null)
  const [isPending, startTransition]  = useTransition()
  const [page, setPage]               = useState(1)
  const PAGE_SIZE                     = 20
  const visibleResults                = results.slice(0, page * PAGE_SIZE)
  const hasMore                       = results.length > visibleResults.length

  useEffect(() => {
    startTransition(() => {
      setResults(
        debouncedQuery
          ? search(debouncedQuery).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
          : []
      )
      setPage(1)
    })
  }, [debouncedQuery, search])

  return (
    <div className="p-6">
      <h1 className="mb-5 text-xl font-semibold text-gray-900">Search</h1>

      <input
        autoFocus
        type="search"
        placeholder="Search conditions, medications, observations…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />

      <div className="mt-1 text-xs text-gray-400">
        {isPending ? 'Searching…' : `${index.length} records indexed`}
      </div>

      {visibleResults.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <ul className="divide-y divide-gray-200 divide-dashed">
            {visibleResults.map((entry, i) => (
              <ResultRow
                key={`${entry.resourceType}-${entry.resourceId}-${i}`}
                entry={entry}
                query={debouncedQuery}
                onClick={() => setSelected(entry)}
              />
            ))}
          </ul>
          {hasMore && (
            <button
              onClick={() => setPage(p => p + 1)}
              className="w-full py-2.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50"
            >
              Show more ({results.length - visibleResults.length} remaining)
            </button>
          )}
        </div>
      )}

      {debouncedQuery && results.length === 0 && (
        <p className="mt-6 text-center text-sm text-gray-400">No results for "{debouncedQuery}"</p>
      )}

      {selected && (
        <SourceDialog
          open
          onClose={() => setSelected(null)}
          resource={selected.resource}
        />
      )}
    </div>
  )
}
