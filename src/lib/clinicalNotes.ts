import type {
    Attachment, Binary, CodeableConcept, DiagnosticReport, DocumentReference, Observation
} from 'fhir/r4'
import type { FHIRResourceMap } from '../types/fhir'


/**
 * A narrative document somewhere in the patient's record, reduced to what a
 * timeline needs: when it happened, what kind of note it is, and its text.
 *
 * Deliberately flat. Three unrelated resource types reach the chart through
 * this, and the chart should not have to know which one a bar came from —
 * `resource` is kept only so a detail view can go back to the source.
 */
export interface ClinicalNote {
    /** `ResourceType/id` — stable across re-fetches, so a selection survives one. */
    id: string
    resourceType: 'DocumentReference' | 'DiagnosticReport' | 'Observation'
    resource: DocumentReference | DiagnosticReport | Observation

    /** Row identity: the coded note type, or its text when there is no coding. */
    typeKey: string
    typeLabel: string

    /** Heading for this one note, which may be more specific than its type. */
    title: string

    /** Milliseconds. Equal for the usual case of a note filed at an instant. */
    start: number
    end: number

    /**
     * The first line or so of the body, for tooltips and scanning.
     *
     * Decoded from a bounded prefix of the attachment rather than from the
     * whole of it — every note on the chart needs one of these, and a note can
     * be tens of kilobytes.
     */
    preview: string

    /**
     * The note body, decoded on demand and then held.
     *
     * A function rather than a string because collecting notes must not decode
     * every attachment in the record: only the selected note is ever read, and
     * the base64 and HTML parsing behind this dominate everything else the
     * page does. Empty when the body is not inline — a `DocumentReference`
     * pointing at a Binary is a real note whose text simply is not here.
     */
    text: () => string

    /** Anything the body could not be read from: PDFs, images, external URLs. */
    attachments: Attachment[]
}

/**
 * How much of an attachment to decode for a preview.
 *
 * Cost is linear in this and paid for every note in the record: over four
 * hundred notes, 2048 bytes costs ~47 ms and 512 costs ~16. A kilobyte is the
 * balance — still several hundred characters once HTML markup is stripped,
 * against the 200 a preview keeps and the 160 a tooltip shows.
 */
const PREVIEW_BYTES = 1024

/**
 * Caps a run of blank lines at two.
 *
 * Note bodies arrive padded: a template leaves its unfilled sections behind as
 * whitespace, and HTML block elements each contribute a break of their own. Two
 * blank lines is enough to separate sections; past that the reader is scrolling
 * through nothing. Applied to every source so a note reads the same however it
 * reached the record.
 *
 * A "blank" line is rarely empty. Notes that began as HTML come back from the
 * parser with `&nbsp;` intact — a U+00A0, which is not whitespace to `\s` in
 * the way a space is — and template-generated ones carry stray spaces and tabs.
 * A run of lines holding nothing but those looks exactly like padding to a
 * reader, so it is treated as padding here: line ends are cleared first, and
 * only then are the runs counted.
 */
function collapseBlankLines(text: string): string {
    return text
        .replace(/\r\n?/g, '\n')
        // Every horizontal space Unicode has, NBSP and its narrow relatives
        // included — but never the newlines themselves, which are the thing
        // being counted.
        .replace(/[^\S\n]+$/gm, '')
        .replace(/\n{4,}/g, '\n\n\n')
        .trim()
}

/** The first readable fragment of a body, whitespace flattened to one line. */
function previewOf(parts: (string | undefined)[]): string {
    return (parts.find(Boolean) ?? '').trim().replace(/\s+/g, ' ').slice(0, 200)
}

/** Runs `compute` at most once, however often the result is asked for. */
function lazy<T>(compute: () => T): () => T {
    let cached: T
    let done = false

    return () => {
        if (!done) {
            cached = compute()
            done = true
        }
        return cached
    }
}


