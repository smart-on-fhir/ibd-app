import { useEffect, useState, type ReactNode }   from "react"
import { CircleSmall }                           from "lucide-react";
import { Loader, SourceDialog, useClinicalData } from "clinical-primitives"


interface Field {
  value: any;
  category: string;
  label?: string;
  value_display?: string;
  description?: string;
  sourceRefs?: string[];
  loading?: boolean;
}

interface SummaryResponse {
  subject_ref?: string;
  fields: Record<string, Field>;
}

const MOCK_SUMMARY_RESPONSE: SummaryResponse = {
  
  "subject_ref": "Patient/Jimmy858-Kristina583-Kutch271",

  "fields": {

    // DIAGNOSIS ---------------------------------------------------------------
    
    "ibd_type": {
      "category": "diagnosis",
      
      "value": "CD", // CD | UC | IBDU
      
      // [OPTIONAL] Human-readable field label. If not set, apps may infer it
      // from the key name or use a hard-coded value.
      "label": "IBD Type", 
      
      // [OPTIONAL] Human-readable display value for the IBD type. If not set,
      // apps may infer it from the value field.
      // Can be Crohn's Disease | Ulcerative Colitis | Unclassified
      "value_display": "Crohn's Disease",

      // [OPTIONAL] Longer description prose (markdown enabled)
      "description": "Based on 358 Condition resources, the most specific subtype identified is Crohn's disease.",

      // [OPTIONAL] Zero or more references to the source resources from which
      // this field was derived. If provided, the app can show these FHIR
      // resources in a dedicated source viewer. In this case, IBD Type may
      // have been from Condition, or a DocumentReference note, whichever
      // happened earlier.
      "sourceRefs": [

        // If detected in condition
        "Condition/7d419faf-4eb8-5194-998c-58636bfc123a",

        // If detected in a document reference note
        "DocumentReference/7d419faf-4eb8-5194-998c-58636bfc123a"
      ]
    },
    
    "diagnosis_date": {
      "value": "2018-03-24T00:00:00",
      "category": "diagnosis",
      "description": "Used 21 condition resources to determine the diagnosis date. The computed duration is based on the interval between the earliest onset date and the current date.",
      "sourceRefs": [
        "Condition/d0d87c42-00c8-5a28-bff2-f76dc5c571c8"
      ]
    },

    "paris_class": {
      "value": "L3 B1 G0",
      "category": "diagnosis",
      "label": "Paris Classification"
    },

    "endoscopy": {
      "value": "Sep 2024, SEC-CD 8",
      "category": "diagnosis",
      "label": "Latest Endoscopy"
    },

    "activity_index": {
      "value": "HBI 9 (moderate)",
      "category": "diagnosis",
      "label": "Activity Index"
    },

    // CURRENT SYMPTOMS --------------------------------------------------------

    "abdominal_pain": {
      "value": "moderate",
      "value_display": "Moderate",
      "category": "symptoms",
    },

    "stool_frequency": {
      "value": "5/day",
      "category": "symptoms",
      "label": "Stool Frequency"
    },

    "weight_loss": {
      "value": "3.2kg",
      "category": "symptoms",
      "label": "Weight Loss"
    },

    "nocturnal_stool": {
      "value": true,
      "value_display": "Yes",
      "category": "symptoms",
      "label": "Nocturnal Stool"
    },

    "last_pcdai_value": {
      "value": "32 moderate",
      "category": "symptoms"
    },

    "last_pcdai_date": {
      "value": "2025-05-24T00:00:00",
      "category": "symptoms"
    },

    // KEY FACTS ---------------------------------------------------------------
    
    "steroid_exposure": {
      "value": true,
      "category": "facts",
      "label": "Steroid Exposure",
      "description": "Steroid exposure detected based on 2 medications. 532 medication records reviewed.",
      "sourceRefs": [
        "MedicationRequest/6ba40a42-1b93-5579-90cd-80c055423f5e",
        "MedicationRequest/27984c11-c120-501a-aaae-d8f64ed9a9f8"
      ]
    },

    // FIXME: IMPOSSIBLE FOR NOW
    // "medication_adherence": {
    //   "value": "good",
    //   "category": "facts",
    //   "label": "Adherence",
    //   "value_display": "Good"
    // },
  
    "prior_surgery_date": {
      "value": "2020-04-18T00:00:00",
      "category": "facts",
      "sourceRefs": [
        "Procedure/afea2f4f-da98-5cd6-bbea-accaa00b3186"
      ]
    },

    "prior_surgery_type": {
      "value": "COLECTOMY",
      "category": "facts",
      "sourceRefs": [
        "Procedure/afea2f4f-da98-5cd6-bbea-accaa00b3186"
      ]
    },

    "perianal_disease": {
      "value": false,
      "category": "facts",
      "label": "Perianal Disease",
      "description": "**Perianal disease not detected.**\n\nBased on ICD codes and text descriptions, we didn't find evidence of perianal disease.",
      "sourceRefs": []
    }
  }
};

