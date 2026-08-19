import type { FHIRCondition } from '../types/fhir'

// Condition code prefixes only — no JSX imports
const MODULE_CODES: Record<string, string[]> = {
  ibd: [
    'K50', 'K50.0', 'K50.1', 'K50.8', 'K50.9',
    'K51', 'K51.0', 'K51.2', 'K51.3', 'K51.4', 'K51.5', 'K51.8', 'K51.9',
  ],
}

export function detectModules(conditions: FHIRCondition[]): string[] {
  const codes = conditions.flatMap(c => c.code?.coding?.map(x => x.code ?? '') ?? [])
  return Object.entries(MODULE_CODES)
    .filter(([, prefixes]) =>
      prefixes.some(prefix => codes.some(c => c === prefix || c.startsWith(prefix + '.')))
    )
    .map(([id]) => id)
}