/** Display text for a CodeableConcept, preferring the human-entered text. */
export function conceptText(concept?: CodeableConcept): string {
    return concept?.text
        || concept?.coding?.find(c => c.display)?.display
        || concept?.coding?.find(c => c.code)?.code
        || ''
}

/**
 * Row identity for a note type.
 *
 * `system|code` when there is a coding, so two spellings of "Progress note"
 * share a row, and the lowercased text otherwise. Falls back to a constant
 * rather than to the resource id — an uncoded note belongs with the other
 * uncoded notes, not in a row of its own.
 */
export function conceptKey(concept?: CodeableConcept): string {
    const coding = concept?.coding?.find(c => c.code)

    if (coding) {
        return `${coding.system ?? ''}|${coding.code}`
    }

    return concept?.text ? `text:${normalizeLabel(concept.text)}` : 'unknown'
}

/**
 * A label reduced to what it says, so two spellings of it compare equal.
 *
 * Case and whitespace only. Nothing here rewrites words or strips punctuation —
 * "GI Image" and "GI Imaging" are different labels and must stay that way.
 */
export function normalizeLabel(label: string): string {
    return label.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * What can actually be done with an attachment that carries no readable text.
 *
 * - `inline`   — the bytes are here, or reachable in a Binary that came with
 *                the bundle, so it can be previewed.
 * - `external` — an absolute URL. It may well resolve, but not from here:
 *                fetching it needs an auth context this has no business
 *                assuming, so it is offered as a link rather than opened.
 * - `missing`  — a relative FHIR reference to a resource the record does not
 *                contain. The note says a document exists; the bundle did not
 *                bring it.
 */
export type ResolvedAttachment =
    | { state: 'inline'  , attachment: Attachment }
    | { state: 'external', url: string }
    | { state: 'missing' , location?: string }

/**
 * Where an attachment's content actually is.
 *
 * `Binary/123` is followed into the bundle when it came along, which is the
 * common case for exported records — the DocumentReference names a Binary and
 * the Binary is two entries further down. Unresolvable is reported rather than
 * hidden: a reference to a document nobody shipped is a fact about the record,
 * and the same thing the FHIR viewer draws in red.
 */
export function resolveAttachment(
    attachment: Attachment,
    resources: FHIRResourceMap
): ResolvedAttachment {
    if (attachment.data) {
        return { state: 'inline', attachment }
    }

    const url = attachment.url

    if (!url) {
        return { state: 'missing' }
    }

    // The bundle is asked first, and about absolute URLs too: an exported
    // record routinely refers to its own Binaries by their full server URL, and
    // those are here — sending the reader to the network for a document sitting
    // two entries away would be wrong.
    //
    // Only the last two segments identify the resource, so a leading slash or
    // any amount of base path in front of `Binary/abc` is tolerated.
    const [, type, id] = url.match(/(?:^|\/)([A-Za-z]+)\/([A-Za-z0-9\-.]+)$/) ?? []
    const target = type && id ? (resources[type] ?? []).find(resource => resource.id === id) : undefined
    const binary = target as Binary | undefined

    // A Binary carries the bytes the attachment was standing in for; any other
    // resource type resolved, but has nothing to preview.
    if (type === 'Binary' && binary?.data) {
        return {
            state     : 'inline',
            attachment: {
                ...attachment,
                contentType: attachment.contentType ?? binary.contentType,
                data       : binary.data
            }
        }
    }

    // Unresolved and absolute: it may well exist, but reaching it needs an auth
    // context this has no business assuming.
    if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
        return { state: 'external', url }
    }

    return { state: 'missing', location: url }
}

/** Milliseconds for a FHIR dateTime, or null if absent or unparsable. */
function ms(date?: string): number | null {
    if (!date) return null
    const value = new Date(date).getTime()
    return isNaN(value) ? null : value
}

/**
 * Text out of an attachment, when it carries any.
 *
 * Only inline `data` is read: an attachment that is a URL is a promise that the
 * text exists somewhere else, and fetching it is a decision for a caller with an
 * auth context, not for a parser.
 */
