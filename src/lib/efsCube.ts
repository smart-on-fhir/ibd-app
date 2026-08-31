import cubeCsv from '../api/veo_ibd_efs_cube_rounded.csv?raw'

/**
 * The VEO-IBD event-free-survival cube.
 *
 * A powerset cube: one row per combination of dimension values, for every one
 * of the 2^7 subsets of the dimensions. A blank cell means *aggregated over*,
 * not missing — the row with every cell blank is the whole cohort, and the row
 * with only `gender=female` set is every female patient regardless of anything
 * else.
 *
 * Two properties of this particular export shape everything below:
 *
 * - **Counts are k-rounded**, not exact. The export applies disclosure control
 *   by rounding every cell to a multiple of k rather than by suppressing small
 *   ones — suppression leaks in a cube like this, where a hidden cell can be
 *   recovered by subtracting the marginals around it. Rounding leaves nothing
 *   to difference. The consequence is that totals do not reconcile: the
 *   whole-cohort event/censored table sums to 144 against a stated cohort of
 *   150. Take a stratum's size from its own marginal row rather than by summing
 *   a deeper slice, and never reconstruct a missing cell by subtraction — it
 *   would be wrong under rounding, and it is the attack the rounding exists to
 *   prevent.
 * - **Most cells are zero** (5567 of 8771), and a zero is ambiguous — nobody,
 *   or too few to report? The file does not say. It matters most in the events
 *   column, where a suppressed count silently flattens a curve.
 */

export const DIMENSIONS = [
    'event_free_survival_years',
    'efs_status',
    'age_at_initial_diagnosis_years',
    'firstline_therapy',
    'gender',
    'ibd_subtype',
    'severity'
] as const

export type Dimension = typeof DIMENSIONS[number]

/** Dimensions a caller can group or filter by — everything except the outcome. */
export const STRATIFIERS: Dimension[] = [
    'firstline_therapy',
    'gender',
    'ibd_subtype',
    'severity',
    'age_at_initial_diagnosis_years'
]

/**
 * Follow-up buckets, in order. `>=5` is open-ended: it says a patient reached
 * five years, not when anything happened to them afterwards.
 */
export const TIME_BUCKETS = ['0', '1', '2', '3', '4', '>=5'] as const

/** The last bucket with a known time — where a curve can honestly be drawn to. */
export const CLOSED_BUCKETS = TIME_BUCKETS.slice(0, -1)

export type Slice = Partial<Record<Dimension, string>>

/**
 * Cell totals, keyed by the exact set of dimensions a row fixes.
 *
 * Exactness is the whole point: asking for `{gender: 'female'}` must read the
 * row where gender is the *only* dimension set, not sum every deeper row that
 * happens to mention females — those are the same patients counted many times.
 */
const index = new Map<string, number>()

/**
 * The rounding granularity of this export — the largest k every count is a
 * multiple of, or 1 when the counts are exact.
 *
 * Derived rather than assumed, so swapping in an unrounded cube (or one rounded
 * to a different k) needs no code change and the interface stops claiming a
 * precision the data does not have.
 *
 * It cannot tell k-rounding apart from a uniform multiplier: a join fan-out
 * that counted every patient twice would look identical. Reporting it as
 * granularity is the honest reading of what is observable here.
 */
export let countGranularity = 0

/** Distinct values per dimension, in the order the file presents them. */
const dimensionValues = new Map<Dimension, string[]>(DIMENSIONS.map(d => [d, []]))

function keyOf(slice: Slice): string {
    return DIMENSIONS
        .filter(dimension => slice[dimension])
        .map(dimension => `${dimension}=${slice[dimension]}`)
        .join('&')
}

// Parsed once at module load. The file is a few hundred kilobytes and entirely
// static; re-parsing it per query would be the most expensive thing the page
// does. No quoting to handle — every field is a bare token.
{
    // Split on either line ending. A CSV exported from a Windows toolchain
    // arrives with CRLF, and a trailing \r would ride along on the last field of
    // every row — silently turning `cnt` into an unknown column and every count
    // into NaN.
    const [header, ...lines] = cubeCsv.trim().split(/\r?\n/)
    const columns = header.split(',').map(name => name.trim()) as (Dimension | 'cnt')[]

    for (const line of lines) {
        const fields = line.split(',').map(field => field.trim())
        const slice: Slice = {}
        let count = 0

        columns.forEach((column, i) => {
            const value = fields[i]

            if (column === 'cnt') {
                count = Number(value)
            } else if (value) {
                slice[column] = value

                const seen = dimensionValues.get(column)!
                if (!seen.includes(value)) seen.push(value)
            }
        })

        const key = keyOf(slice)
        index.set(key, (index.get(key) ?? 0) + count)

        // Running gcd over every non-zero cell. Zeros carry no information
        // about granularity — gcd(0, n) is n — so they are skipped.
        if (count > 0) {
            let [a, b] = [countGranularity, count]
            while (b) [a, b] = [b, a % b]
            countGranularity = a
        }
    }

    if (countGranularity === 0) {
        countGranularity = 1
    }
}

