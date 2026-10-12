/**
 * Germline variant review for the selected patient, read alongside their
 * parents' samples. Four independent views, after the clinical design brief:
 * what ClinVar says, rare damaging variants in known IBD genes, possible de
 * novo variants, and recessive configurations. One variant can be in several.
 *
 * Everything shown is limited by what the genomics API returns: it lists the
 * samples that carry a variant but no reference calls and no call quality, so
 * nothing here can be confirmed as de novo, and parental "absence" is shown as
 * "not reported", not as a reference call.
 */

import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { useParams }    from 'react-router'
import { ChevronDown, ChevronRight, ExternalLink, Info } from 'lucide-react'
import { Spinner }      from '../components/ui/Spinner'
import { ErrorMessage } from '../components/ui/ErrorMessage'
import { EmptyState }   from '../components/ui/EmptyState'
import {
    POLICY, clinvarCategory, clinvarStars, isPipelinePathogenic, loadVariantCount,
    loadVariantReview, parentalOrigin, reviewReason,
    type ClinVarCategory, type CompoundConfiguration, type HomozygousConfiguration,
    type ParentCall, type ReviewVariant, type VariantReview
} from '../lib/variantReview'


type View = 'clinvar' | 'ibd' | 'denovo' | 'recessive' | 'all'

const VIEW_LABEL: Record<View, string> = {
    clinvar  : 'ClinVar variants',
    ibd      : 'Known IBD genes',
    denovo   : 'Candidate de novo',
    recessive: 'Recessive candidates',
    all      : 'All reviewed variants',
}

/** The four review views, in the order they are offered. */
const REVIEW_VIEWS: View[] = ['clinvar', 'ibd', 'denovo', 'recessive']

/** Short names for the "also appears in" badges. */
const VIEW_BADGE: Partial<Record<View, string>> = {
    clinvar  : 'ClinVar',
    ibd      : 'IBD genes',
    denovo   : 'De novo?',
    recessive: 'Recessive',
}

const CLINVAR_FILTERS: { filter: ClinVarCategory | 'all', label: string }[] = [
    { filter: 'plp'        , label: 'Pathogenic / likely pathogenic' },
    { filter: 'vus'        , label: 'Uncertain significance'         },
    { filter: 'conflicting', label: 'Conflicting'                    },
    { filter: 'benign'     , label: 'Benign / likely benign'         },
    { filter: 'other'      , label: 'Other'                          },
    { filter: 'all'        , label: 'All'                            },
]

const CLINVAR_STYLE: Record<ClinVarCategory, string> = {
    plp        : 'bg-red-100 text-red-800 ring-red-300',
    vus        : 'bg-amber-50 text-amber-800 ring-amber-200',
    conflicting: 'bg-violet-50 text-violet-800 ring-violet-200',
    benign     : 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    other      : 'bg-stone-100 text-stone-700 ring-stone-200',
}

// =============================================================================
// Formatting
// =============================================================================

/** `Likely_pathogenic` as `Likely pathogenic`. */
function humanize(value: string): string {
    return value.replace(/_/g, ' ').replace(/&/g, ', ').replace(/,\s*,/g, ',')
}

/** HGVS without its transcript: `ENSP00000269228.4:p.Cys914Arg` as `p.Cys914Arg`. */
function shortHgvs(hgvs: string | undefined): string | undefined {
    return hgvs?.split(':').pop()
}

/** The pipeline's class, which it writes in inconsistent case, made readable. */
function pipelineLabel(raw: string | undefined): string {
    if (!raw) return 'Unavailable'
    if (raw.toUpperCase() === 'NA') return 'Not classified'
    if (raw.toUpperCase() === 'VUS') return 'VUS'
    const text = humanize(raw).toLowerCase()
    return text.charAt(0).toUpperCase() + text.slice(1)
}

function formatFrequency(af: number | undefined): string {
    if (af === undefined) return 'Unknown'
    if (af === 0) return '0'
    return af < 0.001 ? af.toExponential(1) : af.toFixed(4)
}

function formatScore(score: number | undefined, digits = 2): string {
    return score === undefined ? '–' : score.toFixed(digits)
}

function variantName(variant: ReviewVariant): string {
    return shortHgvs(variant.hgvsp) ?? shortHgvs(variant.hgvsc) ?? `${variant.ref}>${variant.alt}`
}

// =============================================================================
// Data
// =============================================================================

type ReviewState =
    | { status: 'loading' }
    | { status: 'ready', review: VariantReview }
    | { status: 'none' }
    | { status: 'error', error: Error }

