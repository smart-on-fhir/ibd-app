import {
    countVariants, getSample, runQuery,
    type AnnotationRow, type GenomicsQuery, type SampleRecord, type VariantRow
} from '../api/genomics'


/** A child's sample, and their parents'. */
export interface Trio {
    child : string
    father: string
    mother: string
}

/** Which parents carry the child's variant. */
export type Inheritance = 'father' | 'mother' | 'both' | 'neither'

export interface AcmgCriterion {
    /** Like `PM2_Supporting`: P for pathogenic evidence, B for benign. */
    code    : string
    strength: string
}

export interface CandidateVariant {
    vrsId       : string
    gene        : string
    chrom       : string
    position    : number
    ref         : string
    alt         : string
    zygosity    : 'heterozygous' | 'homozygous'
    inheritance : Inheritance

    /** The pipeline's ACMG classification, like `Likely_pathogenic`. */
    classification: string
    acmg          : AcmgCriterion[]
    clinvar?      : string
    clinvarReview?: string

    hgvsc?      : string
    hgvsp?      : string
    consequence?: string
    impact?     : string
    transcript? : string

    /** Population allele frequency. Absent when gnomAD has never seen it. */
    gnomadAf?        : number
    revel?           : number
    alphaMissense?   : number
    cadd?            : number
    spliceAi?        : number

    omim?       : string
    ibdCategory?: string
    ibdEvidence?: string
}

export interface TrioReport {
    trio       : Trio
    sample     : SampleRecord
    genomeBuild: string | undefined

    candidates : CandidateVariant[]
}

/**
 * Pathogenic and likely pathogenic at any frequency, and uncertain only when
 * rare. Frequency is filtered separately because a variant gnomAD has never
 * seen has no frequency, so a frequency filter drops it, and those are among
 * the ones that matter most.
 */
const CANDIDATE_QUERIES: GenomicsQuery[] = [
    { pathogenicity: ['Pathogenic', 'Likely_pathogenic'] },
    { pathogenicity: ['VUS'], frequency: { operator: '<', value: 0.01 } }
]

/** Most to least severe. Anything else sorts after these. */
const CLASSIFICATION_ORDER = ['Pathogenic', 'Likely_pathogenic', 'VUS', 'Likely_benign', 'Benign']

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

function inheritanceOf(vrsId: string, fromFather: Set<string>, fromMother: Set<string>): Inheritance {
    const father = fromFather.has(vrsId)
    const mother = fromMother.has(vrsId)
    return father && mother ? 'both' : father ? 'father' : mother ? 'mother' : 'neither'
}

function byClassificationThenGene(a: CandidateVariant, b: CandidateVariant): number {
    const rank = (v: CandidateVariant) => {
        const index = CLASSIFICATION_ORDER.indexOf(v.classification)
        return index === -1 ? CLASSIFICATION_ORDER.length : index
    }
    return rank(a) - rank(b) || a.gene.localeCompare(b.gene) || a.position - b.position
}

/**
 * The child's candidate variants, annotated and traced to the parents.
 *
 * Two rounds of queries, each run in parallel: the first finds the candidates,
 * and the second needs their ids to annotate them and look them up in each
 * parent. Every query is a job taking from a few seconds to about half a
 * minute, and they slow each other down, so the report takes about a minute.
 */
