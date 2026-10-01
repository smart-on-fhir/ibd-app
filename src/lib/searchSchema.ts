import { utils }            from 'clinical-primitives'
import type { IndexSchema } from './search'
import type { FHIRResourceMap } from '../types/fhir'
import { conceptText as noteConceptText, documentReferenceText } from './clinicalNotes'
import type {
  AllergyIntolerance,
  Condition,
  DiagnosticReport,
  DocumentReference,
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
    // Formatted exactly as the details panel shows it, so a result and its
    // details agree — the library normalizes units (10*3/uL is ×10⁹/L), rounds,
    // and reads components and every value[x] type.
    const { value, unit } = utils.Observation.getObservationValue(r)
    const valueText       = [value, unit].filter(Boolean).join(' ') || undefined
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
      date:     r.performedDateTime ?? r.performedPeriod?.start,
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
    const label = r.type?.map(codeText).filter(Boolean).join(', ') || r.class?.display || r.class?.code
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

  DocumentReference: (r: DocumentReference, resources: FHIRResourceMap) => {
    if (r.status === 'entered-in-error') return null

    // Titled the way the Notes page titles it, so a note reads the same in both.
    const label = r.description
      || noteConceptText(r.type)
      || r.content?.[0]?.attachment?.title
      || 'Clinical note'

    // The whole body, not an excerpt: it is what the query is matched against,
    // and the result row cuts its own snippet around the match.
    const text = documentReferenceText(r, resources)

    return {
      label,
      sublabel: text || undefined,
      extra:    text,
      date:     r.date ?? r.context?.period?.start,
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