function useVariantReview(patientId: string): ReviewState {
    const [state, setState] = useState<ReviewState>({ status: 'loading' })

    useEffect(() => {
        let cancelled = false
        loadVariantReview(patientId)
            .then(review => { if (!cancelled) setState(review ? { status: 'ready', review } : { status: 'none' }) })
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

/** Which views each variant is in, for the "also appears in" badges. */
function viewMemberships(review: VariantReview): Map<string, Set<View>> {
    const memberships = new Map<string, Set<View>>()
    const add = (variant: ReviewVariant, view: View) => {
        if (!memberships.has(variant.vrsId)) memberships.set(variant.vrsId, new Set())
        memberships.get(variant.vrsId)!.add(view)
    }
    review.clinvar.forEach(v => add(v, 'clinvar'))
    review.ibdGenes.forEach(v => add(v, 'ibd'))
    review.unresolvedDeNovo.forEach(v => add(v, 'denovo'))
    for (const c of review.recessive) {
        (c.kind === 'homozygous' ? [c.variant] : c.variants).forEach(v => add(v, 'recessive'))
    }
    return memberships
}

// =============================================================================
// Small components
// =============================================================================

function Loading() {
    const seconds = useElapsedSeconds(true)
    return (
        <div className="flex flex-col items-center gap-2 py-16 text-sm text-stone-500">
            <Spinner />
            {/* A minute or two when the API is warm, measured. After it has
                been idle, one query alone has taken three and a half minutes. */}
            { seconds < 120
                ? <p>Running genomic queries. This usually takes a minute or two.</p>
                : <p>Still running. The genomics service can take a few minutes when it has been idle.</p>
            }
            <p className="text-xs text-stone-400 tabular-nums">{seconds}s</p>
        </div>
    )
}

function Badge({ className, tooltip, wrap = false, children }: { className: string, tooltip?: string, wrap?: boolean, children: ReactNode }) {
    return (
        <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ring-1 ${wrap ? '' : 'whitespace-nowrap'} ${className}`} data-tooltip={tooltip}>
            {children}
        </span>
    )
}

function Stars({ count }: { count: number }) {
    return (
        <span className="text-amber-500 tracking-tight" aria-label={`${count} of 4 review stars`}>
            {'★'.repeat(count)}<span className="text-stone-300">{'★'.repeat(4 - count)}</span>
        </span>
    )
}

/** ClinVar's word on a variant, with "no match" and "unavailable" kept apart. */
function ClinVarCell({ variant, detailed = false }: { variant: ReviewVariant, detailed?: boolean }) {
    const { clinvar } = variant
    if (clinvar.status === 'unavailable') {
        return <span className="text-stone-400" data-tooltip="No annotations came back for this variant, so its ClinVar status is unknown">Unavailable</span>
    }
    if (clinvar.status === 'no-match') {
        return <span className="text-stone-400" data-tooltip={`Not found in ClinVar snapshot ${clinvar.snapshot}`}>No ClinVar match</span>
    }
    return (
        <div>
            <Badge className={CLINVAR_STYLE[clinvarCategory(clinvar.significance)]}>{humanize(clinvar.significance!)}</Badge>
            <div className="mt-0.5 text-xs text-stone-500">
                <Stars count={clinvarStars(clinvar.reviewStatus)} />
                { detailed && clinvar.reviewStatus && <span className="ml-1">{humanize(clinvar.reviewStatus)}</span> }
            </div>
        </div>
    )
}

function PipelineBadge({ variant }: { variant: ReviewVariant }) {
    const c = variant.pipelineClass?.toLowerCase()
    const style = isPipelinePathogenic(variant)
        ? (c === 'pathogenic' ? 'bg-red-100 text-red-800 ring-red-300' : 'bg-orange-100 text-orange-800 ring-orange-300')
        : c === 'vus' ? 'bg-amber-50 text-amber-800 ring-amber-200'
        : c?.includes('benign') ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
        : 'bg-stone-50 text-stone-500 ring-stone-200'
    return <Badge className={style} tooltip="Local pipeline classification, separate from ClinVar">{pipelineLabel(variant.pipelineClass)}</Badge>
}

/** A parent's call. "Not reported" is not a reference call: see ParentCall. */
function ParentGenotype({ call }: { call: ParentCall }) {
    if (call === 'not-reported') {
        return <span className="text-stone-400" data-tooltip="Not reported as a carrier. The API gives no reference calls, so this is not a confirmed 0/0">—</span>
    }
    if (call === 'no-sample') {
        return <span className="text-stone-400" data-tooltip="No sample from this parent">n/a</span>
    }
    return <span>{call}</span>
}

function TrioGenotypes({ variant }: { variant: ReviewVariant }) {
    return (
        <span className="font-mono text-xs whitespace-nowrap">
            {variant.child} · <ParentGenotype call={variant.father} /> · <ParentGenotype call={variant.mother} />
        </span>
    )
}

function Origin({ variant }: { variant: ReviewVariant }) {
    if (variant.father === 'no-sample' || variant.mother === 'no-sample') {
        return <span className="text-stone-400" data-tooltip="A parent's sample is missing">Unresolved</span>
    }
    const origin = parentalOrigin(variant)
    if (origin === 'neither') return <span className="text-stone-400">Not reported in parents</span>
    return <span>{ { father: 'Paternal', mother: 'Maternal', both: 'Both parents carry' }[origin] }</span>
}

function AlsoIn({ views, current }: { views: Set<View> | undefined, current: View }) {
    const others = [...(views ?? [])].filter(v => v !== current && VIEW_BADGE[v])
    if (!others.length) return null
    return (
        <div className="flex flex-wrap gap-1">
            { others.map(v => (
                <span key={v} className="rounded bg-stone-100 px-1 py-0.5 text-[0.65rem] text-stone-600">{VIEW_BADGE[v]}</span>
            )) }
        </div>
    )
}

function GeneVariant({ variant }: { variant: ReviewVariant }) {
    return (
        <div>
            <span className="font-semibold text-stone-900">{variant.gene}</span>
            <div className="text-stone-700">{variantName(variant)}</div>
            <div className="text-xs text-stone-400">{variant.consequence ? humanize(variant.consequence) : ''}</div>
        </div>
    )
}

function Detail({ label, children }: { label: string, children: ReactNode }) {
    return (
        <div>
            <dt className="text-xs uppercase tracking-wider text-stone-400">{label}</dt>
            <dd className="mt-0.5 text-stone-700">{children}</dd>
        </div>
    )
}

function AcmgCriteria({ criteria }: { criteria: ReviewVariant['acmg'] }) {
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

function VariantDetails({ variant }: { variant: ReviewVariant }) {
    if (!variant.annotated) {
        return <p className="text-stone-500">No annotations are available for this variant: its classification, frequency and predictions are unknown, not negative.</p>
    }
    const { clinvar } = variant
    return (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Position">
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
            <Detail label="ClinVar (external)">
                <ClinVarCell variant={variant} detailed />
                { clinvar.alleleId !== undefined && (
                    <a
                        className="mt-1 inline-flex items-center gap-1 text-xs text-sky-700 hover:underline"
                        href={`https://www.ncbi.nlm.nih.gov/clinvar/?term=${clinvar.alleleId}%5Balleleid%5D`}
                        target="_blank" rel="noreferrer"
                    >
                        Allele {clinvar.alleleId} <ExternalLink className="h-3 w-3" />
                    </a>
                ) }
                { clinvar.snapshot && <div className="text-xs text-stone-400">Snapshot {clinvar.snapshot}</div> }
            </Detail>
            <Detail label="Pipeline (local)">
                <PipelineBadge variant={variant} />
                <div className="mt-1"><AcmgCriteria criteria={variant.acmg} /></div>
            </Detail>
            <Detail label="Population frequency">
                <span className="tabular-nums">{formatFrequency(variant.gnomadAf)}</span>
                <span className="text-stone-400"> · gnomAD {variant.gnomadRelease ?? 'release unknown'}</span>
                { variant.gnomadAf === undefined && <div className="text-xs text-stone-400">No frequency recorded: unknown, not zero</div> }
            </Detail>
            <Detail label="Predictions">
                <span className="tabular-nums">
                    REVEL {formatScore(variant.revel)} · AlphaMissense {formatScore(variant.alphaMissense)}
                    {' '}· CADD {formatScore(variant.cadd, 1)} · SpliceAI {formatScore(variant.spliceAi)}
                </span>
            </Detail>
            <Detail label="IBD gene evidence">
                {variant.ibdCategory ?? 'Not an IBD gene'}
                { variant.ibdEvidence && <div className="text-xs text-stone-500">{variant.ibdEvidence}</div> }
                { variant.gencc && <div className="text-xs text-stone-500">GenCC: {variant.gencc.replace(/;/g, ', ')}</div> }
            </Detail>
            <Detail label="Trio genotypes (child · father · mother)">
                <TrioGenotypes variant={variant} />
                <div className="text-xs text-stone-400">Call quality (depth, genotype quality) not available from the API</div>
            </Detail>
            { variant.omim && (
                <div className="sm:col-span-2 lg:col-span-3">
                    <Detail label="OMIM phenotypes (gene level)">
                        <ul className="list-disc pl-4">
                            { variant.omim.split(';').map(p => p.trim()).filter(Boolean).map(p => <li key={p}>{p}</li>) }
                        </ul>
                    </Detail>
                </div>
            ) }
        </dl>
    )
}

interface Column {
    header: string
    cell  : (variant: ReviewVariant) => ReactNode
    align?: 'right'
}

/** Variants as expandable rows, with "also appears in" badges at the end. */
function VariantTable({ variants, columns, memberships, current, empty }: {
    variants   : ReviewVariant[]
    columns    : Column[]
    memberships: Map<string, Set<View>>
    current    : View
    empty      : string
}) {
    const [open, setOpen] = useState<string | null>(null)

    if (!variants.length) return <EmptyState message={empty} />

    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-stone-400">
                    <tr>
                        <th className="w-6" />
                        { columns.map(c => <th key={c.header} className={`py-1 pr-4 font-medium ${c.align === 'right' ? 'text-right' : ''}`}>{c.header}</th>) }
                        <th className="py-1 font-medium">Also in</th>
                    </tr>
                </thead>
                <tbody>
                    { variants.map(variant => {
                        const isOpen = open === variant.vrsId
                        return (
                            <Fragment key={variant.vrsId}>
                                <tr
                                    className={`cursor-pointer border-t border-stone-100 align-top hover:bg-stone-50 ${isOpen ? 'bg-stone-50' : ''}`}
                                    onClick={() => setOpen(isOpen ? null : variant.vrsId)}
                                    aria-expanded={isOpen}
                                >
                                    <td className="py-2 text-stone-400">
                                        { isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" /> }
                                    </td>
                                    { columns.map(c => (
                                        <td key={c.header} className={`py-2 pr-4 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>{c.cell(variant)}</td>
                                    )) }
                                    <td className="py-2"><AlsoIn views={memberships.get(variant.vrsId)} current={current} /></td>
                                </tr>
                                { isOpen && (
                                    <tr className="bg-stone-50">
                                        <td />
                                        <td colSpan={columns.length + 1} className="pb-4 pr-4 pt-1">
                                            <VariantDetails variant={variant} />
                                        </td>
                                    </tr>
                                ) }
                            </Fragment>
                        )
                    }) }
                </tbody>
            </table>
        </div>
    )
}

function Chip({ active, onClick, label, count }: { active: boolean, onClick: () => void, label: string, count: number }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-full border px-3 py-1 text-xs cursor-pointer ${active
                ? 'border-slate-300 bg-slate-200 font-semibold text-slate-800'
                : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
            }`}
        >
            {label} <span className="tabular-nums text-stone-400">{count}</span>
        </button>
    )
}

function Panel({ title, subtitle, aside, children }: { title: string, subtitle: ReactNode, aside?: ReactNode, children: ReactNode }) {
    return (
        <section className="rounded-lg border border-stone-200 bg-white px-4 py-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h3 className="font-semibold text-stone-900">{title}</h3>
                    <p className="text-xs text-stone-500">{subtitle}</p>
                </div>
                {aside}
            </div>
            {children}
        </section>
    )
}

function Note({ children }: { children: ReactNode }) {
    return (
        <div className="mt-3 flex items-start gap-2 rounded-md border-l-4 border-sky-300 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>{children}</div>
        </div>
    )
}

// =============================================================================
// Columns
// =============================================================================

const COL = {
    variant  : { header: 'Gene / variant', cell: (v: ReviewVariant) => <GeneVariant variant={v} /> },
    clinvar  : { header: 'ClinVar'       , cell: (v: ReviewVariant) => <ClinVarCell variant={v} /> },
    pipeline : { header: 'Pipeline'      , cell: (v: ReviewVariant) => <PipelineBadge variant={v} /> },
    trio     : { header: 'Child · father · mother', cell: (v: ReviewVariant) => <TrioGenotypes variant={v} /> },
    origin   : { header: 'Inheritance'   , cell: (v: ReviewVariant) => <Origin variant={v} /> },
    frequency: { header: 'gnomAD AF'     , cell: (v: ReviewVariant) => formatFrequency(v.gnomadAf), align: 'right' as const },
    reason   : {
        header: 'Reason for review',
        cell  : (v: ReviewVariant) => {
            const reason = reviewReason(v)
            const detail = reason === 'Missense candidate' ? (v.revel !== undefined ? `REVEL ${v.revel.toFixed(2)}` : 'No REVEL score')
                         : reason === 'Splice candidate' && v.spliceAi !== undefined ? `SpliceAI ${v.spliceAi.toFixed(2)}`
                         : undefined
            return (
                <div>
                    <Badge className="bg-teal-50 text-teal-800 ring-teal-200">{reason}</Badge>
                    { detail && <div className="mt-0.5 text-xs text-stone-500">{detail}</div> }
                </div>
            )
        }
    },
} satisfies Record<string, Column>

// =============================================================================
// Views
// =============================================================================

function ClinVarView({ review, memberships }: { review: VariantReview, memberships: Map<string, Set<View>> }) {
    const inCategory = (filter: ClinVarCategory | 'all') =>
        review.clinvar.filter(v => filter === 'all' || clinvarCategory(v.clinvar.significance) === filter)
    const [filter, setFilter] = useState<ClinVarCategory | 'all'>(() => inCategory('plp').length ? 'plp' : 'all')

    return (
        <Panel
            title="Previously classified in ClinVar"
            subtitle="Membership is decided by the external ClinVar record, not by the local pipeline's label."
        >
            <div className="mb-3 flex flex-wrap gap-2">
                { CLINVAR_FILTERS.map(({ filter: f, label }) => (
                    <Chip key={f} active={filter === f} onClick={() => setFilter(f)} label={label} count={inCategory(f).length} />
                )) }
            </div>
            <VariantTable
                variants={inCategory(filter)}
                columns={[COL.variant, COL.clinvar, COL.pipeline, COL.trio]}
                memberships={memberships}
                current="clinvar"
                empty="No ClinVar records in this category."
            />
            <Note>
                <b>Both interpretations stay visible.</b> ClinVar and the local pipeline can disagree; neither overwrites
                the other. A variant with no ClinVar record is shown as "No ClinVar match" (looked up, not found) or
                "Unavailable" (no annotations returned), never as a negative finding.
            </Note>
        </Panel>
    )
}

function IbdGenesView({ review, memberships }: { review: VariantReview, memberships: Map<string, Set<View>> }) {
    return (
        <Panel
            title="Prioritized variants in known IBD genes"
            subtitle="Functional consequence, rarity and gene–disease evidence, reviewed separately from pathogenicity classification."
        >
            <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
                <Badge wrap className="bg-teal-50 text-teal-800 ring-teal-200">Monogenic IBD gene ({POLICY.ibdCategory})</Badge>
                <Badge wrap className="bg-teal-50 text-teal-800 ring-teal-200">gnomAD AF &lt; {POLICY.maxAlleleFrequency * 100}% or unknown</Badge>
                <Badge wrap className="bg-teal-50 text-teal-800 ring-teal-200">Predicted LoF, splice (SpliceAI ≥ {POLICY.minSpliceAi}) or missense (REVEL ≥ {POLICY.minRevel} or unscored)</Badge>
            </div>
            <VariantTable
                variants={review.ibdGenes}
                columns={[COL.variant, COL.reason, COL.frequency, COL.clinvar, COL.pipeline, COL.origin]}
                memberships={memberships}
                current="ibd"
                empty="No rare protein- or splice-altering variants in known IBD genes."
            />
            <Note>
                <b>Prioritization, not proof.</b> A gene-list match or a high prediction score is a reason to review a
                variant; neither establishes that it causes disease. The thresholds above are placeholders pending
                clinical review.
            </Note>
        </Panel>
    )
}

function DeNovoView({ review, memberships }: { review: VariantReview, memberships: Map<string, Set<View>> }) {
    const { trio, unresolvedDeNovo } = review
    const parentsMissing = !trio.father || !trio.mother

    return (
        <Panel
            title="Present in proband; reference calls in both parents"
            subtitle="A candidate needs the variant in the child and confirmed reference calls, with adequate quality, at the same position in both parents."
            aside={<Badge className="bg-amber-50 text-amber-800 ring-amber-200">0 confirmed candidates</Badge>}
        >
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                { parentsMissing
                    ? <>A parent's sample is not available, so no variant can be assessed as de novo.</>
                    : <>
                        No variant can be confirmed as a de novo candidate with the current data. The genomics API reports
                        only which samples carry a variant: it gives no reference (0/0) calls, no-calls or call quality, so a
                        variant missing from a parent's list could equally be an uncalled or poorly covered position.
                      </>
                }
            </div>
            { !parentsMissing && (
                <>
                    <h4 className="mb-1 text-sm font-semibold text-stone-800">
                        Unresolved: not reported in either parent · excluded from the candidate count
                    </h4>
                    <p className="mb-2 text-xs text-stone-500">
                        Limited to variants reviewed in the other views. Each needs parental reference calls, quality
                        evidence and validation before it could be called de novo.
                    </p>
                    <VariantTable
                        variants={unresolvedDeNovo}
                        columns={[
                            COL.variant,
                            COL.trio,
                            { header: 'Why unresolved', cell: () => <span className="text-xs text-stone-500">Parental reference calls and call quality not available</span> },
                        ]}
                        memberships={memberships}
                        current="denovo"
                        empty="No reviewed variant is missing from both parents."
                    />
                </>
            ) }
        </Panel>
    )
}

function HomozygousCard({ configuration }: { configuration: HomozygousConfiguration }) {
    const { variant, flags } = configuration
    const box = (label: string, call: ReactNode) => (
        <div className="rounded bg-stone-50 px-3 py-2 text-center">
            <div className="text-[0.65rem] uppercase tracking-wider text-stone-400">{label}</div>
            <div className="font-mono text-lg font-semibold text-teal-800">{call}</div>
        </div>
    )
    return (
        <div className="rounded-lg border border-stone-200 p-3">
            <div className="text-[0.65rem] uppercase tracking-wider text-stone-400">Homozygous configuration</div>
            <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-stone-900">{configuration.gene}</span>
                { flags.length
                    ? <Badge className="bg-amber-50 text-amber-800 ring-amber-200">Needs review</Badge>
                    : <Badge className="bg-teal-50 text-teal-800 ring-teal-200">Both parents carry</Badge> }
            </div>
            <div className="mb-2 text-xs text-stone-500">
                {variantName(variant)} · {variant.consequence ? humanize(variant.consequence) : ''} · pipeline {pipelineLabel(variant.pipelineClass)}
            </div>
            <div className="grid grid-cols-3 gap-2">
                {box('Father', <ParentGenotype call={variant.father} />)}
                {box('Mother', <ParentGenotype call={variant.mother} />)}
                {box('Proband', variant.child)}
            </div>
            { flags.length > 0 && (
                <ul className="mt-2 list-disc pl-4 text-xs text-amber-800">
                    { flags.map(f => <li key={f}>{f}</li>) }
                </ul>
            ) }
        </div>
    )
}

function CompoundCard({ configuration }: { configuration: CompoundConfiguration }) {
    return (
        <div className="rounded-lg border border-stone-200 p-3">
            <div className="text-[0.65rem] uppercase tracking-wider text-stone-400">Compound heterozygous configuration</div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-stone-900">{configuration.gene}</span>
                { configuration.phase === 'trio-inferred'
                    ? <Badge className="bg-sky-50 text-sky-800 ring-sky-200" tooltip="One variant from each parent, so on different copies of the gene. Inferred from the trio, not confirmed">In trans · trio-inferred</Badge>
                    : <Badge className="bg-stone-100 text-stone-700 ring-stone-200" tooltip="The parents' calls cannot tell whether these are on the same copy of the gene">Phase unknown</Badge> }
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                    <thead className="uppercase tracking-wider text-stone-400">
                        <tr>
                            <th className="py-1 pr-2 font-medium">Variant</th>
                            <th className="py-1 pr-2 font-medium">ClinVar</th>
                            <th className="py-1 pr-2 font-medium">Pipeline</th>
                            <th className="py-1 pr-2 font-medium">Child</th>
                            <th className="py-1 pr-2 font-medium">Father</th>
                            <th className="py-1 font-medium">Mother</th>
                        </tr>
                    </thead>
                    <tbody>
                        { configuration.variants.map(v => (
                            <tr key={v.vrsId} className="border-t border-stone-100 align-top">
                                <td className="py-1.5 pr-2">
                                    <div className="font-medium text-stone-800">{variantName(v)}</div>
                                    <div className="text-stone-400">{v.consequence ? humanize(v.consequence) : ''}</div>
                                </td>
                                <td className="py-1.5 pr-2"><ClinVarCell variant={v} /></td>
                                <td className="py-1.5 pr-2"><PipelineBadge variant={v} /></td>
                                <td className="py-1.5 pr-2 font-mono">{v.child}</td>
                                <td className="py-1.5 pr-2 font-mono"><ParentGenotype call={v.father} /></td>
                                <td className="py-1.5 font-mono"><ParentGenotype call={v.mother} /></td>
                            </tr>
                        )) }
                    </tbody>
                </table>
            </div>
        </div>
    )
}

/** Trio-inferred pairs and clean homozygous calls first: the best supported. */
function configurationRank(c: HomozygousConfiguration | CompoundConfiguration): number {
    if (c.kind === 'compound') return c.phase === 'trio-inferred' ? 0 : 2
    return c.flags.length ? 3 : 1
}

/** How many of a configuration's variants ClinVar or the pipeline calls pathogenic. */
function pathogenicCount(c: HomozygousConfiguration | CompoundConfiguration): number {
    const variants = c.kind === 'homozygous' ? [c.variant] : c.variants
    return variants.filter(v => isPipelinePathogenic(v) || clinvarCategory(v.clinvar.significance) === 'plp').length
}

function RecessiveView({ review }: { review: VariantReview }) {
    const { recessive } = review
    const genes    = new Set(recessive.map(c => c.gene)).size
    const variants = new Set(recessive.flatMap(c => c.kind === 'homozygous' ? [c.variant.vrsId] : c.variants.map(v => v.vrsId))).size
    const ordered  = [...recessive].sort((a, b) =>
        pathogenicCount(b) - pathogenicCount(a) || configurationRank(a) - configurationRank(b) || a.gene.localeCompare(b.gene))

    return (
        <Panel
            title="Recessive candidates"
            subtitle={<>{genes} {genes === 1 ? 'gene' : 'genes'} · {recessive.length} candidate {recessive.length === 1 ? 'configuration' : 'configurations'} · {variants} unique {variants === 1 ? 'variant' : 'variants'}. Centered on the child's genotype; the parents explain transmission.</>}
        >
            { recessive.length === 0
                ? <EmptyState message="No homozygous or compound heterozygous configurations in known IBD genes." />
                : (
                    // One column that may shrink below its content, so a wide pair
                    // table scrolls inside its card instead of widening the page.
                    <div className="grid grid-cols-1 gap-3">
                        { ordered.map(c => c.kind === 'homozygous'
                            ? <HomozygousCard key={c.variant.vrsId} configuration={c} />
                            : <CompoundCard key={c.gene} configuration={c} />) }
                    </div>
                ) }
            <Note>
                <b>Pairing alone does not establish disease.</b> Both homozygous calls and pairs are made of qualifying
                variants: listed under Known IBD genes, or classified pathogenic or likely pathogenic by ClinVar or the
                pipeline. Pairs inherited from a single parent are on the same copy of the gene and are left out.
                Call quality is not available from the API.
            </Note>
        </Panel>
    )
}

function AllVariantsView({ review, memberships }: { review: VariantReview, memberships: Map<string, Set<View>> }) {
    type Filter = 'plp' | 'vus' | 'other' | 'all'
    const match = (v: ReviewVariant, f: Filter) =>
        f === 'all' ? true
        : f === 'plp' ? isPipelinePathogenic(v)
        : f === 'vus' ? v.pipelineClass?.toUpperCase() === 'VUS'
        : !isPipelinePathogenic(v) && v.pipelineClass?.toUpperCase() !== 'VUS'
    const [filter, setFilter] = useState<Filter>('all')
    const filters: { filter: Filter, label: string }[] = [
        { filter: 'all'  , label: 'All' },
        { filter: 'plp'  , label: 'Pipeline pathogenic / likely pathogenic' },
        { filter: 'vus'  , label: 'Pipeline VUS' },
        { filter: 'other', label: 'Other' },
    ]

    return (
        <Panel
            title="All reviewed variants"
            subtitle="Every variant any view drew on, with the local pipeline's classification as an optional filter."
        >
            <div className="mb-3 flex flex-wrap gap-2">
                { filters.map(({ filter: f, label }) => (
                    <Chip key={f} active={filter === f} onClick={() => setFilter(f)} label={label} count={review.variants.filter(v => match(v, f)).length} />
                )) }
            </div>
            <VariantTable
                variants={review.variants.filter(v => match(v, filter))}
                columns={[COL.variant, COL.pipeline, COL.clinvar, COL.frequency, COL.trio]}
                memberships={memberships}
                current="all"
                empty="No variants in this category."
            />
        </Panel>
    )
}

// =============================================================================
// Page
// =============================================================================

function viewCount(review: VariantReview, view: View): string {
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
    switch (view) {
        case 'clinvar'  : return plural(review.clinvar.length, 'variant', 'variants')
        case 'ibd'      : return plural(review.ibdGenes.length, 'variant', 'variants')
        case 'denovo'   : return `0 · ${review.unresolvedDeNovo.length} unresolved`
        case 'recessive': return plural(new Set(review.recessive.map(c => c.gene)).size, 'gene', 'genes')
        case 'all'      : return `${review.variants.length}`
    }
}

/**
 * The first review view with something to show. De novo never qualifies: it
 * has no confirmed candidates, only unresolved ones.
 */
function defaultView(review: VariantReview): View {
    if (review.clinvar.some(v => clinvarCategory(v.clinvar.significance) === 'plp')) return 'clinvar'
    if (review.ibdGenes.length) return 'ibd'
    if (review.recessive.length) return 'recessive'
    return 'clinvar'
}

function Review({ review }: { review: VariantReview }) {
    const [view, setView] = useState<View>(() => defaultView(review))
    const totalVariants   = useVariantCount(review.trio.child)
    const memberships     = viewMemberships(review)
    const received        = new Date(review.sample.receivedtime + 'T00:00:00').toLocaleDateString(undefined, { dateStyle: 'medium' })

    return (
        <>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold text-stone-900">Genomic variant review</h2>
                    <p className="text-xs text-stone-500">
                        Proband {review.trio.child} · Father {review.trio.father ?? 'not sequenced'} · Mother {review.trio.mother ?? 'not sequenced'}
                        {' '}· {review.genomeBuild ?? 'unknown build'} · received {received}
                        { totalVariants !== undefined && <> · {totalVariants.toLocaleString()} variants called</> }
                    </p>
                </div>
                <Badge className="bg-amber-50 text-amber-800 ring-amber-200" tooltip="All genomic data in this demo is synthetic">Synthetic data</Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                { REVIEW_VIEWS.map(v => (
                    <button
                        key={v}
                        type="button"
                        onClick={() => setView(v)}
                        className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm cursor-pointer ${view === v
                            ? 'border-teal-700 bg-teal-700 text-white'
                            : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
                        }`}
                    >
                        <span className="font-semibold">{VIEW_LABEL[v]}</span>
                        <span className={`text-xs whitespace-nowrap ${view === v ? 'text-teal-100' : 'text-stone-400'}`}>{viewCount(review, v)}</span>
                    </button>
                )) }
            </div>
            <div className="mb-4 mt-1.5 flex flex-wrap items-baseline justify-between gap-2 text-xs text-stone-500">
                <span>Independent views of the same proband variants. A variant may appear in more than one; counts are not additive.</span>
                <button
                    type="button"
                    onClick={() => setView('all')}
                    className={`cursor-pointer underline-offset-2 hover:underline ${view === 'all' ? 'font-semibold text-stone-800' : 'text-sky-700'}`}
                >
                    {VIEW_LABEL.all} ({review.variants.length})
                </button>
            </div>

            { view === 'clinvar'   && <ClinVarView     review={review} memberships={memberships} /> }
            { view === 'ibd'       && <IbdGenesView    review={review} memberships={memberships} /> }
            { view === 'denovo'    && <DeNovoView      review={review} memberships={memberships} /> }
            { view === 'recessive' && <RecessiveView   review={review} /> }
            { view === 'all'       && <AllVariantsView review={review} memberships={memberships} /> }
        </>
    )
}

function PatientReview({ patientId, onRetry }: { patientId: string, onRetry: () => void }) {
    const state = useVariantReview(patientId)

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

    return <Review review={state.review} />
}

export function GenomicsPage() {
    const { id } = useParams<{ id: string }>()

    // Bumped to retry: remounting the review starts it over with fresh state,
    // and a failed review is not kept, so it is queried again.
    const [attempt, setAttempt] = useState(0)

    if (!id) return null

    return (
        <div className="pt-6">
            <div className="mx-auto max-w-6xl">
                {/* Keyed by patient too, so moving to another patient starts
                    from a fresh loading state rather than the last one's review. */}
                <PatientReview key={`${id}:${attempt}`} patientId={id} onRetry={() => setAttempt(n => n + 1)} />
            </div>
        </div>
    )
}
