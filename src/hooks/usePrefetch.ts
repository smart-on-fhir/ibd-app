import { useCallback, useEffect, useRef, useState } from "react";
import { useClinicalData }             from "clinical-primitives";
import { getAllResourcePages }         from "../api/ihl";
import type { IHL_API_Query_Options }  from "../api/ihl";

/** Where one prefetch request stands. Tagged with the request it describes. */
interface PrefetchState {
    request : string;
    loading : boolean;
    error   : Error | null;
    progress: number;
}

/**
 * Aborts every prefetch started since the last reset.
 *
 * The cache is keyed by resource type alone, and clear() empties it but does
 * not stop fetches already under way, so one finishing late would store a
 * patient's resources after their record was closed and serve them as the next
 * patient's. Aborting it instead means nothing gets stored. One controller for
 * all of them rather than one per hook: fetches are shared between hooks, and
 * a page unmounting must not abort a fetch the next page is waiting on.
 */
let prefetchScope = new AbortController();

/**
 * Empties the clinical data context, and stops any prefetch still filling it.
 * Use this rather than the context's clear() whenever the patient changes.
 */
export function useResetClinicalData() {
    const { clear } = useClinicalData();
    return useCallback(() => {
        prefetchScope.abort();
        prefetchScope = new AbortController();
        clear();
    }, [clear]);
}

/**
 * Ensures a set of resource types are loaded into the clinical data context,
 * fetching whichever ones aren't already cached. Wraps the repeated
 * `Promise.all([lazy(...), lazy(...)])` pattern pages were hand-rolling.
 *
 * With `patientId`, only that patient's resources are fetched. Already-cached
 * types are not re-checked against it, so the cache must be reset with
 * useResetClinicalData() when the patient changes.
 */
export function usePrefetch(
    cohortId: string,
    resourceTypes: string[],
    options: Pick<IHL_API_Query_Options, "limit" | "signal" | "patientId"> & { force?: boolean } = {}
) {
    const { resources, lazy } = useClinicalData();

    // Whether any requested type is actually missing from the cache right now.
    // Checked both for the initial state (so an already-warm cache never shows
    // a loading frame at all) and again inside the effect (so a re-run with a
    // fully-cached set doesn't flip loading true then immediately false).
    const needsFetch = () => !!options.force || resourceTypes.some(type => !resources[type]);

    // resourceTypes is typically passed as a fresh array literal on every
    // render, so the request is identified by its contents rather than its
    // identity.
    const key     = resourceTypes.join(",");
    const request = `${cohortId}|${options.patientId ?? ""}|${key}|${!!options.force}`;

    // Types already cached count as done from the start, since lazy() won't
    // fetch them; a forced reload counts nothing as done.
    const startingState = (): PrefetchState => {
        const cached = options.force ? 0 : resourceTypes.filter(type => resources[type]).length;
        return {
            request,
            loading : needsFetch(),
            error   : null,
            progress: !needsFetch() ? 100 : Math.round((cached / resourceTypes.length) * 100)
        };
    };

    const [stored, setStored] = useState(startingState);

    // A new request starts from fresh state, reset here during render rather
    // than in the effect: resetting there would first render the previous
    // request's state — "loaded", say — for a request that has not started.
    const state = stored.request === request ? stored : startingState();
    if (state !== stored) {
        setStored(state);
    }

    // Per-type fraction (0..1), keyed by resourceType. A ref rather than state:
    // a type with many pages reports progress far too often to route each
    // update through its own setState/render.
    const fractions = useRef<Record<string, number>>({});

    useEffect(() => {
        if (!needsFetch()) {
            return;
        }

        let cancelled = false;
        fractions.current = {};

        const signal = options.signal
            ? AbortSignal.any([prefetchScope.signal, options.signal])
            : prefetchScope.signal;

        // Every update below is scoped to this request, so a slow response
        // from a request the caller has moved on from cannot overwrite the
        // state of the current one.
        const update = (change: Partial<PrefetchState>) => {
            if (!cancelled) {
                setStored(prev => prev.request === request ? { ...prev, ...change } : prev);
            }
        };

        function reportProgress() {
            const total = resourceTypes.reduce((sum, type) => sum + (fractions.current[type] ?? 0), 0);
            update({ progress: resourceTypes.length ? Math.round((total / resourceTypes.length) * 100) : 100 });
        }

        Promise.all(
            resourceTypes.map(resourceType => {
                // Already cached (and not a forced reload): counts as instantly
                // done rather than trickling in, since lazy() won't fetch it.
                if (!options.force && resources[resourceType]) {
                    fractions.current[resourceType] = 1;
                    return Promise.resolve();
                }

                return lazy(
                    resourceType,
                    () => getAllResourcePages(
                        cohortId,
                        resourceType,
                        { limit: options.limit ?? 1000, signal, patientId: options.patientId },
                        fraction => {
                            fractions.current[resourceType] = fraction;
                            reportProgress();
                        }
                    ),
                    { force: options.force }
                ).then(() => {
                    // Covers the case where this type's fetch was already
                    // in-flight from another usePrefetch/lazy caller: this
                    // instance's onProgress above never got attached to it, so
                    // without this its fraction would otherwise stay at 0 until
                    // the whole Promise.all settles.
                    fractions.current[resourceType] = 1;
                    reportProgress();
                });
            })
        )
            .catch(e => update({ error: e instanceof Error ? e : new Error(String(e)) }))
            .finally(() => update({ progress: 100, loading: false }));

        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [request, lazy]);

    return { loading: state.loading, error: state.error, progress: state.progress, resources };
}