export function isTextualAttachment(attachment: Attachment): boolean {
    if (!attachment.data) {
        return false
    }

    const contentType = (attachment.contentType ?? 'text/plain').split(';')[0].trim().toLowerCase()

    return contentType === 'text/plain'
        || contentType === 'text/html'
        || contentType === 'application/xhtml+xml'
        || contentType === 'text/xml'
}

export function attachmentText(attachment: Attachment, maxBytes?: number): string {
    const contentType = (attachment.contentType ?? 'text/plain').split(';')[0].trim().toLowerCase()

    if (!isTextualAttachment(attachment)) {
        return ''
    }

    let decoded: string

    try {
        // Four base64 characters carry three bytes, so a prefix has to be cut
        // on a multiple of four or the last group decodes to rubbish.
        const source = maxBytes === undefined
            ? attachment.data!
            : attachment.data!.slice(0, Math.ceil(maxBytes / 3) * 4)

        // `atob` yields one char per byte; notes are routinely UTF-8 and come
        // out mojibake without this step.
        const bytes = Uint8Array.from(atob(source), c => c.charCodeAt(0))

        // `stream: true` drops a multi-byte character the cut landed inside,
        // rather than emitting a replacement character at the end of a preview.
        decoded = new TextDecoder().decode(bytes, { stream: maxBytes !== undefined })
    } catch {
        return ''
    }

    if (contentType === 'text/plain') {
        return decoded
    }

    // Parsed rather than regex-stripped, and read back as `textContent` — the
    // markup never becomes live DOM, so a note carrying a script or an inline
    // handler is text like everything else.
    try {
        const doc = new DOMParser().parseFromString(decoded, 'text/html')
        doc.querySelectorAll('br').forEach(br => br.replaceWith('\n'))
        doc.querySelectorAll('p, div, li, tr, h1, h2, h3, h4, h5, h6')
            .forEach(block => block.append('\n'))
        // Left as parsed — blank-line policy is one rule, applied to every
        // source in `collapseBlankLines`, rather than one per content type.
        return (doc.body.textContent ?? '').trim()
    } catch {
        return decoded
    }
}

/**
 * Whether an Observation's value is prose rather than a datum.
 *
 * A line break is the whole test, and it is a heuristic: a one-line
 * `valueString` is a coded answer or a short remark, while assessments,
 * impressions and instructions arrive as several lines. Anything narrower
 * would need a code list, and these observations are precisely the ones whose
 * codes are local and unpredictable.
 */
export function isNarrativeObservation(obs: Observation): boolean {
    return typeof obs.valueString === 'string' && /\r?\n/.test(obs.valueString.trim())
}


function fromDocumentReference(doc: DocumentReference): ClinicalNote | null {
    if (doc.status === 'entered-in-error') return null

    const start = ms(doc.date) ?? ms(doc.context?.period?.start)
    if (start === null) return null

    // Split by content type alone — no decoding here. Which attachments hold
    // text is answerable from their headers, and answering it that way is what
    // keeps a record of four hundred notes off the main thread.
    const attachments = (doc.content ?? []).map(c => c.attachment).filter(Boolean)
    const readable    = attachments.filter(isTextualAttachment)

    // `type` is the note's kind — "Progress note", "Discharge summary" — while
    // `category` is the broader class it belongs to. Rows are the former where
    // it exists, since that is the distinction a reader is scanning for.
    const type = doc.type ?? doc.category?.[0]

    return {
        id          : `DocumentReference/${doc.id ?? start}`,
        resourceType: 'DocumentReference',
        resource    : doc,
        typeKey     : conceptKey(type),
        typeLabel   : conceptText(type) || 'Clinical note',
        title       : doc.description || conceptText(doc.type) || attachments[0]?.title || 'Clinical note',
        start,
        end         : ms(doc.context?.period?.end) ?? start,
        preview     : previewOf(readable.map(a => attachmentText(a, PREVIEW_BYTES))),
        text        : lazy(() => collapseBlankLines(
            readable.map(a => attachmentText(a)).filter(Boolean).join('\n\n')
        )),
        attachments : attachments.filter(a => !readable.includes(a))
    }
}