async function buildTrioReport(trio: Trio): Promise<TrioReport> {
    const [sample, ...found] = await Promise.all([
        getSample(trio.child),
        ...CANDIDATE_QUERIES.map(query => runQuery<VariantRow>('query/variant', { ...query, sample_ids: [trio.child] }))
    ])

    const variants = new Map(found.flat().map(row => [row.vrs_id, row]))
    const ids      = [...variants.keys()]

    if (!ids.length) {
        return { trio, sample, genomeBuild: genomeBuildOf(sample), candidates: [] }
    }

    const [annotationRows, fatherRows, motherRows, homozygousRows] = await Promise.all([
        // Every annotation of every candidate: the API returns nothing when
        // variant ids and annotation keys are filtered on together.
        runQuery<AnnotationRow>('query/annotation', { vrs_ids: ids }, 200_000),
        runQuery<VariantRow>('query/variant', { vrs_ids: ids, sample_ids: [trio.father] }),
        runQuery<VariantRow>('query/variant', { vrs_ids: ids, sample_ids: [trio.mother] }),
        runQuery<VariantRow>('query/variant', { vrs_ids: ids, sample_ids: [trio.child], genotypes: ['1/1'] })
    ])

    const annotations = new Map<string, Map<string, AnnotationRow>>()
    for (const row of annotationRows) {
        if (!annotations.has(row.vrs_id)) annotations.set(row.vrs_id, new Map())
        annotations.get(row.vrs_id)!.set(row.key, row)
    }

    const fromFather = new Set(fatherRows.map(row => row.vrs_id))
    const fromMother = new Set(motherRows.map(row => row.vrs_id))
    const homozygous = new Set(homozygousRows.map(row => row.vrs_id))

    const candidates = ids.map((id): CandidateVariant => {
        const row = variants.get(id)!
        const ann = annotations.get(id) ?? new Map<string, AnnotationRow>()
        const text = (key: string) => textOf(ann.get(key))
        const num  = (key: string) => numberOf(ann.get(key))

        return {
            vrsId         : id,
            gene          : row.gene,
            chrom         : row.chrom,
            position      : row.start,
            ref           : row.ref,
            alt           : row.alleles.replace(/^\[|\]$/g, ''),
            zygosity      : homozygous.has(id) ? 'homozygous' : 'heterozygous',
            inheritance   : inheritanceOf(id, fromFather, fromMother),
            classification: text('IHL_CLASS') ?? 'Unclassified',
            acmg          : parseAcmg(text('IHL_ACMG')),
            clinvar       : text('IHL_CLNSIG'),
            clinvarReview : text('IHL_CLNREVIEW'),
            hgvsc         : text('IHL_HGVSC'),
            hgvsp         : text('IHL_HGVSP'),
            consequence   : text('IHL_CSQ'),
            impact        : text('IHL_ANN__impact'),
            transcript    : text('IHL_ANN__mane_select_transcript_id'),
            gnomadAf      : num('IHL_GNOMAD_AF'),
            revel         : num('IHL_REVEL'),
            alphaMissense : num('IHL_AM'),
            cadd          : num('IHL_CADD'),
            spliceAi      : num('IHL_SPLICEAI'),
            omim          : text('IHL_ANN__omim_phenotypes'),
            ibdCategory   : text('IHL_ANN__ibd_taxonomy_bucket'),
            ibdEvidence   : text('IHL_ANN__ibd_taxonomy_evidence_tier')
        }
    })

    return {
        trio,
        sample,
        genomeBuild: genomeBuildOf(sample),
        candidates: candidates.sort(byClassificationThenGene)
    }
}

/**
 * Reports already built or under way, so returning to the page is instant and
 * two views of one trio share the queries. A failed report is dropped, so the
 * next visit tries again.
 */
const reports = new Map<string, Promise<TrioReport>>()

export function loadTrioReport(trio: Trio): Promise<TrioReport> {
    const key = `${trio.child}|${trio.father}|${trio.mother}`
    let report = reports.get(key)
    if (!report) {
        report = buildTrioReport(trio)
        report.catch(() => reports.delete(key))
        reports.set(key, report)
    }
    return report
}

const variantCounts = new Map<string, Promise<number>>()

/**
 * How many variants were called in a sample, before any filtering. Kept out of
 * the report: it is only context, and a count can be the slowest query of all.
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

/**
 * Genes where the child has two or more variants, at least one from each
 * parent: the pattern of a recessive condition, where each parent passes on
 * one damaging copy. Whether two variants are on different copies of the gene
 * can only be inferred from the parents, so this is a candidate list, not a
 * finding.
 */
export function genesWithHitsFromBothParents(candidates: CandidateVariant[]): Set<string> {
    const byGene = new Map<string, Set<Inheritance>>()
    for (const variant of candidates) {
        if (!byGene.has(variant.gene)) byGene.set(variant.gene, new Set())
        byGene.get(variant.gene)!.add(variant.inheritance)
    }

    const genes = new Set<string>()
    for (const [gene, sources] of byGene) {
        const father = sources.has('father') || sources.has('both')
        const mother = sources.has('mother') || sources.has('both')
        const count  = candidates.filter(v => v.gene === gene).length
        if (father && mother && count > 1) genes.add(gene)
    }
    return genes
}
