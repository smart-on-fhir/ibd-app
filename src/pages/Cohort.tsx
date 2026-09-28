/**
 * Playground for the cohort-outcome component. Temporary, and static: there is
 * no API behind this yet, so the numbers below stand in for whatever the cohort
 * service will eventually return.
 *
 * Deliberately no chart library. Every mark here is a div positioned by a
 * percentage, which is all a bar on a 0–100% scale needs — and it keeps the
 * component free to become a real one without a dependency to unpick later.
 */

import { useEffect, useRef, useState } from 'react'
import { useClinicalData } from 'clinical-primitives'


/** One treatment option and its modelled outcome, as percentages. */
interface CohortOutcome {
    label: string

    /** Point estimate, 0–100. */
    value: number

    /** Confidence interval, 0–100. */
    ciLow: number
    ciHigh: number

    /**
     * The patient's present treatment, drawn darker.
     *
     * The comparison the chart exists to make is "everything else against what
     * we are doing now", so the baseline has to be findable without reading the
     * labels.
     */
    current?: boolean
}

const COHORT = {
    size    : 15236,
    criteria: {
        'age at IBD diagnosis': '0-6 years',
        'birth sex'           : 'female',
        'IBD subtype'         : "Crohn's disease"
    } as Record<string, string>,
    outcome : 'steroid-free remission at 12 months'
}

/** The choices each fixed filter can take, for the edit dialog's selects. */
const CRITERION_OPTIONS: Record<string, string[]> = {
    'age at IBD diagnosis': ['0-6 years', '7-12 years', '13-17 years', '18+ years'],
    'birth sex'           : ['female', 'male'],
    'IBD subtype'         : ["Crohn's disease", 'Ulcerative colitis', 'IBD-unclassified']
}

const OUTCOMES: CohortOutcome[] = [
    { label: 'No treatment change'   , value: 51.9, ciLow: 47.4, ciHigh: 56.9, current: true },
    { label: 'JAK inhibitor'         , value: 84.7, ciLow: 77.7, ciHigh: 100  },
    { label: 'IL-12/23 inhibitor'    , value: 83.7, ciLow: 77.2, ciHigh: 97.7 },
    { label: 'Anti-integrin biologic', value: 77.7, ciLow: 70.2, ciHigh: 90.7 },
    { label: '5-ASA'                 , value: 65.9, ciLow: 59.4, ciHigh: 76.4 }
]

/**
 * Tick sets from most detailed to least, each a subset of the one before.
 *
 * Subsets on purpose: as the chart narrows, labels drop out but the ones that
 * remain stay put. A set with different positions would make a resize look like
 * the scale itself had changed.
 */
const TICK_SETS = [
    [0, 25, 50, 75, 100],
    [0, 50, 100],
    [0, 100]
]

/**
 * Room each tick needs, in pixels — "100%" at this font size plus enough gap
 * that two labels read as two.
 *
 * A constant rather than a measurement. Measuring text means rendering it,
 * measuring, and re-rendering, which is a lot of machinery for a threshold that
 * only has to be roughly right: being 10px out moves the breakpoint by 10px and
 * nothing else.
 */
const MIN_TICK_SPACING = 60

/**
 * The densest tick set that fits the given width.
 *
 * Falls back to the sparsest rather than to nothing: two labels overlapping is
 * better than an axis with no scale on it at all.
 */
function ticksForWidth(width: number): number[] {
    return TICK_SETS.find(set => width >= (set.length - 1) * MIN_TICK_SPACING)
        ?? TICK_SETS[TICK_SETS.length - 1]
}

/**
 * Watches an element's width and picks a tick set to match.
 *
 * Driven by the element rather than the viewport: this chart sits in a panel
 * beside a sidebar that opens and closes, so the window can be wide while the
 * plot is narrow.
 */
function useTicks(ref: React.RefObject<HTMLElement | null>): number[] {
    const [ticks, setTicks] = useState(TICK_SETS[0])

    useEffect(() => {
        const element = ref.current

        if (!element) {
            return
        }

        const observer = new ResizeObserver(([entry]) => {
            // The tick sets are module constants, so an unchanged choice hands
            // back the same array and React drops the render.
            setTicks(ticksForWidth(entry.contentRect.width))
        })

        observer.observe(element)
        return () => observer.disconnect()
    }, [ref])

    return ticks
}

/** Label column and plot column, shared by the axis and every row. */
const GRID = 'grid grid-cols-[minmax(7rem,9rem)_1fr_7em] items-center gap-x-4'

