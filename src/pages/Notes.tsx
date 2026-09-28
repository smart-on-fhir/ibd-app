import { useMemo, useState }     from 'react'
import type { Attachment }       from 'fhir/r4'
import { File, FileText }        from 'lucide-react'
import { isIBDPanelObservation } from '../modules/ibd/utils'
import type { FHIRResourceMap }  from '../types/fhir'
import { Preload }               from '../components/Preload'
import {
    AttachmentPreview, Collapse, ResourceSource, TimelineChart,
    useClinicalData, lib as cp
} from 'clinical-primitives'
import {
    collectClinicalNotes, resolveAttachment, type ClinicalNote
} from '../lib/clinicalNotes'


/**
 * Derived from the component rather than imported: the library exports
 * `BarChartTimeline` but not its row type, and reading the type off the props
 * keeps this correct if the shape changes.
 */
type TimelineBarRow = React.ComponentProps<typeof TimelineChart.BarChartTimeline>['rows'][number]


/** One palette entry per row, so a note type keeps its color across the chart. */
const ROW_COLORS = ['blue', 'teal', 'purple', 'amber', 'green', 'red', 'yellow']

/** Enough of a note to tell two bars on the same row apart, not the note itself. */
const TOOLTIP_SNIPPET = 160

/**
 * Markdown is the tooltip's language, so anything from the record has to be
 * escaped or a note containing `*` or `_` renders as emphasis.
 *
 * Only the markers the tooltip renderer actually reads. Escaping the rest of
 * CommonMark's punctuation — dots, parens, brackets — puts visible backslashes
 * in the bubble, because a renderer that never treated `.` as syntax has no
 * reason to treat `\.` as an escape either. Mirrors the library's own
 * `escapeTooltipMarkdown`, which is not among its public exports.
 */
