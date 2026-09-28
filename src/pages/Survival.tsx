import { useEffect, useMemo, useRef, useState } from 'react'
import {
    CLOSED_BUCKETS, STRATIFIERS, countGranularity, humanize, lifeTable, valuesOf,
    type Dimension, type LifeTable
} from '../lib/efsCube'

/**
 * Event-free survival for the VEO-IBD cohort, read from the powerset cube.
 *
 * Drawn as plain SVG rather than through a chart library. A survival curve is a
 * step function with a risk table under it, and both are what charting
 * libraries make hardest: `Chart` from clinical-primitives interpolates
 * `monotone` and hides every point, which would draw a smooth curve through
 * yearly buckets — a picture of something the estimator never claims.
 */

/** Arms smaller than this are not plotted. The backend will enforce it too. */
const MIN_ARM = 10

const COLORS = [
    '#2563eb',
    '#16a34a',
    '#d97706',
    '#bc3cef',
    '#dc2626',
    '#0891b2',
    '#4f46e5'
]

interface Curve {
    label: string
    color: string
    table: LifeTable
}

// =============================================================================
// Geometry
// =============================================================================

// The left margin holds two things: the y-axis percentages, and the stratum
// names in the risk table below. Sized for the longer of the two — the names —
// so a name can never reach the first column of numbers.
const PAD = { top: 12, right: 20, bottom: 56, left: 128 }

/**
 * Height follows width, so the plot keeps its shape at any size.
 *
 * The aspect ratio matters more here than it looks: how steeply a survival
 * curve appears to fall is a property of the box it is drawn in, and two curves
 * read as "similar" or "very different" partly on that. Fixing the ratio means
 * a screenshot taken on a laptop makes the same visual claim as one taken on a
 * wide monitor.
 */
const ASPECT_RATIO = 3 / 7

/**
 * Years the curve covers — one tick per closed bucket, plus the origin.
 *
 * The cube's final bucket is `>=5`, which records that a patient reached five
 * years but not when anything happened afterwards. So the curve stops at five
 * rather than inventing a step there; those patients still appear in the risk
 * table, which is where they belong.
 */
const YEARS   = CLOSED_BUCKETS.map((_, index) => index + 1)
const X_TICKS = [0, ...YEARS]
const Y_TICKS = [0, 0.25, 0.5, 0.75, 1]

/** Watches an element's width so the plot can be laid out in real pixels. */
function useWidth(ref: React.RefObject<HTMLElement | null>): number {
    const [width, setWidth] = useState(0)

    useEffect(() => {
        const element = ref.current

        if (!element) {
            return
        }

        const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))

        observer.observe(element)
        return () => observer.disconnect()
    }, [ref])

    return width
}

type Scale = (value: number) => number

/** Survival at the end of each closed bucket, starting from 1 at time zero. */
function levels(table: LifeTable): number[] {
    return [1, ...table.rows.slice(0, CLOSED_BUCKETS.length).map(row => row.survival)]
}

/**
 * The staircase: flat across each year, vertical at the year boundary where the
 * estimate changes. Never a diagonal, which would claim the drop happened
 * gradually through the year — the cube cannot say that.
 */
function stepPath(values: number[], x: Scale, y: Scale): string {
    const commands = [`M ${x(0)} ${y(values[0])}`]

    values.slice(1).forEach((value, index) => {
        commands.push(`H ${x(index + 1)}`, `V ${y(value)}`)
    })

    return commands.join(' ')
}

/** The interval as one closed shape: upper limit out, lower limit back. */
function bandPath(table: LifeTable, x: Scale, y: Scale): string {
    const rows  = table.rows.slice(0, CLOSED_BUCKETS.length)
    const highs = [1, ...rows.map(row => row.ciHigh)]
    const lows  = [1, ...rows.map(row => row.ciLow)]

    const commands = [`M ${x(0)} ${y(highs[0])}`]

    highs.slice(1).forEach((value, index) => {
        commands.push(`H ${x(index + 1)}`, `V ${y(value)}`)
    })

    // Back along the lower limit, right to left, stepping the same way — a band
    // that cut diagonals would disagree with the curve it bounds.
    for (let i = lows.length - 1; i >= 1; i--) {
        commands.push(`L ${x(i)} ${y(lows[i])}`, `L ${x(i - 1)} ${y(lows[i])}`)
    }

    return [...commands, 'Z'].join(' ')
}

// =============================================================================
// Chart
// =============================================================================