function Legend() {
    return (
        <div className="flex items-center gap-x-4 gap-y-1 text-sm text-stone-500 flex-wrap min-w-30">
            <span className="flex items-center gap-1.5 text-nowrap">
                <span className="h-2.5 w-2.5 rounded-xs bg-lime-500" />
                Current approach
            </span>
            <span className="flex items-center gap-1.5 text-nowrap">
                <span className="h-2.5 w-2.5 rounded-xs bg-blue-400" />
                Treatment options
            </span>
        </div>
    )
}

/**
 * The interval around an estimate: a rule from low to high with a cap at each
 * end, drawn over the bar rather than beside it so the eye reads one mark.
 */
function ConfidenceInterval({ low, high }: { low: number, high: number }) {
    return (
        <div
            className="pointer-events-none absolute inset-y-0"
            style={{ left: `${low}%`, width: `${high - low}%`, filter: 'drop-shadow(0 0 1px #FFF)' }}
        >
            <div className="absolute top-1/2 h-[2px] w-full -translate-y-1/2 bg-stone-800" />
            <div className="absolute left-0 top-1/2 h-2.5 w-[2px] -translate-y-1/2 bg-stone-800" />
            <div className="absolute right-0 top-1/2 h-2.5 w-[2px] -translate-y-1/2 bg-stone-800" />
        </div>
    )
}

function OutcomeRow({ outcome }: { outcome: CohortOutcome }) {
    return (
        <div className={`${GRID} py-1.5`}>
            <div className={`text-sm ${outcome.current ? 'font-bold text-stone-900' : 'text-stone-700'}`}>
                {outcome.label}
            </div>

            {/* The track is the full 0–100% scale; the bar is the estimate. Both
                rounded, so a short bar still reads as a bar and not as a chip. */}
            <div className="relative h-6 rounded bg-stone-100">
                <div
                    className={`h-full rounded ${outcome.current ? 'bg-lime-500' : 'bg-blue-400'}`}
                    style={{ width: `${outcome.value}%` }}
                />
                <ConfidenceInterval low={outcome.ciLow} high={outcome.ciHigh} />
            </div>

            <div className="whitespace-nowrap text-xs">
                <span className="font-bold text-stone-900">{outcome.value.toFixed(1)}%</span>
                {/* An en dash, not a hyphen: this is a range, and the hyphen
                    reads as a minus sign against numbers. */}
                <span className="ml-1.5 text-xs text-stone-400">
                    ({outcome.ciLow.toFixed(1)}-{outcome.ciHigh.toFixed(1)})
                </span>
            </div>
        </div>
    )
}

/** One row of the fixed filter list: on/off plus its current value. */
interface CriterionState {
    value  : string
    enabled: boolean
}

/**
 * Edits which of the fixed set of cohort filters apply, and their values.
 *
 * The filter names themselves come from a fixed list — there's no API yet to
 * discover what filters exist, so the set can't grow here. Once a real
 * endpoint backs this, the response's "filters applied" list replaces this
 * optimistic local state.
 */
function EditCriteriaDialog({
    criteria,
    onSubmit,
    onCancel
}: {
    criteria: Record<string, CriterionState>
    onSubmit: (criteria: Record<string, CriterionState>) => void
    onCancel: () => void
}) {
    const [draft, setDraft] = useState(criteria)

    function updateValue(name: string, value: string) {
        setDraft({ ...draft, [name]: { ...draft[name], value } })
    }

    function toggleEnabled(name: string) {
        setDraft({ ...draft, [name]: { ...draft[name], enabled: !draft[name].enabled } })
    }

    return (
        <div className="fixed inset-0 z-5000 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-lg ring-1 ring-black/5">
                <h3 className="mb-4 font-bold text-lg text-stone-900">Edit Similarity Criteria</h3>

                <div className="flex flex-col gap-2">
                    { Object.entries(draft).map(([name, { value, enabled }]) => (
                        <div key={name} className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                className="h-4 w-4"
                                checked={enabled}
                                onChange={() => toggleEnabled(name)}
                                aria-label={`Include ${name}`}
                            />
                            <span className="w-1/2 text-sm text-stone-700">{name}</span>
                            <select
                                className="w-1/2 rounded border border-stone-200 px-2 py-1 text-sm disabled:bg-stone-50 disabled:text-stone-400"
                                value={value}
                                disabled={!enabled}
                                onChange={e => updateValue(name, e.target.value)}
                            >
                                { CRITERION_OPTIONS[name].map(option => (
                                    <option key={option} value={option}>{option}</option>
                                )) }
                            </select>
                        </div>
                    )) }
                </div>

                <div className="mt-5 flex justify-end gap-2">
                    <button
                        type="button"
                        className="rounded px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
                        onClick={() => onSubmit(draft)}
                    >
                        Apply
                    </button>
                </div>
            </div>
        </div>
    )
}