/** Patients in exactly this slice, or 0 when the cube has no such cell. */
export function count(slice: Slice): number {
    return index.get(keyOf(slice)) ?? 0
}

/** The values a dimension takes, largest group first. */
export function valuesOf(dimension: Dimension): string[] {
    return [...(dimensionValues.get(dimension) ?? [])]
        .sort((a, b) => count({ [dimension]: b }) - count({ [dimension]: a }))
}

/** `ANTI_TNF` → `Anti-TNF`, `firstline_therapy` → `First-line therapy`. */
export function humanize(token: string): string {
    const special: Record<string, string> = {
        ANTI_TNF          : 'Anti-TNF',
        ANTI_INTEGRIN     : 'Anti-integrin',
        ANTI_INTERLEUKIN  : 'Anti-interleukin',
        JAK_INHIBITOR     : 'JAK inhibitor',
        CORTICOSTEROID    : 'Corticosteroid',
        AMINOSALICYLATE   : 'Aminosalicylate',
        IMMUNOMODULATOR   : 'Immunomodulator',
        firstline_therapy : 'First-line therapy',
        gender            : 'Sex',
        ibd_subtype       : 'IBD subtype',
        severity          : 'Severity',
        age_at_initial_diagnosis_years: 'Age at diagnosis'
    }

    if (special[token]) {
        return special[token]
    }

    const words = token.replace(/_/g, ' ')
    return words.charAt(0).toUpperCase() + words.slice(1)
}

// =============================================================================
// Life-table estimate
// =============================================================================

export interface LifeTableRow {
    /** The follow-up bucket this row covers. */
    bucket: string

    /** Patients under observation at the start of the interval. */
    atRisk: number

    events: number
    censored: number

    /** Survival at the *end* of this interval. */
    survival: number

    /** Greenwood 95% interval, clamped to 0–1. */
    ciLow: number
    ciHigh: number
}

export interface LifeTable {
    rows: LifeTableRow[]

    /** Patients at the start — the sum of every event and censoring in the slice. */
    n: number
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/**
 * Kaplan–Meier in its life-table (actuarial) form.
 *
 * The cube reports counts per year, not per patient, so the product-limit
 * formula cannot be applied directly: within a bucket there is no way to tell
 * whether a censored patient left before or after an event. The actuarial
 * convention credits them half the interval — `atRisk - censored/2` — which is
 * what makes this an estimate of the same quantity rather than a biased
 * approximation of it.
 *
 * The `>=5` bucket is counted in the risk set but contributes no step: it says
 * a patient reached five years, not when their event occurred.
 */
export function lifeTable(slice: Slice = {}): LifeTable {
    const buckets = TIME_BUCKETS.map(bucket => ({
        bucket,
        events  : count({ ...slice, event_free_survival_years: bucket, efs_status: 'Event'    }),
        censored: count({ ...slice, event_free_survival_years: bucket, efs_status: 'Censored' })
    }))

    const n = buckets.reduce((total, b) => total + b.events + b.censored, 0)

    let atRisk   = n
    let survival = 1
    let variance = 0

    const rows = buckets.map(({ bucket, events, censored }) => {
        const effective = atRisk - censored / 2

        if (effective > 0) {
            survival *= 1 - events / effective

            // Greenwood's sum over the same effective denominator. Guarded at
            // the interval where every remaining patient has the event, which
            // would otherwise divide by zero.
            if (effective > events) {
                variance += events / (effective * (effective - events))
            }
        }

        const se  = survival * Math.sqrt(variance)
        const row = {
            bucket,
            atRisk,
            events,
            censored,
            survival,
            ciLow : clamp01(survival - 1.96 * se),
            ciHigh: clamp01(survival + 1.96 * se)
        }

        atRisk -= events + censored
        return row
    })

    return { rows, n }
}