function fromDiagnosticReport(report: DiagnosticReport): ClinicalNote | null {
    if (report.status === 'entered-in-error') return null

    const start = ms(report.effectiveDateTime) ?? ms(report.effectivePeriod?.start) ?? ms(report.issued)
    if (start === null) return null

    const forms    = report.presentedForm ?? []
    const readable = forms.filter(isTextualAttachment)

    // A report only earns a bar if it has narrative of its own. Lab panels —
    // CBC, BMP, lipids — are DiagnosticReports whose entire content is
    // `result` references to Observations: nothing to read here, and one row
    // per panel crowds out the reports that do carry text. A `presentedForm`
    // counts even when it cannot be read inline, since a PDF is a document
    // the reader can be pointed at.
    if (!report.conclusion && forms.length === 0) {
        return null
    }

    return {
        id          : `DiagnosticReport/${report.id ?? start}`,
        resourceType: 'DiagnosticReport',
        resource    : report,
        typeKey     : conceptKey(report.code),
        typeLabel   : conceptText(report.code) || 'Report',
        title       : conceptText(report.code) || 'Report',
        start,
        end         : ms(report.effectivePeriod?.end) ?? start,
        preview     : previewOf([report.conclusion, ...readable.map(a => attachmentText(a, PREVIEW_BYTES))]),
        // The conclusion leads: it is the report's own summary, and a reader
        // opening a colonoscopy report wants the impression before the full text.
        text        : lazy(() => collapseBlankLines(
            [report.conclusion, ...readable.map(a => attachmentText(a))]
                .filter(Boolean)
                .join('\n\n')
        )),
        attachments : forms.filter(a => !readable.includes(a))
    }
}

function fromObservation(obs: Observation): ClinicalNote | null {
    if (obs.status === 'entered-in-error' || !isNarrativeObservation(obs)) return null

    const start = ms(obs.effectiveDateTime) ?? ms(obs.effectivePeriod?.start) ?? ms(obs.issued)
    if (start === null) return null

    return {
        id          : `Observation/${obs.id ?? start}`,
        resourceType: 'Observation',
        resource    : obs,
        typeKey     : conceptKey(obs.code),
        typeLabel   : conceptText(obs.code) || 'Narrative observation',
        title       : conceptText(obs.code) || 'Narrative observation',
        start,
        end         : ms(obs.effectivePeriod?.end) ?? start,
        preview     : previewOf([obs.valueString]),
        text        : lazy(() => collapseBlankLines(obs.valueString ?? '')),
        attachments : []
    }
}

/**
 * Collapses rows that say the same thing in different letters.
 *
 * The same note type reaches the record by more than one route: coded in one
 * feed and free-text in another, or spelled "GI IMAGE - HISTORICAL" by a legacy
 * interface and "GI Image - Historical" by its replacement. Those arrive with
 * different {@link ClinicalNote.typeKey}s — one `system|code`, one `text:…` —
 * and become two rows for what a reader sees as one thing.
 *
 * So identity is settled twice: by code where the record supplied one, then by
 * label across whatever is left. A coded key still wins the merged group's
 * identity, since a code is an assertion and a label is a spelling.
 *
 * The cost is that two genuinely distinct codes sharing a display name merge
 * into one row. That is the right trade here — a reader cannot tell them apart
 * on the chart either, and the code is still on every bar's detail panel.
 */
