import {
    countVariants, findSamples, patientRefOf, runQuery, sampleIdOf,
    type AnnotationFilter, type AnnotationRow, type GenomicsQuery, type SampleRecord, type VariantRow
} from '../api/genomics'


// =============================================================================
// Model
// =============================================================================

/** A child's sample, and their parents' where the lab has them. */
export interface Trio {
    child  : string
    father?: string
    mother?: string
}

/**
 * A parent's call at the child's variant, as far as the API can tell. It lists
 * the samples that carry a variant and nothing else, so a parent missing from
 * that list is `not-reported` — not a confirmed reference (0/0) call, which
 * could equally be a no-call or a poorly covered locus. `no-sample` when the
 * lab has no sample from that parent at all.
 */
export type ParentCall = '0/1' | '1/1' | 'not-reported' | 'no-sample'

/** Whether ClinVar has this variant, kept apart from "we do not know". */
export type ClinVarStatus =
    /** ClinVar has a record of this variant. */
    | 'matched'
    /** Looked up in a ClinVar snapshot, and not found there. */
    | 'no-match'
    /** No annotations came back for the variant, so nothing is known. */
    | 'unavailable'

export type ClinVarCategory = 'plp' | 'vus' | 'conflicting' | 'benign' | 'other'

export interface AcmgCriterion {
    /** Like `PM2_Supporting`: P for pathogenic evidence, B for benign. */
    code    : string
    strength: string
}

/** Why a variant in a known IBD gene is worth a look. */
export type ReviewReason = 'Predicted LoF' | 'Splice candidate' | 'Missense candidate' | 'Other protein-altering'

export interface ReviewVariant {
    vrsId   : string
    gene    : string
    chrom   : string
    position: number
    ref     : string
    alt     : string

    child : '0/1' | '1/1'
    father: ParentCall
    mother: ParentCall

    /** False when the API returned no annotations for this variant at all. */
    annotated: boolean

    /** The local pipeline's ACMG-style call, raw (`Likely_Pathogenic`). */
    pipelineClass?: string
    acmg          : AcmgCriterion[]

    /** ClinVar's assertion: external evidence, never merged with the pipeline's. */
    clinvar: {
        status       : ClinVarStatus
        significance?: string
        reviewStatus?: string
        alleleId?    : number
        snapshot?    : string
    }

    /** gnomAD allele frequency. Undefined means unknown, never zero. */
    gnomadAf?     : number
    gnomadRelease?: string

    hgvsc?      : string
    hgvsp?      : string
    consequence?: string
    impact?     : string
    transcript? : string

    revel?        : number
    alphaMissense?: number
    cadd?         : number
    spliceAi?     : number

    omim?       : string
    /** The gene's IBD role, like `Dx/monogenic` or `Polygenic susceptibility`. */
    ibdCategory?: string
    ibdEvidence?: string
    gencc?      : string
}

export interface HomozygousConfiguration {
    kind   : 'homozygous'
    gene   : string
    variant: ReviewVariant
    /**
     * Why the call needs a closer look, when it does: a parent who does not
     * carry it, or a locus on chrX, where a male's single copy shows as 1/1.
     */
    flags  : string[]
}

export interface CompoundConfiguration {
    kind    : 'compound'
    gene    : string
    variants: ReviewVariant[]
    /**
     * `trio-inferred`: at least one variant came from each parent, so they are
     * on different copies of the gene. `unknown`: the parents cannot tell.
     */
    phase   : 'trio-inferred' | 'unknown'
}

export type RecessiveConfiguration = HomozygousConfiguration | CompoundConfiguration

export interface VariantReview {
    trio       : Trio
    sample     : SampleRecord
    genomeBuild: string | undefined

    /** Every variant any view could show, sorted by gene. */
    variants: ReviewVariant[]

    /** Proband variants with a ClinVar record, whatever its classification. */
    clinvar: ReviewVariant[]

    /** Rare, protein- or splice-altering variants in monogenic IBD genes. */
    ibdGenes: ReviewVariant[]

    /**
     * Variants that could be de novo, but cannot be confirmed: no parent is
     * reported to carry them, and the API gives neither reference calls nor
     * call quality to rule out a missed call. Always unresolved, for now.
     */
    unresolvedDeNovo: ReviewVariant[]

    recessive: RecessiveConfiguration[]
}

// =============================================================================
// Review policy
// =============================================================================

/**
 * Placeholder thresholds for the demo. They are not clinical cutoffs: the
 * gene list, rarity rule and predictor thresholds are for the clinical team.
 */
