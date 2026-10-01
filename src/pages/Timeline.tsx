import type { Observation } from "fhir/r4";
import { CircleSmall } from "lucide-react";
import { useParams }   from "react-router";
import { IBDSummary }  from "./IBDSummary";
import { Preload }     from "../components/Preload";
import {
  TimelineChart,
  type TimelineMedication,
  type MedicationClassifier,
  type MedicationLegendEntry,
  lib as cp,
  useClinicalData
} from "clinical-primitives";
import {
  IBD_LAB_PANEL,
  IBD_MEDICATION_CLASS,
  RE_IBD_MED_ADVANCED_OTHER,
  RE_IBD_MED_AMINOSALICYLATE,
  RE_IBD_MED_ANTI_INTEGRIN,
  RE_IBD_MED_ANTI_INTERLEUKIN,
  RE_IBD_MED_ANTI_TNF,
  RE_IBD_MED_ANTIBIOTIC,
  RE_IBD_MED_CORTICOSTEROID,
  RE_IBD_MED_IMMUNOMODULATOR,
  RE_IBD_MED_JAK_INHIBITOR
} from "../modules/ibd/config";


/**
 * The IBD class a medication belongs to, or null if it is not a recognized IBD
 * drug. Matched on the prescribed product text, which is where brand names show
 * up.
 */
function findIbdClass(med: TimelineMedication): string | null {
    const name = cp.Medication.getMedicationName(med);

    if (!name) {
        return null;
    }

    if (RE_IBD_MED_ADVANCED_OTHER  .test(name)) return "AdvancedOther";
    if (RE_IBD_MED_AMINOSALICYLATE .test(name)) return "Aminosalicylate";
    if (RE_IBD_MED_ANTI_INTEGRIN   .test(name)) return "AntiIntegrin";
    if (RE_IBD_MED_ANTI_INTERLEUKIN.test(name)) return "AntiInterleukin";
    if (RE_IBD_MED_ANTI_TNF        .test(name)) return "AntiTNF";
    if (RE_IBD_MED_ANTIBIOTIC      .test(name)) return "Antibiotic";
    if (RE_IBD_MED_CORTICOSTEROID  .test(name)) return "Corticosteroid";
    if (RE_IBD_MED_IMMUNOMODULATOR .test(name)) return "Immunomodulator";
    if (RE_IBD_MED_JAK_INHIBITOR   .test(name)) return "JAKInhibitor";

    return null;
}

/**
 * Keeps only IBD medications and colors each by its class. Everything else —
 * the status filter, naming, grouping by drug — is left to the generic default,
 * which this delegates to rather than restates.
 * classify={(base, med) => base && { ...base, color: colorForClass(med) }}

 */
const classifyIbdMedication: MedicationClassifier = (base, med) => {

    if (!base) {
        return null;
    }

    const classKey = findIbdClass(med);

    if (!classKey) {
        return null;
    }

    const medicationClass = IBD_MEDICATION_CLASS[classKey];

    if (!medicationClass) {
        return null;
    }

    return {
        ...base,
        color: medicationClass.color,
        category: { key: classKey, label: medicationClass.name }
    };
};

export function TimelinePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Preload
      patientId={id}
      resourceTypes={[
        "Patient",
        "Observation",
        "MedicationRequest",
        "Condition",
        "DiagnosticReport",
        "Procedure"
      ]}
      label="Loading timeline resources…"
    >
      <TimelineContent />
    </Preload>
  );
}

function TimelineContent() {
  const { resources } = useClinicalData();

  return (
    <div>
      <div className="card pt-6" style={{ "--cp-timeline-selection-color": "var(--color-slate-400)" } as React.CSSProperties}>
        <IBDSummary />
        <div className="border-b border-stone-200 my-4"/>
        <TimelineChart
          // limitStart={new Date().getTime() - 1000 * 60 * 60 * 24 * 30}
          // limitEnd  ={new Date().getTime() + 1000 * 60 * 60 * 24 * 30}
          // minX={new Date().getTime() - 1000 * 60 * 60 * 24 * 365 * 5}
          // maxX={new Date().getTime()}        

          title={
            <div className="text-sm font-bold tracking-wide my-0 uppercase flex items-center gap-1">
              <CircleSmall className="fill-slate-300" strokeWidth={1} size={20} /> IBD Timeline
            </div>
          }
        >
          <TimelineChart.MedicationsTimeline
            label="IBD Medications"
            legend={categories => <IBDMedicationsLegend categories={categories} />}
            classify={classifyIbdMedication}
          />
          <TimelineChart.ObservationsTimeline
            label="IBD Observations"
            // The context types its resources loosely; this list is keyed by
            // resourceType, so everything in it is an Observation.
            observations={(resources.Observation ?? []) as unknown as Observation[]}
            analytes={IBD_LAB_PANEL}
          />
        </TimelineChart>
      </div>
    </div>
  )
}

/**
 * A key to the class colors, listing only the classes actually on the chart —
 * a patient on two drugs does not need a seven-entry key.
 *
 * Rendered in {@link IBD_MEDICATION_CLASS} order rather than the order the
 * medications happened to arrive in, so the key reads the same every time.
 *
 * Styled with library classes rather than the docs app's utility classes, since
 * this component is meant to be lifted into another project.
 */
export function IBDMedicationsLegend({ categories }: { categories: MedicationLegendEntry[] }) {
    const present = new Set(categories.map(category => category.key));

    return (
        <>
            { Object.entries(IBD_MEDICATION_CLASS)
                .filter(([key]) => present.has(key))
                .map(([key, { name, color }]) => (
                    <span className="cp-timeline-legend-item" key={key}>
                        <span className="cp-timeline-legend-swatch" style={{ background: color }} />
                        {name}
                    </span>
                ))
            }
        </>
    );
}
