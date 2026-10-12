/**
 * Germline variants for the selected patient, read alongside their parents'
 * samples to show where each variant came from.
 */

import { Fragment, useEffect, useState } from 'react'
import { useParams }    from 'react-router'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Spinner }      from '../components/ui/Spinner'
import { ErrorMessage } from '../components/ui/ErrorMessage'
import { EmptyState }   from '../components/ui/EmptyState'
import {
    genesWithHitsFromBothParents, loadPatientReport, loadVariantCount,
    type CandidateVariant, type Inheritance, type TrioReport
} from '../lib/trioReport'


type Filter = 'all' | 'pathogenic' | 'bothParents' | 'notInParents'

/**
 * The filters in the order they are offered. The first one with any variants
 * is selected to begin with: most children have no pathogenic or likely
 * pathogenic variant at all (7 of the 10 in the synthetic cohort), and opening
 * on an empty table would bury the candidates there are.
 */
const FILTERS: { filter: Filter, label: string }[] = [
    { filter: 'pathogenic'  , label: 'Pathogenic or likely pathogenic' },
    { filter: 'all'         , label: 'All candidates'                  },
    { filter: 'bothParents' , label: 'Hits from both parents'          },
    { filter: 'notInParents', label: 'Not in parents'                  },
]

const CLASSIFICATION_STYLE: Record<string, string> = {
    Pathogenic       : 'bg-red-100 text-red-800 ring-red-300',
    Likely_pathogenic: 'bg-orange-100 text-orange-800 ring-orange-300',
    VUS              : 'bg-amber-50 text-amber-800 ring-amber-200',
    Likely_benign    : 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    Benign           : 'bg-emerald-50 text-emerald-800 ring-emerald-200',
}

const INHERITANCE_LABEL: Record<Inheritance, string> = {
    father : 'Father',
    mother : 'Mother',
    both   : 'Both parents',
    neither: 'Not in parents',
    unknown: '–',
}

// =============================================================================
// Formatting
// =============================================================================

/** `Likely_pathogenic` as `Likely pathogenic`; VUS stays an abbreviation. */
function humanize(value: string): string {
    return value.replace(/_/g, ' ').replace(/&/g, ', ')
}

/** HGVS without its transcript: `ENSP00000269228.4:p.Cys914Arg` as `p.Cys914Arg`. */
function shortHgvs(hgvs: string | undefined): string | undefined {
    return hgvs?.split(':').pop()
}

function formatFrequency(af: number | undefined): string {
    if (af === undefined) return 'Absent'
    if (af === 0) return '0'
    return af < 0.001 ? af.toExponential(1) : af.toFixed(4)
}

function formatScore(score: number | undefined, digits = 2): string {
    return score === undefined ? '–' : score.toFixed(digits)
}

// =============================================================================
// Data
// =============================================================================

type ReportState =
    | { status: 'loading' }
    | { status: 'ready', report: TrioReport }
    | { status: 'none' }
    | { status: 'error', error: Error }

function usePatientReport(patientId: string): ReportState {
    const [state, setState] = useState<ReportState>({ status: 'loading' })

    useEffect(() => {
        let cancelled = false
        loadPatientReport(patientId)
            .then(report => { if (!cancelled) setState(report ? { status: 'ready', report } : { status: 'none' }) })
            .catch(e => { if (!cancelled) setState({ status: 'error', error: e instanceof Error ? e : new Error(String(e)) }) })
        return () => { cancelled = true }
    }, [patientId])

    return state
}

/**
 * How many variants were called in a sample, once known. Left out on failure:
 * the page reads fine without it.
 */
function useVariantCount(sampleId: string): number | undefined {
    const [count, setCount] = useState<number>()

    useEffect(() => {
        let cancelled = false
        loadVariantCount(sampleId)
            .then(n => { if (!cancelled) setCount(n) })
            .catch(e => console.warn('Could not count variants:', e))
        return () => { cancelled = true }
    }, [sampleId])

    return count
}

