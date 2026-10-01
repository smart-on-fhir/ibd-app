import type { FHIRResourceMap } from '../types/fhir'

export interface SearchEntry {
  resourceType: string
  resourceId:   string
  label:        string
  sublabel?:    string
  date?:        string
  resource:     fhir4.Resource
  
  /**
   * pre-lowercased concatenation of all matchable text
   */
  _text: string
}

/**
 * Return value from a resource extractor. Return null to skip the resource.
 * Return an array to emit multiple entries from one resource.
 */
export interface EntryProps {
  label:     string
  sublabel?: string
  date?:     string
  
  /**
   * Extra text to match against beyond label (e.g. synonyms, codes).
   * If omitted, only label is searched.
   */
  extra?: string
}

/**
 * Gets the whole record as well as the resource, for extractors that follow a
 * reference to find their text — a note whose body is in a Binary, say.
 */
export type ResourceExtractor<R extends fhir4.Resource = fhir4.Resource> =
  (resource: R, resources: FHIRResourceMap) => EntryProps | EntryProps[] | null | undefined

/**
 * Map resource type names to their extractor. Omit a type to exclude it entirely.
 *
 * `never` so an extractor may take its own resource type: a function of a
 * Condition is a function of `never`, but not of `fhir4.Resource`.
 */
export type IndexSchema = Partial<Record<string, ResourceExtractor<never>>>

export function buildSearchIndex(
  resources: FHIRResourceMap,
  schema: IndexSchema,
): SearchEntry[] {
  const entries: SearchEntry[] = []

  for (const [resourceType, extractor] of Object.entries(schema) as [string, ResourceExtractor][]) {
    const list = resources[resourceType]
    if (!list?.length) continue

    for (const resource of list) {
      const result = extractor(resource as fhir4.Resource, resources)
      if (result == null) continue

      for (const props of Array.isArray(result) ? result : [result]) {
        if (!props.label) continue
        entries.push({
          resourceType,
          resourceId: (resource as fhir4.Resource).id ?? '',
          label:      props.label,
          sublabel:   props.sublabel,
          date:       props.date,
          resource:   resource as fhir4.Resource,
          _text:      [props.label, props.extra].filter(Boolean).join(' ').toLowerCase(),
        })
      }
    }
  }

  return entries
}

/**
 * One thing the query asks for: a single word, or a quoted phrase.
 *
 * `source` is a regex source with no capturing groups, so terms can be joined
 * into one alternation that still has exactly one group — see `queryPattern`.
 * `first` is the term's first word, lowercased, for a cheap `includes` check
 * before the regex runs.
 */
interface QueryTerm {
  source: string
  first : string
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Splits a query into terms: each bare word is one, and a quoted phrase is
 * one. An unclosed quote runs to the end, so a phrase being typed already
 * searches as a phrase.
 *
 * A term matches from the start of a word — `for` finds "for" and "former",
 * not "performed" — and its last word is a prefix, so `calpro` still finds
 * calprotectin and a phrase keeps matching while its last word is typed.
 * Words inside a phrase may be separated by any whitespace, line breaks
 * included. A term that starts with punctuation (`/uL`, `#2`) has no word
 * start to anchor to and matches anywhere.
 */
function parseQuery(query: string): QueryTerm[] {
  const terms: QueryTerm[] = []

  for (const [, phrase, bare] of query.matchAll(/"([^"]*)"?|([^\s"]+)/g)) {
    const words = (phrase ?? bare).split(/\s+/).filter(Boolean)
    if (!words.length) continue

    const anchor = /^[\p{L}\p{N}]/u.test(words[0]) ? '(?<![\\p{L}\\p{N}])' : ''

    terms.push({
      source: anchor + words.map(escapeRegExp).join('\\s+'),
      first : words[0].toLowerCase(),
    })
  }

  return terms
}

/** Every term in the query must match somewhere in an entry, in any order. */
export function searchIndex(index: SearchEntry[], query: string): SearchEntry[] {
  const terms = parseQuery(query).map(term => ({ ...term, re: new RegExp(term.source, 'iu') }))
  if (!terms.length) return []
  return index.filter(e => terms.every(t => e._text.includes(t.first) && t.re.test(e._text)))
}

/**
 * Matches any of the query's terms, case-insensitively — the same terms
 * `searchIndex` looks for, for highlighting what it found. One capturing group
 * around the whole alternation, so `split` puts the matches at odd indices.
 * Null for a query with no terms.
 */
export function queryPattern(query: string, flags = 'i'): RegExp | null {
  const terms = parseQuery(query)
  if (!terms.length) return null
  return new RegExp(`(${terms.map(t => t.source).join('|')})`, flags.includes('u') ? flags : flags + 'u')
}