function SurvivalChart({ curves, showBands }: { curves: Curve[], showBands: boolean }) {
    const containerRef = useRef<HTMLDivElement>(null)
    const width        = useWidth(containerRef)

    const height     = Math.round(width * ASPECT_RATIO)
    const plotWidth  = Math.max(0, width - PAD.left - PAD.right)
    const plotHeight = Math.max(0, height - PAD.top - PAD.bottom)

    const scales = useMemo(() => ({
        x: (year: number) => PAD.left + (year / YEARS.length) * plotWidth,
        y: (survival: number) => PAD.top + (1 - survival) * plotHeight
    }), [plotWidth, plotHeight])

    return (
        <div ref={containerRef}>
            {/* Rendered only once the width is known: laying out in pixels
                against a zero-width box would put every mark on the axis. */}
            { width > 0 &&
                <svg width={width} height={height} className="overflow-visible">
                    { Y_TICKS.map(tick => (
                        <g key={tick}>
                            <line
                                x1={PAD.left} x2={PAD.left + plotWidth}
                                y1={scales.y(tick)} y2={scales.y(tick)}
                                stroke="#e7e5e4" strokeWidth={1}
                            />
                            <text
                                x={PAD.left - 10} y={scales.y(tick)}
                                textAnchor="end" dominantBaseline="middle"
                                fontSize={11} fill="#a8a29e"
                            >
                                {tick * 100}%
                            </text>
                        </g>
                    )) }

                    { X_TICKS.map(tick => (
                        <text
                            key={tick}
                            x={scales.x(tick)} y={PAD.top + plotHeight + 18}
                            textAnchor="middle" fontSize={11} fill="#a8a29e"
                        >
                            {tick}
                        </text>
                    )) }
                    <text
                        x={PAD.left + plotWidth / 2} y={height - 22}
                        textAnchor="middle" fontSize={11} fill="#78716c"
                    >
                        Years since diagnosis
                    </text>

                    { showBands && curves.map(curve => (
                        <path
                            key={curve.label}
                            d={bandPath(curve.table, scales.x, scales.y)}
                            fill={curve.color} opacity={0.12}
                        />
                    )) }

                    { curves.map(curve => (
                        <path
                            key={curve.label}
                            d={stepPath(levels(curve.table), scales.x, scales.y)}
                            fill="none" stroke={curve.color} strokeWidth={2}
                        />
                    )) }
                </svg>
            }

            {/* Numbers at risk, positioned by the same scale as the curve, so
                the two cannot drift out of register. */}
            <div className="mt-1" style={{ paddingLeft: PAD.left, paddingRight: PAD.right }}>
                {/* "Number at risk" is the conventional label and the one a
                    clinician looks for, but on its own it reads as "how many
                    are still in danger" — so a falling row looks like good
                    news. What the numbers actually count is how many patients
                    are still being observed, which is the denominator the curve
                    rests on. Named for that, with the standard term kept
                    alongside for readers who expect it. */}
                <div className="mb-1 text-xs font-medium text-stone-500">
                    Patients under follow-up
                    <span className="ml-1.5 font-normal text-stone-400">(number at risk)</span>
                </div>
                { curves.map(curve => (
                    <div key={curve.label} className="relative h-5 text-xs text-stone-600">
                        <span
                            className="absolute right-full whitespace-nowrap pr-3"
                            style={{ color: curve.color }}
                        >
                            {curve.label}
                        </span>
                        { X_TICKS.map((tick, index) => (
                            <span
                                key={tick}
                                // Centered on the tick, except at the ends where
                                // half a number would hang into the names on the
                                // left or past the panel on the right.
                                className={`absolute tabular-nums whitespace-nowrap ${
                                    index === 0                  ? '' :
                                    index === X_TICKS.length - 1 ? '-translate-x-full' :
                                                                   '-translate-x-1/2'
                                }`}
                                style={{ left: plotWidth ? scales.x(tick) - PAD.left : 0 }}
                            >
                                { curve.table.rows[index]?.atRisk ?? 0 }
                            </span>
                        )) }
                    </div>
                )) }
            </div>
        </div>
    )
}

// =============================================================================
// Page
// =============================================================================

