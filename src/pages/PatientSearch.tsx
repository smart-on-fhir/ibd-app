import { useState, useTransition, useEffect, useRef } from 'react'
import { Calendar, ChevronRight }                     from 'lucide-react'
import { useParams }                                  from 'react-router'
import { SidebarLayout }                              from 'clinical-primitives'
import { usePatientSearch }                           from '../hooks/usePatientSearch'
import { useDebounce }                                from '../hooks/useDebounce'
import { Preload }                                    from '../components/Preload'
import { ResourceDetail }                             from '../components/ResourceDetail'
import { queryPattern }                               from '../lib/search'
import type { SearchEntry }                           from '../hooks/usePatientSearch'


const SEARCH_RESOURCE_TYPES = [
  // 'ServiceRequest',
  'Condition',
  'MedicationRequest',
  'Observation',
  'Procedure',
  'AllergyIntolerance',
  'Encounter',
  'DiagnosticReport',
  'Immunization',
  'DocumentReference'
];


function Highlight({ text, query }: { text: string; query: string }) {
  const pattern = queryPattern(query, 'gi')
  if (!pattern) return <>{text}</>

  // Splitting on a capturing pattern puts the matches at the odd indices.
  return (
    <>
      {text.split(pattern).map((part, i) =>
        i % 2
          ? <mark key={i} className="rounded-xs bg-yellow-200 text-yellow-950 not-italic ring-1 ring-yellow-400/50">{part}</mark>
          : part
      )}
    </>
  )
}

/** Characters of context kept before and after the match. */
const SNIPPET_BEFORE = 40
const SNIPPET_AFTER  = 100

/**
 * One line of `text` around the first match of `query`, with an ellipsis on
 * whichever side was cut. Text with no match — the hit was in the label — is
 * returned from its start, and the row's own truncation shortens it.
 */
