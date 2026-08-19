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

export type ResourceExtractor<R extends fhir4.Resource = fhir4.Resource> =
  (resource: R) => EntryProps | EntryProps[] | null | undefined

/** Map resource type names to their extractor. Omit a type to exclude it entirely. */
export type IndexSchema = Partial<Record<string, ResourceExtractor<any>>>

export function buildSearchIndex(
  resources: FHIRResourceMap,
  schema: IndexSchema,
): SearchEntry[] {
  const entries: SearchEntry[] = []

  for (const [resourceType, extractor] of Object.entries(schema) as [string, ResourceExtractor][]) {
    const list = resources[resourceType]
    if (!list?.length) continue

    for (const resource of list) {
      const result = extractor(resource as fhir4.Resource)
      if (result == null) continue

      for (const props of Array.isArray(result) ? result : [result]) {
        if (!props.label) continue
        entries.push({
          resourceType,
          resourceId: (resource as any).id ?? '',
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

/** All terms in the query must appear (substring) for an entry to match. */
export function searchIndex(index: SearchEntry[], query: string): SearchEntry[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  return index.filter(e => terms.every(t => e._text.includes(t)))
}