function durationSince(date: Date): string {
    const now    = Date.now();
    const months = Math.floor((now - date.getTime()) / (1000 * 60 * 60 * 24 * 30.44));

    if (months <  1) return 'Less than 1 month';
    if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;

    const years = Math.floor(months / 12);
    const rem   = months % 12;
    return rem === 0 ?
        `${years} year${years === 1 ? '' : 's'}` :
        `${years} year${years === 1 ? '' : 's'}, ${rem} month${rem === 1 ? '' : 's'}`;
}

function SummaryRow({ field, defaults, status, openDialog }: {
  field: Field,
  defaults: {
    label: ReactNode,
    tooltip?: string | null,
    render?: (field: Field) => string
  },
  status?: "good" | "bad",
  openDialog: (refs: string[]) => void
}) {

  if (!field) return null;

  const label   = field.label       || defaults.label;
  
  let value = defaults.render ? defaults.render(field) : (field.value_display || field.value);
  if (value === true ) value = "Yes";
  if (value === false) value = "No";
  if (value === null ) value = "Unknown";
  
  const tooltip = field.description || defaults.tooltip || null;

  return (
    <tr>
      <td className="text-stone-500 opacity-80 pe-2">{ label }</td>
      <td
        className={
          "ms-3 text-nowrap" +
          (tooltip ? " underline underline-offset-3 decoration-stone-200 decoration-dotted hover:decoration-stone-400" : "") +
          (status === "good" ? " text-green-600" : status === "bad" ? " text-amber-600" : "") +
          (field.sourceRefs?.length ? " cursor-pointer" : "")
        }
        data-tooltip={tooltip || null}
        onClick={() => field.sourceRefs?.length && openDialog(field.sourceRefs)}>
        { value === true ? "Yes" : value === false ? "No" : value === null ? "Unknown" : value }
      </td>
    </tr>
  )
}

async function getSummaryResponse(): Promise<typeof MOCK_SUMMARY_RESPONSE> {
  return new Promise(resolve => setTimeout(() => resolve(MOCK_SUMMARY_RESPONSE), 5000));
}

/**
 * Expects its resources to be already loaded — see the `<Preload>` in
 * TimelinePage, which is the only place this is rendered.
 */