/** Seconds since mounting, ticking while `running`. */
function useElapsedSeconds(running: boolean): number {
    const [seconds, setSeconds] = useState(0)
    useEffect(() => {
        if (!running) return
        const start = Date.now()
        const timer = setInterval(() => setSeconds(Math.round((Date.now() - start) / 1000)), 1000)
        return () => clearInterval(timer)
    }, [running])
    return seconds
}

// =============================================================================
// Components
// =============================================================================

function Loading() {
    const seconds = useElapsedSeconds(true)
    return (
        <div className="flex flex-col items-center gap-2 py-16 text-sm text-stone-500">
            <Spinner />
            {/* About a minute when the API is warm, measured. After it has been
                idle, one query alone has taken three and a half minutes. */}
            { seconds < 90
                ? <p>Running genomic queries. This usually takes about a minute.</p>
                : <p>Still running. The genomics service can take a few minutes when it has been idle.</p>
            }
            <p className="text-xs text-stone-400 tabular-nums">{seconds}s</p>
        </div>
    )
}

function ClassificationBadge({ value }: { value: string }) {
    const style = CLASSIFICATION_STYLE[value] ?? 'bg-stone-100 text-stone-700 ring-stone-200'
    return (
        <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ring-1 ${style}`}>
            {humanize(value)}
        </span>
    )
}

function InheritanceLabel({ value }: { value: Inheritance }) {
    if (value === 'neither') {
        return (
            <span
                className="whitespace-nowrap rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-800"
                data-tooltip="Found in the child but in neither parent: a possible new (de novo) variant"
            >
                {INHERITANCE_LABEL.neither}
            </span>
        )
    }
    if (value === 'unknown') {
        return (
            <span
                className="text-stone-400"
                data-tooltip="A parent's sample is missing, so where this variant came from cannot be told"
            >
                {INHERITANCE_LABEL.unknown}
            </span>
        )
    }
    return <span className="whitespace-nowrap">{INHERITANCE_LABEL[value]}</span>
}

/** ACMG criteria as chips: evidence for pathogenic in red, for benign in green. */
function AcmgCriteria({ criteria }: { criteria: CandidateVariant['acmg'] }) {
    if (!criteria.length) return <span className="text-stone-400">None recorded</span>
    return (
        <div className="flex flex-wrap gap-1">
            { criteria.map(({ code, strength }) => (
                <span
                    key={code}
                    className={`rounded px-1.5 py-0.5 text-xs ${code.startsWith('B') ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}
                    data-tooltip={humanize(strength)}
                >
                    {code}
                </span>
            )) }
        </div>
    )
}

function Detail({ label, children }: { label: string, children: React.ReactNode }) {
    return (
        <div>
            <dt className="text-xs uppercase tracking-wider text-stone-400">{label}</dt>
            <dd className="mt-0.5 text-stone-700">{children}</dd>
        </div>
    )
}

function VariantDetails({ variant }: { variant: CandidateVariant }) {
    return (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Position (GRCh38)">
                {variant.chrom}:{variant.position.toLocaleString()} {variant.ref}&gt;{variant.alt}
            </Detail>
            <Detail label="Transcript">
                {variant.transcript ?? '–'}
                { variant.hgvsc && <div className="text-xs text-stone-500">{shortHgvs(variant.hgvsc)}</div> }
            </Detail>
            <Detail label="Consequence">
                {variant.consequence ? humanize(variant.consequence) : '–'}
                { variant.impact && <span className="text-stone-400"> · {variant.impact.toLowerCase()} impact</span> }
            </Detail>
            <Detail label="ClinVar">
                {variant.clinvar ? humanize(variant.clinvar) : 'Not in ClinVar'}
                { variant.clinvarReview && <div className="text-xs text-stone-500">{humanize(variant.clinvarReview)}</div> }
            </Detail>
            <Detail label="Predictions">
                <span className="tabular-nums">
                    REVEL {formatScore(variant.revel)} · AlphaMissense {formatScore(variant.alphaMissense)}
                    {' '}· CADD {formatScore(variant.cadd, 1)} · SpliceAI {formatScore(variant.spliceAi)}
                </span>
            </Detail>
            <Detail label="IBD gene evidence">
                {variant.ibdEvidence ?? variant.ibdCategory ?? '–'}
            </Detail>
            <div className="sm:col-span-2 lg:col-span-3">
                <Detail label="ACMG criteria">
                    <AcmgCriteria criteria={variant.acmg} />
                </Detail>
            </div>
            { variant.omim && (
                <div className="sm:col-span-2 lg:col-span-3">
                    <Detail label="OMIM phenotypes">
                        <ul className="list-disc pl-4">
                            { variant.omim.split(';').map(p => p.trim()).filter(Boolean).map(p => <li key={p}>{p}</li>) }
                        </ul>
                    </Detail>
                </div>
            ) }
        </dl>
    )
}