function unifyTypeLabels(notes: ClinicalNote[]): ClinicalNote[] {
    const variants = new Map<string, { keys: Set<string>, labels: Map<string, number> }>()

    for (const note of notes) {
        const normalized = normalizeLabel(note.typeLabel)
        const entry = variants.get(normalized) ?? { keys: new Set(), labels: new Map() }

        // Counted by the tidied spelling, so stray double spaces do not split
        // one variant's votes — or win the row a label with them still in it.
        const tidy = note.typeLabel.trim().replace(/\s+/g, ' ')

        entry.keys.add(note.typeKey)
        entry.labels.set(tidy, (entry.labels.get(tidy) ?? 0) + 1)
        variants.set(normalized, entry)
    }

    const canonical = new Map<string, { key: string, label: string }>()

    for (const [normalized, { keys, labels }] of variants) {
        const keyList = [...keys].sort()

        canonical.set(normalized, {
            // A coded key over a text one, and a stable pick when there are
            // several of either — the row must not change identity between
            // renders, which is what the bar selection is keyed against.
            key  : keyList.find(key => !key.startsWith('text:') && key !== 'unknown') ?? keyList[0],
            label: pickLabel(labels)
        })
    }

    return notes.map(note => {
        const pick = canonical.get(normalizeLabel(note.typeLabel))
        return pick ? { ...note, typeKey: pick.key, typeLabel: pick.label } : note
    })
}

/**
 * Whether a label is shouting rather than abbreviating.
 *
 * Uppercase alone will not do: "MRI", "CT" and "EGD" are how those are
 * written, and a rule that demoted them would pick a worse spelling whenever
 * one existed. A word of four or more letters in caps is the tell — acronyms
 * that long are rare, and legacy interfaces upcase whole phrases.
 */
function isShouting(label: string): boolean {
    return !/[a-z]/.test(label) && /[A-Za-z]{4,}/.test(label)
}

/**
 * Which spelling of a label to show.
 *
 * A mixed-case variant beats a shouted one outright, even a rarer one: ALL CAPS
 * is an artifact of the system that emitted it rather than anyone's choice, and
 * one shouted row label drags the eye away from every neighbor. Among variants
 * that are equally shouty — usually none of them — the record's predominant
 * spelling wins, then the one with more capitals, which is what keeps "MRI"
 * from losing to "mri". Alphabetical order settles the rest, so the pick is
 * stable across renders.
 */
function pickLabel(labels: Map<string, number>): string {
    const capitals = (label: string) => (label.match(/[A-Z]/g) ?? []).length

    return [...labels.entries()]
        .sort(([labelA, countA], [labelB, countB]) =>
            Number(isShouting(labelA)) - Number(isShouting(labelB)) ||
            countB - countA ||
            capitals(labelB) - capitals(labelA) ||
            labelA.localeCompare(labelB)
        )[0][0]
}

export interface CollectNotesOptions {
    /**
     * A further test an Observation must pass, on top of carrying prose.
     *
     * The narrative rule alone is domain-blind, and a record's narrative
     * observations are not all about the thing the chart is for. A caller with
     * a panel — an IBD view, a cardiology view — passes membership of it here
     * rather than filtering afterwards, so the count in the narrative and the
     * rows on the chart cannot disagree.
     *
     * Applies to Observations only. DocumentReferences and DiagnosticReports are
     * documents in their own right; an analyte panel says nothing about them.
     */
    includeObservation?: (obs: Observation) => boolean
}

/**
 * Every note-bearing resource in the record, in chronological order.
 *
 * Three sources, one shape: all DocumentReferences, the DiagnosticReports that
 * carry narrative of their own, and the Observations whose value is prose. A
 * resource with no usable date is dropped rather than guessed at — a note that
 * cannot be placed in time has no position on a timeline.
 */
export function collectClinicalNotes(
    resources: FHIRResourceMap,
    { includeObservation }: CollectNotesOptions = {}
): ClinicalNote[] {
    const observations = (resources.Observation ?? []) as Observation[]

    const notes = [
        ...((resources.DocumentReference ?? []) as DocumentReference[]).map(fromDocumentReference),
        ...((resources.DiagnosticReport  ?? []) as DiagnosticReport[]).map(fromDiagnosticReport),
        ...(includeObservation ? observations.filter(includeObservation) : observations).map(fromObservation)
    ]

    return unifyTypeLabels(
        notes.filter((note): note is ClinicalNote => note !== null)
    ).sort((a, b) => a.start - b.start)
}