export const POLICY = {
    /** Rarer than this, or of unknown frequency, counts as rare. */
    maxAlleleFrequency: 0.01,
    /** SpliceAI delta score from which a variant is a splice candidate. */
    minSpliceAi       : 0.2,
    /**
     * REVEL score from which a missense variant qualifies. A missense variant
     * with no score still does, since unknown is not benign.
     */
    minRevel          : 0.5,
    /** The IBD gene role that makes a gene "known IBD". */
    ibdCategory       : 'Dx/monogenic',
} as const

/** Consequences predicted to knock out the gene product. */
const LOSS_OF_FUNCTION = new Set([
    'stop_gained', 'frameshift_variant', 'splice_acceptor_variant', 'splice_donor_variant',
    'start_lost', 'stop_lost', 'transcript_ablation'
])

const SPLICE = /splice/

/**
 * The variant queries, each one a way into some view. Run against the child
 * only; parents are looked up afterwards, for the variants these find.
 */
const VIEW_QUERIES: GenomicsQuery[] = [
    // The pipeline's own pathogenic calls. It writes `Likely_Pathogenic`, and the
    // filter is case-sensitive, so both spellings are asked for.
    { pathogenicity: ['Pathogenic', 'Likely_Pathogenic', 'Likely_pathogenic'] },
    { pathogenicity: ['VUS'], frequency: { operator: '<', value: POLICY.maxAlleleFrequency } },

    // ClinVar records of any classification: the view has filters for them.
    { annotations: [{ type: 'key', key: 'IHL_CLNSIG' }] },

    // Known IBD genes: protein-altering, or splice-altering by prediction.
    { annotations: [ibdGeneFilter(), { type: 'string', key: 'IHL_ANN__impact', value: ['HIGH', 'MODERATE'] }] },
    { annotations: [ibdGeneFilter(), { type: 'numeric', key: 'IHL_SPLICEAI', operator: '>=', value: POLICY.minSpliceAi }] },

    // Homozygous in a known IBD gene, for the recessive view.
    { genotypes: ['1/1'], annotations: [ibdGeneFilter()] },
]

function ibdGeneFilter(): AnnotationFilter {
    return { type: 'string', key: 'IHL_ANN__ibd_taxonomy_bucket', value: [POLICY.ibdCategory] }
}

/**
 * Variant ids per query that names them. Much over a hundred and the query
 * fails outright: 323 did, within seconds.
 */
const IDS_PER_QUERY = 100

// =============================================================================
// Annotation values
// =============================================================================

/**
 * An annotation's text: the list brackets removed and URL-decoded. The API
 * uses `-` and `.` for "no value".
 */
function textOf(row: AnnotationRow | undefined): string | undefined {
    const raw = row?.val_arr_str.replace(/^\[|\]$/g, '').trim()
    if (!raw || raw === '-' || raw === '.') return undefined
    try {
        return decodeURIComponent(raw)
    } catch {
        return raw
    }
}

/** An annotation's number, from whichever of its two values holds it. */
function numberOf(row: AnnotationRow | undefined): number | undefined {
    if (!row) return undefined
    const raw = row.val_arr_num.replace(/^\[|\]$/g, '').split(',')[0]?.trim() || textOf(row)
    const value = raw === undefined ? NaN : Number(raw)
    return Number.isFinite(value) ? value : undefined
}

/** `PM2_Supporting=Supporting;PP3=Very_Strong` into its criteria. */
function parseAcmg(text: string | undefined): AcmgCriterion[] {
    if (!text) return []
    return text.split(';').filter(Boolean).map(part => {
        const [code, strength = ''] = part.split('=')
        return { code, strength }
    })
}

/** The genome build named in a sample's note, like `GRCh38`. */
function genomeBuildOf(sample: SampleRecord): string | undefined {
    return sample.note.match(/build (\S+)/)?.[1]
}

// =============================================================================
// Classification helpers, shared with the page
// =============================================================================

/** A ClinVar significance, like `Benign/Likely_benign`, into a filter group. */
export function clinvarCategory(significance: string | undefined): ClinVarCategory {
    const s = (significance ?? '').toLowerCase()
    if (s.includes('conflicting')) return 'conflicting'
    if (s.startsWith('pathogenic') || s.startsWith('likely_pathogenic')) return 'plp'
    if (s.includes('uncertain')) return 'vus'
    if (s.includes('benign')) return 'benign'
    return 'other'
}

/**
 * ClinVar's review stars, from its review status. They grade the review behind
 * a classification, not the classification itself.
 */