export function IBDSummary() {
  const [open, setOpen] = useState(false);
  const [selectedResource, setSelectedResource] = useState<any>(null);
  const { resources } = useClinicalData();
  const [response, setResponse] = useState<typeof MOCK_SUMMARY_RESPONSE | null>(null);


  const openDialog = (refs: string[] = []) => {
    if (!refs.length) return;
    const collection: any[] = refs.map(r => {
      const [type, id] = r.split('/');
      return resources[type]?.find((res: any) => res.id === id);
    }).filter(Boolean);

    if (!collection.length) return;

    if (collection.length > 1) {
      const obj: any = {}
      collection.forEach(item => {
        const key = item.resourceType + "/" + item.id;
        if (!obj[key]) obj[key] = item;
      });
      setSelectedResource(obj);
    }
    else {
      setSelectedResource(collection[0]);
    }
    setOpen(true);
  };

  useEffect(() => {
    getSummaryResponse().then(response => {
      setResponse(response);
    });
  }, []);
  

  if (!response) return <Loader centered msg="Loading patient summary..." />;

  const { fields } = response;
  

  return (
    <div>
      <div className="flex justify-between gap-6 flex-wrap mb-6">
        <div className="text-sm flex-auto">
          <h4 className="font-bold tracking-wide my-0 flex items-center gap-1">
            <div><CircleSmall className="fill-slate-300 -ms-1" strokeWidth={1} size={20} /></div>
            <div>DIAGNOSIS</div>
          </h4>
          
          <table className="border-separate border-spacing-1">
            <tbody>
              <SummaryRow field={fields.ibd_type}       defaults={{ label: "IBD Type" }}         openDialog={openDialog} />
              <SummaryRow field={fields.diagnosis_date} defaults={{ label: "Duration", render: (field) => durationSince(new Date(field.value)) }} openDialog={openDialog} />
              <SummaryRow field={fields.paris_class}    defaults={{ label: "Paris Class" }}      openDialog={openDialog} />
              <SummaryRow field={fields.endoscopy}      defaults={{ label: "Latest Endoscopy" }} openDialog={openDialog} />
              <SummaryRow field={fields.activity_index} defaults={{ label: "Activity Index" }}   openDialog={openDialog} />
            </tbody>
          </table>
        </div>
        <div className="text-sm flex-auto">
          <h4 className="font-bold tracking-wide my-0 flex items-center gap-1">
            <div><CircleSmall className="fill-slate-300 -ms-1" strokeWidth={1} size={20} /></div>
            <div>CURRENT SYMPTOMS</div>
          </h4>
          <table className="border-separate border-spacing-1">
            <tbody>
              <SummaryRow field={fields.abdominal_pain}  defaults={{ label: "Abdominal Pain" }}  openDialog={openDialog} />
              <SummaryRow field={fields.stool_frequency} defaults={{ label: "Stool Frequency" }} openDialog={openDialog} />
              <SummaryRow field={fields.weight_loss}     defaults={{ label: "Weight Loss" }}     openDialog={openDialog} />
              <SummaryRow field={fields.nocturnal_stool} defaults={{ label: "Nocturnal Stool" }} openDialog={openDialog} />
              <SummaryRow field={fields.last_pcdai_date} defaults={{
                label: "Last PCDAI",
                render: (field) => {
                  return[
                    field.value ? new Date(field.value).toLocaleDateString(undefined, { year: 'numeric', month: 'long' }) : null,
                    fields.last_pcdai_value?.value_display || fields.last_pcdai_value?.value
                  ].filter(Boolean).join(", ")
                }
              }} openDialog={openDialog} />
            </tbody>
          </table>
        </div>
        <div className="text-sm flex-auto">
          <h4 className="font-bold tracking-wide my-0 flex items-center gap-1">
            <div><CircleSmall className="fill-slate-300 -ms-1" strokeWidth={1} size={20} /></div>
            <div>KEY FACTS</div>
          </h4>
          <table className="border-separate border-spacing-1">
            <tbody>
              <SummaryRow field={fields.steroid_exposure} defaults={{ label: "Steroid Exposure" }} openDialog={openDialog} status={fields.steroid_exposure.value ? "bad" : "good"} />
              <SummaryRow field={fields.medication_adherence} defaults={{ label: "Medication Adherence" }} openDialog={openDialog} />
              <SummaryRow
                field={fields.prior_surgery_date}
                defaults={{
                  label: "Prior Surgery", render: field => field.value ? "Yes" : "Unknown",
                  tooltip: fields.prior_surgery_date.value ? 
                    `Based on the available records, a surgery of type ${fields.prior_surgery_type?.value || 'Unknown' } was performed in April ${new Date(fields.prior_surgery_date.value).toLocaleString('default', { month: 'long', year: 'numeric' })}.`
                    : null
                }}
                openDialog={openDialog}
                status={fields.prior_surgery_date.value ? "bad" : "good"}
              />
              <SummaryRow field={fields.perianal_disease} defaults={{ label: "Perianal Disease" }} openDialog={openDialog} status={fields.perianal_disease.value ? "bad" : "good"} />
            </tbody>
          </table>
        </div>
      </div>
      <SourceDialog open={open} onClose={() => setOpen(false)} resource={selectedResource} />
    </div>
  )
}