export function SurvivalPage() {
    const [stratifier, setStratifier] = useState<Dimension | ''>('firstline_therapy')
    const [showBands , setShowBands ] = useState(false)

    // Series switched off from the legend, by label. Cleared when the
    // stratifier changes, since the labels then refer to different things.
    const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set())

    function toggleSeries(label: string) {
        setHiddenSeries(previous => {
            const next = new Set(previous)

            if (!next.delete(label)) {
                next.add(label)
            }

            return next
        })
    }

    const { curves, hidden } = useMemo(() => {
        if (!stratifier) {
            return {
                curves: [{ label: 'All patients', color: COLORS[0], table: lifeTable() }],
                hidden: [] as { label: string, n: number }[]
            }
        }

        const all = valuesOf(stratifier).map((value, index) => ({
            label: humanize(value),
            color: COLORS[index % COLORS.length],
            table: lifeTable({ [stratifier]: value })
        }))

        return {
            curves: all.filter(curve => curve.table.n >= MIN_ARM),
            hidden: all.filter(curve => curve.table.n < MIN_ARM)
                       .map(curve => ({ label: curve.label, n: curve.table.n }))
        }
    }, [stratifier])

    // Colors are fixed before this filter, over every arm rather than the
    // visible ones. Assigned after it, switching one series off would renumber
    // the palette and recolor arms the reader never touched.
    const visibleCurves = curves.filter(curve => !hiddenSeries.has(curve.label))

    return (
        <div className="pt-6">
            <div className="mx-auto max-w-4xl">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-stone-900">
                            Event-free survival
                        </h2>
                        <p className="text-xs text-stone-400">
                            Kaplan–Meier (life-table) estimate · VEO-IBD cohort
                        </p>
                    </div>

                    <div className="flex items-center gap-4 text-xs">
                        <label className="flex items-center gap-2 text-stone-500">
                            Stratify by
                            <select
                                value={stratifier}
                                onChange={e => {
                                    setStratifier(e.target.value as Dimension | '')
                                    setHiddenSeries(new Set())
                                }}
                                className="rounded border border-stone-200 bg-white px-2 py-1 text-stone-800"
                            >
                                <option value="">Nothing (whole cohort)</option>
                                { STRATIFIERS.map(dimension => (
                                    <option key={dimension} value={dimension}>
                                        {humanize(dimension)}
                                    </option>
                                )) }
                            </select>
                        </label>

                        <label className="flex items-center gap-1.5 text-stone-500">
                            <input
                                type="checkbox"
                                checked={showBands}
                                onChange={e => setShowBands(e.target.checked)}
                            />
                            95% bands
                        </label>
                    </div>
                </div>

                {/* Clicking a legend entry toggles its curve, the way a chart
                    library's legend does. Every entry stays listed whether it is
                    drawn or not — a legend that dropped what you switched off
                    would leave nothing to switch back on. */}
                <div className="mb-3 flex flex-wrap items-center gap-4 text-xs">
                    { curves.map(curve => {
                        const off = hiddenSeries.has(curve.label)

                        return (
                            <button
                                key={curve.label}
                                type="button"
                                onClick={() => toggleSeries(curve.label)}
                                aria-pressed={!off}
                                title={off ? `Show ${curve.label}` : `Hide ${curve.label}`}
                                className={`flex cursor-pointer items-center gap-1.5 ${
                                    off ? 'text-stone-300' : 'text-stone-500'
                                }`}
                            >
                                {/* Hollowed rather than hidden when off, so the
                                    row keeps its shape and the color stays
                                    associated with the name. */}
                                <span
                                    className="h-2.5 w-2.5 rounded-xs border"
                                    style={{
                                        background : off ? 'transparent' : curve.color,
                                        borderColor: curve.color,
                                        opacity    : off ? 0.4 : 1
                                    }}
                                />
                                <span className={off ? 'line-through' : undefined}>{curve.label}</span>
                                <span className={off ? 'text-stone-300' : 'text-stone-400'}>
                                    n={curve.table.n}
                                </span>
                            </button>
                        )
                    }) }
                </div>

                <SurvivalChart curves={visibleCurves} showBands={showBands} />

                <div className="mt-4 space-y-1 text-xs text-stone-400">
                    { hidden.length > 0 &&
                        <p>
                            Not shown, fewer than {MIN_ARM} patients:{' '}
                            { hidden.map(arm => `${arm.label} (n=${arm.n})`).join(', ') }.
                        </p>
                    }
                    <ol className="list-decimal list-outside space-y-1 ps-5 marker:text-stone-300">
                        { countGranularity > 1 &&
                            <li>Counts in this export are k-rounded for disclosure control — every one
                                is a multiple of {countGranularity}, so each is within{' '}
                                {countGranularity / 2} of the true figure and arm sizes do not sum to
                                the cohort total.</li> }
                        <li>The curve ends at five years: the cube's final bucket records that a patient
                            reached five years, not when their event occurred.</li>
                        <li>Patients leave the follow-up row for two different reasons — having the
                            event, and reaching the end of their observed time without it. A falling
                            row therefore means less evidence behind the curve from that point on, not
                            that fewer patients are at stake.</li>
                    </ol>
                </div>
            </div>
        </div>
    )
}