function escapeMarkdown(text: string): string {
    return text
        .replace(/([\\`*_~])/g, '\\$1')
        // `-` and `+` are syntax only at the start of a line, where they would
        // turn an interpolated value into a list item.
        .replace(/^([-+])(\s)/gm, '\\$1$2')
}

function noteTooltip(note: ClinicalNote): string {
    const date = cp.formatDate(new Date(note.start))

    // The bounded preview, never the body: this runs for every bar on the
    // chart, and reaching for `note.text()` here would decode the whole record.
    const snippet = note.preview.slice(0, TOOLTIP_SNIPPET)
    const elided  = note.preview.length > TOOLTIP_SNIPPET

    return [
        `**${escapeMarkdown(note.title)}**`,
        escapeMarkdown(date),
        snippet && escapeMarkdown(snippet + (elided ? '…' : '')),
        !snippet && note.attachments.length > 0 && '_Attachment not shown inline_'
    ].filter(Boolean).join('\n\n')
}

/**
 * One attachment that carried no readable text, shown as whatever it turned out
 * to be: a preview when the bytes are here, a link when they are somewhere
 * reachable, and a stated absence when the record refers to a document it did
 * not bring.
 *
 * The missing case is drawn the way the FHIR viewer draws an unresolvable
 * reference — red, with a warning triangle — because it is the same fact, and
 * a reader who has seen one should recognize the other.
 */
function AttachmentItem({ attachment, resources }: {
    attachment: Attachment,
    resources : FHIRResourceMap
}) {
    const resolved = resolveAttachment(attachment, resources)
    const type     = attachment.contentType ?? 'unknown type'
    const name     = attachment.title || attachment.contentType || 'Document'

    if (resolved.state === 'inline') {
        return (
            <li>
                <Collapse label={<span className="cp-text-blue">{name}</span>}>
                    <AttachmentPreview attachment={resolved.attachment} />
                </Collapse>
            </li>
        )
    }

    if (resolved.state === 'external') {
        return (
            <li className="flex items-start gap-1.5">
                <File size={16} className="mt-0.5 shrink-0" />
                <span>
                    Document of type {type} is stored at{' '}
                    <a href={resolved.url} target="_blank" rel="noreferrer" className="break-all underline">
                        {resolved.url}
                    </a>
                </span>
            </li>
        )
    }

    return (
        <li className="cp-text-red flex items-start gap-1.5" title="Not found in patient's resources">
            <File size={16} className="mt-0.5 shrink-0" />
            <span>
                Document of type {type} is not available
                { resolved.location && <> at <code className="break-all">{resolved.location}</code></> }
            </span>
        </li>
    )
}

/**
 * The selected note, read in full — with the resource it came from underneath.
 *
 * The source view is not a debugging aid here: a note that shows no text is
 * indistinguishable from one that has none until you can see the resource, so
 * it gets the same Source entry the library's own detail panels use.
 */
function NoteDetail({ note }: { note: ClinicalNote }) {
    const { resources } = useClinicalData()

    // Where the body is finally decoded — one note, the one being read. Held
    // by the note itself afterwards, so reselecting it costs nothing.
    const text = note.text()

    return (
        <div className="cp-resource-detail space-y-3">
            <div>
                <div className="font-semibold">{note.title}</div>
                <div className="text-xs text-stone-500">
                    { cp.formatDate(new Date(note.start)) } · {note.typeLabel} · {note.resourceType}
                </div>
            </div>

            { text ?
                // Pre-wrapped rather than reflowed: clinical notes carry meaning
                // in their line breaks — headed sections, lists, vitals blocks.
                <pre className="whitespace-pre-wrap font-sans leading-tight text-sky-800" style={{
                    fontSize    : "80%",
                    borderTop   : '1px solid var(--color-stone-300)',
                    borderBottom: '1px solid var(--color-stone-300)',
                    padding     : '0.5rem 0',
                    margin      : '0.5rem 0'
                }}>
                    {text}
                </pre> :
                <p className="text-sm text-stone-500">
                    This note has no inline text.
                    { note.attachments.length > 0 &&
                        (note.attachments.length === 1 ? ' Its content is an attachment:' : ' Its content is in attachments:') }
                </p>
            }

            { note.attachments.length > 0 &&
                <ul className="text-xs text-stone-500 space-y-1">
                    { note.attachments.map((attachment, index) => (
                        <AttachmentItem key={index} attachment={attachment} resources={resources} />
                    )) }
                </ul>
            }

            <ResourceSource resource={note.resource} />
        </div>
    )
}

export function NotesPage() {
    return (
        <Preload
            resourceTypes={[
                // "Patient",
                "Observation",
                // "MedicationRequest",
                // "Condition",
                "DiagnosticReport",
                // "Procedure",
                "DocumentReference",
                // "Binary"
            ]}
            label="Loading notes…"
        >
            <NotesContent />
        </Preload>
    )
}

function NotesContent() {
    const { resources } = useClinicalData()

    // Selection is held here rather than read from the chart: the chart's
    // context hook is not part of the library's public surface. With one
    // section on the chart nothing else can take the selection over, so the
    // two cannot disagree.
    const [selectedId, setSelectedId] = useState<string | null>(null)

    // Narrative observations are limited to the IBD panel: this is an
    // IBD-focused view, and a record's prose observations otherwise arrive from
    // every service the patient has ever seen.
    const notes = useMemo(
        () => collectClinicalNotes(resources ?? {}, { includeObservation: isIBDPanelObservation }),
        [resources]
    )

    // Rows are note types in alphabetical order. The row label is what a reader
    // is looking for on this chart — "where are the pathology reports" — and
    // that is a find, not a read. Ordering by first appearance would tell a
    // story about the record instead, at the cost of making any one row
    // something you have to hunt for.
    //
    // It also makes the order independent of the data, so a row keeps its
    // position — and with it its color — when more history is loaded.
    const rows: TimelineBarRow[] = useMemo(() => {
        const byType = new Map<string, ClinicalNote[]>()

        for (const note of notes) {
            const group = byType.get(note.typeKey)
            if (group) group.push(note)
            else byType.set(note.typeKey, [note])
        }

        return [...byType.values()]
            .sort((a, b) =>
                a[0].typeLabel.localeCompare(b[0].typeLabel) ||
                // Two types that share a label are already merged, so this only
                // settles the pathological case — but it keeps the order total,
                // and a total order is what stops rows swapping between renders.
                a[0].typeKey.localeCompare(b[0].typeKey)
            )
            .map((group, index) => ({
                label: <span title={group[0].typeLabel}>{group[0].typeLabel}</span>,
                bars: group.map(note => ({
                    x1       : note.start,
                    x2       : note.end,
                    id       : note.id,
                    className: `cp-fill-${ROW_COLORS[index % ROW_COLORS.length]}`,
                    tooltip  : noteTooltip(note),
                    onSelect : () => setSelectedId(note.id)
                }))
            }))
    }, [notes])

    const selectedNote = selectedId ? notes.find(note => note.id === selectedId) : undefined

    return (
        <div className="pt-6">
            <div>
                <TimelineChart
                    title={<h3 className="flex items-center gap-2"><FileText /> Clinical Notes</h3>}
                >
                    <TimelineChart.BarChartTimeline
                        label="Notes"
                        rows={rows}
                        narrative={
                            <p>
                                { notes.length === 0 ?
                                    'No clinical notes in this record.' :
                                    <>
                                        {notes.length} note{notes.length === 1 ? '' : 's'} across{' '}
                                        {rows.length} type{rows.length === 1 ? '' : 's'}, from
                                        DocumentReferences, DiagnosticReports and narrative
                                        observations from the IBD lab panel. Select a note to
                                        read it.
                                    </>
                                }
                            </p>
                        }
                        selection={selectedNote && <NoteDetail note={selectedNote} />}
                    />
                </TimelineChart>

                { notes.length === 0 &&
                    <p className="mt-4 text-sm text-stone-500">
                        This patient's record contains no DocumentReference, no DiagnosticReport
                        carrying its own narrative, and no IBD-panel Observation with a
                        multi-line <code>valueString</code>.
                    </p>
                }
            </div>
        </div>
    )
}