function VariantTable({ variants, bothParentGenes }: { variants: CandidateVariant[], bothParentGenes: Set<string> }) {
    const [open, setOpen] = useState<string | null>(null)

    if (!variants.length) return <EmptyState message="No variants match this filter." />

    return (
        <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-stone-400">
                <tr>
                    <th className="w-6" />
                    <th className="py-1 pr-4 font-medium">Gene</th>
                    <th className="py-1 pr-4 font-medium">Variant</th>
                    <th className="py-1 pr-4 font-medium">Classification</th>
                    <th className="py-1 pr-4 font-medium">Inherited from</th>
                    <th className="py-1 pr-4 font-medium text-right">gnomAD AF</th>
                    <th className="py-1 font-medium text-right">REVEL</th>
                </tr>
            </thead>
            <tbody>
                { variants.map(variant => {
                    const isOpen = open === variant.vrsId
                    return (
                        <Fragment key={variant.vrsId}>
                            <tr
                                className={`cursor-pointer border-t border-stone-100 hover:bg-stone-50 ${isOpen ? 'bg-stone-50' : ''}`}
                                onClick={() => setOpen(isOpen ? null : variant.vrsId)}
                                aria-expanded={isOpen}
                            >
                                <td className="py-2 text-stone-400">
                                    { isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" /> }
                                </td>
                                <td className="py-2 pr-4">
                                    <span className="font-semibold text-stone-900">{variant.gene}</span>
                                    { bothParentGenes.has(variant.gene) && (
                                        <span
                                            className="ml-1.5 whitespace-nowrap rounded bg-sky-100 px-1 py-0.5 text-[0.65rem] font-medium text-sky-800"
                                            data-tooltip="Variants in this gene from each parent: a possible recessive (compound heterozygous) pattern"
                                        >
                                            2 hits
                                        </span>
                                    ) }
                                </td>
                                <td className="py-2 pr-4">
                                    <div className="text-stone-800">{shortHgvs(variant.hgvsp) ?? shortHgvs(variant.hgvsc) ?? `${variant.ref}>${variant.alt}`}</div>
                                    <div className="text-xs text-stone-400">
                                        {variant.consequence ? humanize(variant.consequence) : ''}
                                        {variant.zygosity === 'homozygous' ? ' · homozygous' : ''}
                                    </div>
                                </td>
                                <td className="py-2 pr-4"><ClassificationBadge value={variant.classification} /></td>
                                <td className="py-2 pr-4"><InheritanceLabel value={variant.inheritance} /></td>
                                <td className="py-2 pr-4 text-right tabular-nums text-stone-600">{formatFrequency(variant.gnomadAf)}</td>
                                <td className="py-2 text-right tabular-nums text-stone-600">{formatScore(variant.revel)}</td>
                            </tr>
                            { isOpen && (
                                <tr className="bg-stone-50">
                                    <td />
                                    <td colSpan={6} className="pb-4 pr-4 pt-1">
                                        <VariantDetails variant={variant} />
                                    </td>
                                </tr>
                            ) }
                        </Fragment>
                    )
                }) }
            </tbody>
        </table>
    )
}

function FilterButton({ active, onClick, label, count }: { active: boolean, onClick: () => void, label: string, count: number }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-full border px-3 py-1 text-sm cursor-pointer ${active
                ? 'border-slate-300 bg-slate-200 font-semibold text-slate-800'
                : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
            }`}
        >
            {label} <span className="tabular-nums text-stone-400">{count}</span>
        </button>
    )
}

function describeParents(father?: string, mother?: string): string {
    if (father && mother) return `parents ${father} and ${mother}`
    if (father) return `father ${father}; no sample from the mother`
    if (mother) return `mother ${mother}; no sample from the father`
    return 'no samples from the parents'
}

function Report({ report }: { report: TrioReport }) {
    const { candidates } = report
    const totalVariants  = useVariantCount(report.trio.child)
    const bothParentGenes = genesWithHitsFromBothParents(candidates)

    const subsets: Record<Filter, CandidateVariant[]> = {
        all         : candidates,
        pathogenic  : candidates.filter(v => v.classification === 'Pathogenic' || v.classification === 'Likely_pathogenic'),
        bothParents : candidates.filter(v => bothParentGenes.has(v.gene)),
        notInParents: candidates.filter(v => v.inheritance === 'neither'),
    }

    // Decided once: the report is complete by the time this mounts, and a
    // selection the reader makes afterwards is theirs to keep.
    const [filter, setFilter] = useState<Filter>(
        () => (FILTERS.find(({ filter }) => subsets[filter].length) ?? FILTERS[0]).filter
    )

    const received = new Date(report.sample.receivedtime + 'T00:00:00').toLocaleDateString(undefined, { dateStyle: 'medium' })

    return (
        <>
            <div className="mb-4">
                <h2 className="text-lg font-semibold text-stone-900">Germline variants</h2>
                <p className="text-xs text-stone-400">
                    Sample {report.trio.child} · {report.genomeBuild ?? 'unknown build'} · received {received}
                    {' '}· {describeParents(report.trio.father, report.trio.mother)}
                </p>
            </div>

            <p className="mb-3 text-sm leading-relaxed text-stone-600">
                { totalVariants === undefined
                    ? <>{candidates.length} variants are candidates:</>
                    : <>Of {totalVariants.toLocaleString()} variants called, {candidates.length} are candidates:</>
                } classified pathogenic or likely pathogenic, or of uncertain significance
                and rare (gnomAD frequency under 1%). Select a variant for its annotations.
            </p>

            <div className="mb-4 flex flex-wrap gap-2">
                { FILTERS.map(({ filter: f, label }) => (
                    <FilterButton key={f} active={filter === f} onClick={() => setFilter(f)} label={label} count={subsets[f].length} />
                )) }
            </div>

            <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white px-4 py-2">
                <VariantTable variants={subsets[filter]} bothParentGenes={bothParentGenes} />
            </div>
        </>
    )
}

function PatientReport({ patientId, onRetry }: { patientId: string, onRetry: () => void }) {
    const state = usePatientReport(patientId)

    if (state.status === 'loading') return <Loading />

    if (state.status === 'none') return <EmptyState message="No genomic data for this patient." />

    if (state.status === 'error') {
        return (
            <div className="flex flex-col items-start gap-3">
                <ErrorMessage message={state.error.message} />
                <button
                    type="button"
                    onClick={onRetry}
                    className="rounded bg-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 border border-slate-300 hover:border-slate-400 cursor-pointer"
                >
                    Try again
                </button>
            </div>
        )
    }

    return <Report report={state.report} />
}

export function GenomicsPage() {
    const { id } = useParams<{ id: string }>()

    // Bumped to retry: remounting the report starts it over with fresh state,
    // and a failed report is not kept, so it is queried again.
    const [attempt, setAttempt] = useState(0)

    if (!id) return null

    return (
        <div className="pt-6">
            <div className="mx-auto max-w-5xl">
                {/* Keyed by patient too, so moving to another patient starts
                    from a fresh loading state rather than the last one's report. */}
                <PatientReport key={`${id}:${attempt}`} patientId={id} onRetry={() => setAttempt(n => n + 1)} />
            </div>
        </div>
    )
}
