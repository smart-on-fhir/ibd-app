import { useRef } from 'react'
import type {
    CodeableConcept, DiagnosticReport, MedicationRequest, Observation, Resource
} from 'fhir/r4'
import {
    MedicationDetail, ObservationDetail, ResourceSource, lib as cp
} from 'clinical-primitives'
import { useTextHighlight } from '../hooks/useTextHighlight'
import { isMarkdownNote }   from '../lib/clinicalNotes'
import { NoteText }         from './NoteText'


/** How a resource type reads to a clinician, where its FHIR name does not. */
const TYPE_LABELS: Record<string, string> = {
    AllergyIntolerance: 'Allergy',
    DiagnosticReport  : 'Diagnostic report',
    DocumentReference : 'Document',
    MedicationRequest : 'Medication',
    ServiceRequest    : 'Service request',
}

function typeLabel(resourceType: string): string {
    return TYPE_LABELS[resourceType] ?? resourceType.replace(/([a-z])([A-Z])/g, '$1 $2')
}

function conceptText(concept?: CodeableConcept): string | undefined {
    return concept?.text ?? concept?.coding?.[0]?.display ?? concept?.coding?.[0]?.code
}

/**
 * The details panel for one resource, as a clinician would want to read it —
 * the structured record first, with its FHIR source one click away.
 *
 * Medications and observations get the same panels the timeline shows. Every
 * other type gets a generic summary built from what the caller already knows
 * about it (the name, a line of detail and a date — the same things a search
 * result or list row shows), plus its status.
 *
 * With a `query`, its matches are highlighted wherever they appear in the
 * panel, the Source tree included.
 */
export function ResourceDetail({ query, ...props }: ResourceDetailProps & { query?: string }) {
    const ref = useRef<HTMLDivElement>(null)

    useTextHighlight(ref, query)

    return (
        <div ref={ref}>
            <ResourceDetailBody {...props} />
        </div>
    )
}

type ResourceDetailProps = {
    resource    : Resource
    label?      : string
    description?: string
    date?       : string
}

function ResourceDetailBody({ resource, label, description, date }: ResourceDetailProps) {
    if (resource.resourceType === 'MedicationRequest') {
        return <MedicationDetail medication={resource as MedicationRequest} />
    }

    if (resource.resourceType === 'Observation') {
        return <ObservationDetail observation={resource as Observation} />
    }

    // A report's conclusion is its substance, and callers tend to have only a
    // truncated line of it.
    const details = resource.resourceType === 'DiagnosticReport'
        ? (resource as DiagnosticReport).conclusion ?? description
        : description

    // Most types have a plain `status`. Conditions and allergies have none, and
    // their clinical status is the one a reader means by the word.
    const status = (resource as { status?: string }).status ??
        conceptText((resource as { clinicalStatus?: CodeableConcept }).clinicalStatus)

    return (
        <div className="cp-resource-detail">
            <dl>
                <dt>{typeLabel(resource.resourceType)}</dt>
                <dd><b>{label || 'Unnamed'}</b></dd>

                {/* A caller's line of detail is sometimes just the status —
                    a condition's search result, say — and saying it twice
                    reads as two different facts. */}
                { details && details.toLowerCase() !== status?.toLowerCase() &&
                    <>
                        <dt>Details</dt>
                        <dd><NoteText text={details} markdown={isMarkdownNote(details, resource)} /></dd>
                    </> }

                { status &&
                    <>
                        <dt>Status</dt>
                        <dd>{status}</dd>
                    </> }

                <dt>Date</dt>
                <dd>{date ? cp.formatDate(new Date(date)) : 'not recorded'}</dd>
            </dl>

            <ResourceSource resource={resource} />
        </div>
    )
}
