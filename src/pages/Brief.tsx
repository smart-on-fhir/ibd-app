import { useMemo, useState }   from "react";
import { useParams }            from "react-router";
import { ClipboardList }        from "lucide-react";
import type { Resource }        from "fhir/r4";
import { FindingCard, SourceDialog, useClinicalData } from "clinical-primitives";
import { Preload }              from "../components/Preload";
import { EmptyState }           from "../components/ui/EmptyState";
import { buildBrief, type BriefFinding } from "../modules/ibd/brief";
import type { FHIRResourceMap } from "../types/fhir";

/** Findings shown before "Show more": a brief, not the whole record. */
const INITIAL_FINDINGS = 5;

/** Source buttons per card; the rest are in the evidence list. */
const MAX_SOURCE_BUTTONS = 3;

export function BriefPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Preload
      patientId={id}
      resourceTypes={[
        "Patient",
        "Encounter",
        "Observation",
        "MedicationRequest",
        "Condition",
        "Procedure",
        "DocumentReference"
      ]}
      label="Loading the record for the brief…"
    >
      <BriefContent />
    </Preload>
  );
}

function BriefContent() {
  const { resources } = useClinicalData();
  const brief = useMemo(() => buildBrief(resources as FHIRResourceMap), [resources]);
  const [showAll, setShowAll] = useState(false);
  const [source, setSource]   = useState<Resource | null>(null);

  if (!brief.since) {
    return (
      <div className="card p-6">
        <EmptyState message="This patient has fewer than two IBD clinic visits, so there is no interval to brief on." />
      </div>
    );
  }

  const shown = showAll ? brief.findings : brief.findings.slice(0, INITIAL_FINDINGS);
  const hidden = brief.findings.length - shown.length;

  return (
    <div className="card p-6">
      <header className="mb-5">
        <h2 className="text-xl font-semibold flex items-center gap-2 text-slate-700">
          <ClipboardList size={22} /> Pre-visit Brief
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Changes since the previous IBD clinic visit on {formatVisit(brief.previousVisit?.period?.start)}
          {" "}(last visit {formatVisit(brief.lastVisit?.period?.start)}). Every finding is computed from the
          record and opens the resources it cites.
        </p>
      </header>

      {brief.findings.length === 0
        ? <EmptyState message="Nothing changed in the coded record over this interval." />
        : (
          <div className="flex flex-col gap-4">
            {shown.map(finding => (
              <FindingCard
                key={finding.id}
                title={finding.title}
                description={finding.description}
                concernLevel={finding.concern}
                evidenceTabs={[{ label: "Evidence", items: finding.evidence }]}
                actionButtons={sourceButtons(finding, setSource)}
              />
            ))}
            {hidden > 0 && (
              <button className="self-start text-sm text-blue-700 hover:underline" onClick={() => setShowAll(true)}>
                Show {hidden} more {hidden === 1 ? "finding" : "findings"}
              </button>
            )}
          </div>
        )
      }

      <SourceDialog open={!!source} onClose={() => setSource(null)} resource={source ?? {}} />
    </div>
  );
}

/** "View <Type> (<date>)" buttons for a finding's first few sources. */
function sourceButtons(finding: BriefFinding, open: (r: Resource) => void): Record<string, () => void> {
  const buttons: Record<string, () => void> = {};
  for (const resource of finding.sources.slice(0, MAX_SOURCE_BUTTONS)) {
    let label = `View ${resource.resourceType}${resourceDate(resource) ? ` (${resourceDate(resource)})` : ""}`;
    // Keys must be unique; two sources of one type on one day are rare but possible.
    while (label in buttons) label += " ";
    buttons[label] = () => open(resource);
  }
  return buttons;
}

function resourceDate(resource: Resource): string {
  const r = resource as unknown as Record<string, unknown> & { period?: { start?: string }; performedPeriod?: { start?: string } };
  const value = (r.effectiveDateTime ?? r.authoredOn ?? r.date ?? r.onsetDateTime ?? r.recordedDate
    ?? r.period?.start ?? r.performedPeriod?.start ?? r.performedDateTime) as string | undefined;
  return value ? value.slice(0, 10) : "";
}

function formatVisit(date?: string): string {
  return date
    ? new Date(date.slice(0, 10) + "T00:00:00").toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : "an unknown date";
}