export function clinvarStars(reviewStatus: string | undefined): number {
    const s = (reviewStatus ?? '').toLowerCase()
    if (s.includes('practice_guideline')) return 4
    if (s.includes('expert_panel')) return 3
    if (s.includes('multiple_submitters') && s.includes('no_conflicts')) return 2
    if (s.includes('criteria_provided')) return 1
    return 0
}

/** The pipeline's class, compared without regard to its inconsistent case. */
export function isPipelinePathogenic(variant: ReviewVariant): boolean {
    const c = variant.pipelineClass?.toLowerCase()
    return c === 'pathogenic' || c === 'likely_pathogenic'
}

/** Why a known-IBD-gene variant is worth reviewing, or null when it is not. */
export function reviewReason(variant: ReviewVariant): ReviewReason | null {
    const consequences = (variant.consequence ?? '').split('&')
    if (consequences.some(c => LOSS_OF_FUNCTION.has(c))) return 'Predicted LoF'
    if ((variant.spliceAi ?? 0) >= POLICY.minSpliceAi || consequences.some(c => SPLICE.test(c))) return 'Splice candidate'
    if (consequences.includes('missense_variant')) {
        return variant.revel === undefined || variant.revel >= POLICY.minRevel ? 'Missense candidate' : null
    }
    if (variant.impact === 'HIGH' || variant.impact === 'MODERATE') return 'Other protein-altering'
    return null
}

const REASON_ORDER: ReviewReason[] = ['Predicted LoF', 'Splice candidate', 'Missense candidate', 'Other protein-altering']

/** Strongest reason first, then by the score behind it, then by gene. */
function byReviewPriority(a: ReviewVariant, b: ReviewVariant): number {
    const rank  = (v: ReviewVariant) => REASON_ORDER.indexOf(reviewReason(v)!)
    const score = (v: ReviewVariant) => reviewReason(v) === 'Splice candidate' ? (v.spliceAi ?? 0) : (v.revel ?? 0)
    return rank(a) - rank(b) || score(b) - score(a) || a.gene.localeCompare(b.gene)
}

/** Rare by policy. A variant of unknown frequency counts, so it is not lost. */
export function isRare(variant: ReviewVariant): boolean {
    return variant.gnomadAf === undefined || variant.gnomadAf < POLICY.maxAlleleFrequency
}

/** Which parents the child's variant was reported in. */
export function parentalOrigin(variant: ReviewVariant): 'father' | 'mother' | 'both' | 'neither' {
    const father = variant.father === '0/1' || variant.father === '1/1'
    const mother = variant.mother === '0/1' || variant.mother === '1/1'
    return father && mother ? 'both' : father ? 'father' : mother ? 'mother' : 'neither'
}

// =============================================================================
// Building the review
// =============================================================================

function chunks<T>(items: T[], size: number): T[][] {
    const out: T[][] = []
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
    return out
}

/** Variant rows for the given ids in one sample, in as many queries as it takes. */
async function variantsAmong(ids: string[], query: GenomicsQuery): Promise<VariantRow[]> {
    const pages = await Promise.all(
        chunks(ids, IDS_PER_QUERY).map(batch => runQuery<VariantRow>('query/variant', { ...query, vrs_ids: batch }))
    )
    return pages.flat()
}

async function annotationsOf(ids: string[]): Promise<Map<string, Map<string, AnnotationRow>>> {
    // Every annotation of every variant: the API returns nothing when variant
    // ids and annotation keys are filtered on together.
    const pages = await Promise.all(
        chunks(ids, IDS_PER_QUERY).map(batch => runQuery<AnnotationRow>('query/annotation', { vrs_ids: batch }, 50_000))
    )
    const byVariant = new Map<string, Map<string, AnnotationRow>>()
    for (const row of pages.flat()) {
        if (!byVariant.has(row.vrs_id)) byVariant.set(row.vrs_id, new Map())
        byVariant.get(row.vrs_id)!.set(row.key, row)
    }
    return byVariant
}

/** A parent's calls at the given variants. */
async function parentCalls(sampleId: string | undefined, ids: string[]): Promise<(id: string) => ParentCall> {
    if (!sampleId) return () => 'no-sample'
    const [carriers, homozygous] = await Promise.all([
        variantsAmong(ids, { sample_ids: [sampleId] }),
        runQuery<VariantRow>('query/variant', { sample_ids: [sampleId], genotypes: ['1/1'] })
    ])
    const carried = new Set(carriers.map(row => row.vrs_id))
    const hom     = new Set(homozygous.map(row => row.vrs_id))
    return id => hom.has(id) ? '1/1' : carried.has(id) ? '0/1' : 'not-reported'
}

