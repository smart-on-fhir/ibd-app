import { useEffect, useRef, useState } from "react";
import { useClinicalData }             from "clinical-primitives";
import { getAllResourcePages }         from "../api/ihl";
import type { IHL_API_Query_Options }  from "../api/ihl";

/**
 * Ensures a set of resource types are loaded into the clinical data context,
 * fetching whichever ones aren't already cached. Wraps the repeated
 * `Promise.all([lazy(...), lazy(...)])` pattern pages were hand-rolling.
 */
export function usePrefetch(
    cohortId: string,
    resourceTypes: string[],
    options: Pick<IHL_API_Query_Options, "limit" | "signal"> & { force?: boolean } = {}
) {
    const { resources, lazy } = useClinicalData();

    // Whether any requested type is actually missing from the cache right now.
    // Checked both for the initial state (so an already-warm cache never shows
    // a loading frame at all) and again inside the effect (so a re-run with a
    // fully-cached set doesn't flip loading true then immediately false).
    const needsFetch = () => !!options.force || resourceTypes.some(type => !resources[type]);

    const [loading, setLoading] = useState(needsFetch);
    const [error, setError] = useState<Error | null>(null);
    const [progress, setProgress] = useState(() => (needsFetch() ? 0 : 100));

    // resourceTypes is typically passed as a fresh array literal on every
    // render, so the effect keys off its contents rather than its identity.
    const key = resourceTypes.join(",");

    // Per-type fraction (0..1), keyed by resourceType. A ref rather than state:
    // a type with many pages reports progress far too often to route each
    // update through its own setState/render.
    const fractions = useRef<Record<string, number>>({});

    useEffect(() => {
        let cancelled = false;
        fractions.current = {};
        setError(null);

        function reportProgress() {
            if (cancelled) return;
            const total = resourceTypes.reduce((sum, type) => sum + (fractions.current[type] ?? 0), 0);
            setProgress(resourceTypes.length ? Math.round((total / resourceTypes.length) * 100) : 100);
        }

        if (!needsFetch()) {
            resourceTypes.forEach(type => { fractions.current[type] = 1; });
            setProgress(100);
            setLoading(false);
            return;
        }

        setLoading(true);
        setProgress(0);

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
                        { limit: options.limit ?? 1000, signal: options.signal },
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
            .catch(e => { if (!cancelled) setError(e instanceof Error ? e : new Error(String(e))); })
            .finally(() => { if (!cancelled) { setProgress(100); setLoading(false); } });

        reportProgress();

        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cohortId, key, lazy, options.force]);

    return { loading, error, progress, resources };
}
