import type { ReactNode } from "react";
import { usePrefetch }    from "../hooks/usePrefetch";
import { ProgressBar }    from "./ui/ProgressBar";
import { ErrorMessage }   from "./ui/ErrorMessage";

/**
 * Renders its children only once the given resource types are loaded into the
 * clinical data context, showing a progress bar until then and an error message
 * if loading fails.
 *
 * Children are rendered lazily, so anything that reads the preloaded resources
 * must live in a child component (or below one) — not in JSX built by the
 * component that renders `<Preload>`, which is evaluated before the data exists.
 *
 * With `patientId`, only that patient's resources are loaded.
 */
export function Preload({
  resourceTypes,
  cohortId = "sim-ibd-patients",
  patientId,
  label,
  limit,
  force,
  children,
}: {
  resourceTypes: string[]
  cohortId?    : string
  patientId?   : string
  label?       : string
  limit?       : number
  force?       : boolean
  children     : ReactNode
}) {
  const { loading, error, progress } = usePrefetch(cohortId, resourceTypes, { limit, force, patientId });

  if (error)   return <div className="p-6"><ErrorMessage message={error.message} /></div>;
  if (loading) return <ProgressBar value={progress} label={label} />;

  return <>{children}</>;
}