function toReviewVariant(
    row       : VariantRow,
    ann       : Map<string, AnnotationRow> | undefined,
    childHom  : Set<string>,
    fatherCall: (id: string) => ParentCall,
    motherCall: (id: string) => ParentCall
): ReviewVariant {
    const a    = ann ?? new Map<string, AnnotationRow>()
    const text = (key: string) => textOf(a.get(key))
    const num  = (key: string) => numberOf(a.get(key))

    const significance = text('IHL_CLNSIG')
    const snapshot     = text('IHL_ANN__clinvar_snapshot_date')

    return {
        vrsId    : row.vrs_id,
        gene     : row.gene,
        chrom    : row.chrom,
        position : row.start,
        ref      : row.ref,
        alt      : row.alleles.replace(/^\[|\]$/g, ''),
        child    : childHom.has(row.vrs_id) ? '1/1' : '0/1',
        father   : fatherCall(row.vrs_id),
        mother   : motherCall(row.vrs_id),
        annotated: !!ann,

        pipelineClass: text('IHL_CLASS'),
        acmg         : parseAcmg(text('IHL_ACMG')),

        clinvar: {
            status      : significance ? 'matched' : snapshot ? 'no-match' : 'unavailable',
            significance,
            reviewStatus: text('IHL_CLNREVIEW'),
            alleleId    : num('IHL_ANN__clinvar_alleleid'),
            snapshot,
        },

        gnomadAf     : num('IHL_GNOMAD_AF'),
        gnomadRelease: text('IHL_ANN__gnomad_release'),

        hgvsc      : text('IHL_HGVSC'),
        hgvsp      : text('IHL_HGVSP'),
        consequence: text('IHL_CSQ'),
        impact     : text('IHL_ANN__impact'),
        transcript : text('IHL_ANN__mane_select_transcript_id'),

        revel        : num('IHL_REVEL'),
        alphaMissense: num('IHL_AM'),
        cadd         : num('IHL_CADD'),
        spliceAi     : num('IHL_SPLICEAI'),

        omim       : text('IHL_ANN__omim_phenotypes'),
        ibdCategory: text('IHL_ANN__ibd_taxonomy_bucket'),
        ibdEvidence: text('IHL_ANN__ibd_taxonomy_evidence_tier'),
        gencc      : text('IHL_ANN__gencc_validity_tiers'),
    }
}

function homozygousFlags(variant: ReviewVariant): string[] {
    const flags: string[] = []
    if (variant.chrom === 'chrX' || variant.chrom === 'chrY') {
        flags.push('Sex chromosome: a single copy reads as 1/1, so this needs X-linked review')
    }
    for (const [parent, call] of [['Father', variant.father], ['Mother', variant.mother]] as const) {
        if (call === 'no-sample') flags.push(`${parent}'s sample not available`)
        if (call === 'not-reported') flags.push(`${parent} not reported to carry it`)
        // Each parent of a child with a recessive condition usually carries one
        // copy (0/1). Two copies would usually mean the parent is affected too.
        if (call === '1/1') flags.push(`${parent} is also homozygous (1/1): atypical for an unaffected carrier`)
    }
    return flags
}

/**
 * Recessive configurations: a qualifying homozygous variant in a known IBD
 * gene, or two or more qualifying heterozygous variants in one. Pairs from a single parent
 * are on the same copy of the gene, so they are left out.
 */
function recessiveConfigurations(variants: ReviewVariant[], qualifies: (v: ReviewVariant) => boolean): RecessiveConfiguration[] {
    const configurations: RecessiveConfiguration[] = []

    for (const variant of variants) {
        if (variant.child === '1/1' && variant.ibdCategory === POLICY.ibdCategory && qualifies(variant)) {
            configurations.push({ kind: 'homozygous', gene: variant.gene, variant, flags: homozygousFlags(variant) })
        }
    }

    const byGene = new Map<string, ReviewVariant[]>()
    for (const variant of variants) {
        if (variant.child !== '0/1' || !qualifies(variant)) continue
        if (!byGene.has(variant.gene)) byGene.set(variant.gene, [])
        byGene.get(variant.gene)!.push(variant)
    }

    for (const [gene, hits] of byGene) {
        if (hits.length < 2) continue
        const origins = new Set(hits.map(parentalOrigin))
        const fromBoth = origins.has('father') && origins.has('mother')
        const unknown  = origins.has('neither') || origins.has('both')
        if (fromBoth) {
            configurations.push({ kind: 'compound', gene, variants: hits, phase: 'trio-inferred' })
        } else if (unknown) {
            configurations.push({ kind: 'compound', gene, variants: hits, phase: 'unknown' })
        }
        // Otherwise every hit came from one parent: same copy, not recessive.
    }

    return configurations.sort((a, b) => a.gene.localeCompare(b.gene))
}

