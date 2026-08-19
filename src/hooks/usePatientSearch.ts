import { useMemo, useCallback }          from 'react'
import { useClinicalData }               from 'clinical-primitives'
import { buildSearchIndex, searchIndex } from '../lib/search'
import { DEFAULT_SCHEMA }                from '../lib/searchSchema'
import type { IndexSchema, SearchEntry } from '../lib/search'

export type { SearchEntry, IndexSchema }

export function usePatientSearch(schema: IndexSchema = DEFAULT_SCHEMA) {
  const { resources } = useClinicalData()

  const index = useMemo(
    () => buildSearchIndex(resources, schema),
    // schema is typically a module-level constant so this dep is stable
    [resources, schema],
  )

  const search = useCallback(
    (query: string): SearchEntry[] => searchIndex(index, query),
    [index],
  )

  return { index, search }
}