/** The same numbers as a table — the accessible reading of the chart above. */
function OutcomeTable() {
    return (
        <table className="mt-3 w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-stone-400">
                <tr>
                    <th className="py-1 pr-4 font-medium">Treatment</th>
                    <th className="py-1 pr-4 font-medium">Estimate</th>
                    <th className="py-1 font-medium">95% CI</th>
                </tr>
            </thead>
            <tbody>
                { OUTCOMES.map(outcome => (
                    <tr key={outcome.label} className="border-t border-stone-100 ">
                        <td className="py-1.5 pr-4 text-stone-800">
                            {outcome.label}
                            { outcome.current && <span className="ml-2 text-xs text-white bg-lime-500 px-1 py-0.5 rounded">Current</span> }
                        </td>
                        <td className="py-1.5 pr-4 tabular-nums">{outcome.value.toFixed(1)}%</td>
                        <td className="py-1.5 tabular-nums text-stone-500">
                            {outcome.ciLow.toFixed(1)}-{outcome.ciHigh.toFixed(1)}
                        </td>
                    </tr>
                )) }
            </tbody>
        </table>
    )
}

export function CohortPage() {
    const [criteriaState, setCriteriaState] = useState<Record<string, CriterionState>>(
        () => Object.fromEntries(
            Object.entries(COHORT.criteria).map(([name, value]) => [name, { value, enabled: true }])
        )
    )
    const [editingCriteria, setEditingCriteria] = useState(false)
    const criteria = Object.entries(criteriaState)
        .filter(([, { enabled }]) => enabled)
        .map(([name, { value }]) => `${name}: ${value}`)
        .join('; ')
    const axisRef  = useRef<HTMLDivElement>(null)
    const ticks    = useTicks(axisRef)
    const { patient } = useClinicalData()

    if (!patient) return null;

    const name = (patient.name?.[0]?.given || []).map(n => n.trim()).join(' ')

    return (
        <div className="pt-6">
            <div className="mx-auto max-w-4xl">
                <p className="mb-3 text-sm leading-relaxed text-stone-600">
                    For patients (N={COHORT.size.toLocaleString()}) like {name} who meet the
                    following criteria ({criteria}) the chart below shows the likelihood of
                    achieving {COHORT.outcome} based on treatment.
                </p>

                <button
                    type="button"
                    // className="mb-5 rounded border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-700 shadow-xs hover:bg-stone-50"
                       className="mb-5 rounded bg-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 border border-slate-300 hover:border-slate-400 cursor-pointer"
                    onClick={() => setEditingCriteria(true)}
                >
                    Edit Similarity Criteria
                </button>

                { editingCriteria && (
                    <EditCriteriaDialog
                        criteria={criteriaState}
                        onCancel={() => setEditingCriteria(false)}
                        onSubmit={updated => {
                            setCriteriaState(updated)
                            setEditingCriteria(false)
                        }}
                    />
                ) }

                <div>
                    <div className="my-6 flex items-baseline justify-between gap-4">
                        <div>
                            <h2 className="font-bold text-xl text-stone-900 leading-none mb-1">
                                Expected outcome by treatment option
                            </h2>
                            <p className="text-sm text-stone-400">Steroid-free remission at 12 months</p>
                        </div>
                        <Legend />
                    </div>

                    {/* The axis is a row of the same grid, so its ticks cannot
                        drift out of alignment with the tracks below. */}
                    <div className={`${GRID} mb-1`}>
                        <div />
                        <div ref={axisRef} className="relative h-4 text-xs text-stone-400">
                            { ticks.map(tick => (
                                <span
                                    key={tick}
                                    // The end labels are pulled inside the track
                                    // rather than centered on it: half of "100%"
                                    // hanging past the axis would sit under the
                                    // value column.
                                    className={`absolute ${
                                        tick === 0   ? '' :
                                        tick === 100 ? '-translate-x-full' :
                                                       '-translate-x-1/2'
                                    }`}
                                    style={{ left: `${tick}%` }}
                                >
                                    {tick}%
                                </span>
                            )) }
                        </div>
                        <div />
                    </div>

                    { OUTCOMES.map(outcome => (
                        <OutcomeRow key={outcome.label} outcome={outcome} />
                    )) }

                    <details className="mt-4 text-sm text-stone-500">
                        <summary className="cursor-pointer select-none marker:text-stone-400 hover:text-stone-700 font-semibold">
                            &nbsp;View as table
                        </summary>
                        <OutcomeTable />
                    </details>
                </div>
            </div>
        </div>
    )
}
