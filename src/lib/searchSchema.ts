import type { IndexSchema } from './search'
import type {
  AllergyIntolerance,
  Condition,
  DiagnosticReport,
  Encounter,
  Immunization,
  MedicationRequest,
  Observation,
  Procedure,
  Patient,
  ServiceRequest
} from 'fhir/r4'

function deduplicate<T>(arr: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  for (const item of arr) {
    const key = keyFn(item)
    if (!seen.has(key)) {
      seen.add(key)
      result.push(item)
    }
  }
  return result
}

function codeText(cc?: fhir4.CodeableConcept): string {
  if (!cc) return ''
  return deduplicate([
    cc.text,
    ...(cc.coding ?? []).map(c => c.display)
  ], x => x + "").filter(Boolean)
  .join(' ')
}

export const DEFAULT_SCHEMA: IndexSchema = {

  Patient: (r: Patient) => {
    const name = r.name?.[0]
    const label = name
      ? `${name.family ?? ''}, ${name.given?.join(' ') ?? ''}`.trim().replace(/\s+/g, ' ')
      : 'Unnamed Patient'
    return {
      label,
      sublabel: r.id,
      date: r.birthDate,
    }
  },

  ServiceRequest: (r: ServiceRequest) => {
    const label = r.code ? codeText(r.code) : 'Service Request'
    if (!label) return null
    return {
      label,
      sublabel: r.status,
      date: r.authoredOn,
    }
  },

  Condition: (r: Condition) => {
    const label = codeText(r.code)
    if (!label) return null
    return {
      label,
      sublabel: r.clinicalStatus ? codeText(r.clinicalStatus) : undefined,
      date: r.recordedDate ?? r.onsetDateTime, // include original text for better matching, if different from code display
    }
  },

  MedicationRequest: (r: MedicationRequest) => {
    const label = codeText(r.medicationCodeableConcept)
    if (!label) return null
    return {
      label,
      sublabel: r.status,
      date: r.authoredOn,
    }
  },

  Observation: (r: Observation) => {
    const label = codeText(r.code)
    if (!label) return null
    const valueText =
      r.valueString ??
      (r.valueCodeableConcept ? codeText(r.valueCodeableConcept) : undefined) ??
      (r.valueQuantity
        ? `${r.valueQuantity.value} ${r.valueQuantity.unit ?? ''}`.trim()
        : undefined)
    return {
      label,
      sublabel: valueText,
      extra:    valueText,
      date:     r.effectiveDateTime ?? r.effectivePeriod?.start,
    }
  },

  Procedure: (r: Procedure) => {
    const label = codeText(r.code)
    if (!label) return null
    return {
      label,
      sublabel: r.status,
      date:     r.performedDateTime ?? (r.performedPeriod as any)?.start,
    }
  },

  AllergyIntolerance: (r: AllergyIntolerance) => {
    const label = codeText(r.code)
    if (!label) return null
    const reactions = r.reaction
      ?.flatMap(rx => rx.manifestation.map(m => codeText(m)))
      .filter(Boolean)
      .join(', ')
    return {
      label,
      sublabel: reactions || undefined,
      extra:    reactions,
      date:     r.recordedDate,
    }
  },

  Encounter: (r: Encounter) => {
    const label = r.type?.map(codeText).filter(Boolean).join(', ') || codeText(r.class as any)
    if (!label) return null
    const reasons = r.reasonCode?.map(codeText).filter(Boolean).join(', ')
    return {
      label,
      sublabel: reasons || undefined,
      extra:    reasons,
      date:     r.period?.start,
    }
  },

  DiagnosticReport: (r: DiagnosticReport) => {
    // Intentionally excludes presentedForm (attachments) — those go through the notes search API
    const label = codeText(r.code)
    if (!label) return null
    const conclusion = r.conclusion
    return {
      label,
      sublabel: conclusion ? conclusion.slice(0, 80) : undefined,
      extra:    conclusion,
      date:     r.effectiveDateTime,
    }
  },

  Immunization: (r: Immunization) => {
    const label = codeText(r.vaccineCode)
    if (!label) return null
    return {
      label,
      date: r.occurrenceDateTime,
    }
  },
}