/**
 * The child's review. Three rounds of queries: one to find the family, one for
 * the variants each view starts from, and one to annotate those and look them
 * up in each parent. The API runs a few at a time (see runQuery).
 */
async function buildReview(patientId: string): Promise<VariantReview | null> {
    const family = await findTrio(patientId)
    if (!family) return null
    const { trio, sample } = family

    const found = await Promise.all(
        VIEW_QUERIES.map(query => runQuery<VariantRow>('query/variant', { ...query, sample_ids: [trio.child] }))
    )
    const rows = new Map(found.flat().map(row => [row.vrs_id, row]))
    const ids  = [...rows.keys()]

    const [annotations, childHom, fatherCall, motherCall] = await Promise.all([
        annotationsOf(ids),
        runQuery<VariantRow>('query/variant', { sample_ids: [trio.child], genotypes: ['1/1'] })
            .then(hom => new Set(hom.map(row => row.vrs_id))),
        parentCalls(trio.father, ids),
        parentCalls(trio.mother, ids),
    ])

    const variants = ids
        .map(id => toReviewVariant(rows.get(id)!, annotations.get(id), childHom, fatherCall, motherCall))
        .sort((a, b) => a.gene.localeCompare(b.gene) || a.position - b.position)

    const clinvar  = variants.filter(v => v.clinvar.status === 'matched')
    const ibdGenes = variants
        .filter(v => v.ibdCategory === POLICY.ibdCategory && isRare(v) && reviewReason(v) !== null)
        .sort(byReviewPriority)

    // Recessive pairs are built from variants with some reason to suspect
    // them, so that two harmless variants in one gene are not offered as one.
    const inIbdGenes = new Set(ibdGenes.map(v => v.vrsId))
    const qualifies  = (v: ReviewVariant) =>
        inIbdGenes.has(v.vrsId) || isPipelinePathogenic(v) || clinvarCategory(v.clinvar.significance) === 'plp'

    const bothParentsSequenced = !!trio.father && !!trio.mother
    const unresolvedDeNovo = bothParentsSequenced
        ? variants.filter(v => parentalOrigin(v) === 'neither' && (qualifies(v) || v.clinvar.status === 'matched'))
        : []

    return {
        trio,
        sample,
        genomeBuild: genomeBuildOf(sample),
        variants,
        clinvar,
        ibdGenes,
        unresolvedDeNovo,
        recessive: recessiveConfigurations(variants, qualifies),
    }
}

/**
 * A patient's sample and their parents', found in one query by the references
 * they are filed under (see findSamples). Null when the patient has no sample.
 */
async function findTrio(patientId: string): Promise<{ trio: Trio, sample: SampleRecord } | null> {
    const samples = await findSamples([patientId, `${patientId}-F`, `${patientId}-M`])
    const byRef   = new Map(samples.map(sample => [patientRefOf(sample), sample]))
    const child   = byRef.get(patientId)

    if (!child) return null

    const childId = sampleIdOf(child)
    if (!childId) {
        throw new Error(`Genomics API: cannot read the sample id of patient ${patientId}'s sample.`)
    }

    const parent = (suffix: string) => {
        const sample = byRef.get(patientId + suffix)
        return sample && sampleIdOf(sample)
    }

    return { trio: { child: childId, father: parent('-F'), mother: parent('-M') }, sample: child }
}

/**
 * Reviews already built or under way, by patient, so returning to the page is
 * instant. A failed review is dropped, so the next visit tries again.
 */
const reviews = new Map<string, Promise<VariantReview | null>>()

/** A patient's variant review, or null when they have no genomic sample. */
export function loadVariantReview(patientId: string): Promise<VariantReview | null> {
    let review = reviews.get(patientId)
    if (!review) {
        review = buildReview(patientId)
        review.catch(() => reviews.delete(patientId))
        reviews.set(patientId, review)
    }
    return review
}

const variantCounts = new Map<string, Promise<number>>()

/**
 * How many variants were called in a sample, before any filtering. Kept out of
 * the review: it is only context, and a count can be the slowest query of all.
 */
export function loadVariantCount(sampleId: string): Promise<number> {
    let count = variantCounts.get(sampleId)
    if (!count) {
        count = countVariants({ sample_ids: [sampleId] })
        count.catch(() => variantCounts.delete(sampleId))
        variantCounts.set(sampleId, count)
    }
    return count
}