function snippet(text: string, query: string): string {
  // Markdown notes' line markers — headings, bullets, numbering — are layout,
  // and read as noise once the lines are run together.
  const normalized = text
    .replace(/^[ \t]*(?:#{1,6}|[-+]|\d+[.)])[ \t]+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
  const match      = queryPattern(query)?.exec(normalized)

  if (!match) return normalized

  const start = Math.max(0, match.index - SNIPPET_BEFORE)
  const end   = match.index + match[0].length + SNIPPET_AFTER

  return (start > 0 ? '…' : '') +
    normalized.slice(start, end) +
    (normalized.length > end ? '…' : '')
}

function ResultRow({ entry, query, selected, onClick }: { entry: SearchEntry; query: string; selected: boolean; onClick: () => void }) {
  return (
    <li className={`flex gap-x-3 gap-y-1 px-4 py-3 cursor-pointer group ${selected ? 'bg-slate-50' : ''}`} onClick={onClick}>
      <div className="flex-1 min-w-0">
        <div className="text-blue-900 text-sm font-medium group-hover:underline truncate">
          <Highlight text={entry.label} query={query} />
        </div>
        {entry.sublabel && (
          <div className="truncate text-xs text-gray-500">
            <Highlight text={snippet(entry.sublabel, query)} query={query} />
          </div>
        )}
        <div className="flex items-center gap-x-2 mt-2">
          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide border border-slate-200 text-slate-500 bg-slate-100">
            {entry.resourceType}
          </span>
          {entry.date && (
            <span className="shrink-0 text-xs text-gray-500 flex items-center ms-2">
              <Calendar size={12} className="inline-block mr-1" />{entry.date.slice(0, 10)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center">
        <ChevronRight className="h-4 w-4 text-gray-400" />
      </div>
    </li>
  )
}

const PAGE_SIZE = 20

/**
 * Identifies an entry across searches. Not the object itself: the index is
 * rebuilt whenever the loaded resources change, and one resource can yield
 * several entries, so the label is part of it.
 */
function entryKey(entry: SearchEntry): string {
  return `${entry.resourceType}/${entry.resourceId}/${entry.label}`
}

export function PatientSearch() {
  const { id } = useParams<{ id: string }>()
  return (
    <Preload patientId={id} resourceTypes={SEARCH_RESOURCE_TYPES} label="Indexing records…">
      <PatientSearchContent />
    </Preload>
  )
}

function PatientSearchContent() {
  const [query, setQuery]             = useState('')
  const debouncedQuery                = useDebounce(query, 150)
  const { search, index }             = usePatientSearch()
  const [results, setResults]         = useState<SearchEntry[]>([])
  const [selected, setSelected]       = useState<SearchEntry | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [isPending, startTransition]  = useTransition()
  const [page, setPage]               = useState(1)
  const selectedKey                   = selected && entryKey(selected)
  const visibleResults                = results.slice(0, page * PAGE_SIZE)
  const hasMore                       = results.length > visibleResults.length

  // The selection as the search effect sees it, without being one of its
  // dependencies — that would re-run the search, and reset the page, on every
  // click. Set wherever the selection is.
  const selectedKeyRef = useRef<string | null>(null)

  useEffect(() => {
    startTransition(() => {
      const next = debouncedQuery
        ? search(debouncedQuery).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
        : []

      setResults(next)
      setPage(1)

      // A sidebar describing a row the new results no longer show would read
      // as describing nothing in particular.
      const key = selectedKeyRef.current
      if (key && !next.slice(0, PAGE_SIZE).some(entry => entryKey(entry) === key)) {
        setDetailsOpen(false)
      }
    })
  }, [debouncedQuery, search])

  function select(entry: SearchEntry) {
    selectedKeyRef.current = entryKey(entry)
    setSelected(entry)
    setDetailsOpen(true)
  }

  return (
    <SidebarLayout
      open={detailsOpen}
      onClose={() => setDetailsOpen(false)}
      title="Details"
      defaultFraction={0.4}
      maxFraction={0.75}
      // The shell's <main> is the scroll container, with the patient header
      // stuck to its top — about 4rem tall below main's padding. The sidebar
      // sticks at the header's edge, which is also where it rests, so it only
      // moves once the page scrolls. The gap below the header is padding,
      // matching the results column's p-6 so "Details" lines up with the title.
      style={{
        '--cp-sidebar-layout-top'        : '4rem',
        '--cp-sidebar-layout-padding-top': '.5rem',
        '--cp-sidebar-layout-max-height' : 'calc(100vh - 8.5rem)',
      } as React.CSSProperties}
      sidebar={
        // Kept after closing, so the panel fades out with its content rather
        // than emptying first. Keyed so a new selection starts with its
        // Source collapsed.
        selected &&
          <ResourceDetail
            key={`${selected.resourceType}-${selected.resourceId}`}
            resource={selected.resource}
            label={selected.label}
            description={selected.sublabel}
            date={selected.date}
            query={debouncedQuery}
          />
      }
    >
      <div className="pt-6">
        <h1 className="mb-0 text-xl font-semibold text-slate-700 text-center">Patient Record Search</h1>

        <div className="mb-5 text-xs text-stone-400 text-center">
          {isPending ? 'Searching…' : `${index.length} records indexed`}
        </div>

        <input
          autoFocus
          type="search"
          placeholder="Search conditions, medications, observations…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 max-w-2xl mx-auto block"
        />

      

        {visibleResults.length > 0 && (
          <div className="mt-6 overflow-hidden rounded-lg border border-stone-200 bg-white">
            <ul className="divide-y divide-stone-200 divide-dashed">
              {visibleResults.map((entry, i) => (
                <ResultRow
                  key={`${entry.resourceType}-${entry.resourceId}-${i}`}
                  entry={entry}
                  query={debouncedQuery}
                  selected={detailsOpen && entryKey(entry) === selectedKey}
                  onClick={() => select(entry)}
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
      </div>
    </SidebarLayout>
  )
}
