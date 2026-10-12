import { useEffect, useState }                   from "react"
import { CircleSmall }                           from "lucide-react";
import { Loader, SourceDialog, useClinicalData } from "clinical-primitives"
import { getPatientSummary }                     from "../api/ihl";


/** A single value a summary field reports. */
type FieldScalar = string | number | boolean | null;

interface Field {
  /** Either one value, or named values — with the sources that support them, for some fields. */
  value: FieldScalar | Record<string, FieldScalar | string[]>;
  category: string;
  label?: string;
  value_display?: string;
  description?: string;
  loading?: boolean;
  source_refs?: string[];
}

interface SummaryResponse {
  subject_ref?: string;
  fields: Record<string, Field>;
}

/**
 * One named value of a field whose value is an object. Undefined for a field
 * with a single value, a missing name, or a name holding a list.
 */
function valueProp(field: Field | undefined, key: string): FieldScalar | undefined {
  const value = field?.value;
  if (value === null || typeof value !== "object") return undefined;
  const prop = value[key];
  return Array.isArray(prop) ? undefined : prop;
}

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

function SummaryRow({
  field,
  value         = field.value,
  value_display = field.value_display,
  label         = field.label,
  tooltip       = field.description,
  status,
  render,
  openDialog,
}: {
  field         : Field,
  label        ?: Field["label"],
  value        ?: Field["value"],
  value_display?: Field["value_display"],
  tooltip      ?: Field["description"],
  render       ?: (field: Field) => string
  status       ?: "good" | "bad",
  openDialog    : (refs: string[]) => void
}) {

  if (!field) return null;
  
  let _value = render ? render(field) : (value_display || value);
  if (_value === true ) _value = "Yes";
  if (_value === false) _value = "No";
  if (_value === null ) _value = "Unknown";

  return (
    <tr>
      <td className="text-stone-500 opacity-80 pe-2">{ label }</td>
      <td>
        <span
          data-tooltip={tooltip || null}
          onClick={() => field.source_refs?.length && openDialog(field.source_refs)}
          className={
            "ms-1 text-nowrap" +
            (tooltip ? " underline underline-offset-3 decoration-stone-200 decoration-dotted hover:decoration-stone-400" : "") +
            (status === "good" ? " text-green-600" : status === "bad" ? " text-amber-600" : "") +
            (field.source_refs?.length ? " cursor-pointer" : "")
          }
        >
          { _value + "" }
        </span>
      </td>
    </tr>
  )
}

/**
 * Summaries requested so far, by patient. Shared so that mounting again reuses
 * the request rather than repeating it: React's StrictMode mounts every
 * component twice in development, and returning to the timeline remounts this
 * one. A failed request is dropped, so the next mount tries again.
 */
const summaries = new Map<string, ReturnType<typeof getPatientSummary>>();

function loadPatientSummary(patientId: string): ReturnType<typeof getPatientSummary> {
  let summary = summaries.get(patientId);
  if (!summary) {
    summary = getPatientSummary(patientId);
    summary.catch(() => summaries.delete(patientId));
    summaries.set(patientId, summary);
  }
  return summary;
}

/**
 * Expects its resources to be already loaded — see the `<Preload>` in
 * TimelinePage, which is the only place this is rendered.
 */
export function IBDSummary() {
  const [open, setOpen] = useState(false);
  const [selectedResource, setSelectedResource] = useState<object | null>(null);
  // @ts-ignore
  const { resources, patient } = useClinicalData();
  const [response, setResponse] = useState<SummaryResponse | null>(null);

  const openDialog = (refs: string[] = []) => {
    if (!refs.length) return;
    const collection = refs.map(r => {
      const [type, id] = r.split('/');
      return resources[type]?.find(res => res.id === id);
    }).filter(res => res !== undefined);

    if (!collection.length) return;

    if (collection.length > 1) {
      const obj: Record<string, object> = {}
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

  // Once per mount. Without the dependency list this ran after every render,
  // re-requesting the summary each time its own response arrived.
  useEffect(() => {
    let cancelled = false;
    // loadPatientSummary(patient!.id!).then(response => {
    loadPatientSummary("5ee7fbf3da3037ce4f693e6fbc73ba4c02bb6dd8cd47c07cea050a4d2fd0b080").then(response => {
      if (!cancelled) setResponse(response);
    });
    return () => { cancelled = true; };
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
              <SummaryRow field={fields.ibd_type}             openDialog={openDialog} />
              <SummaryRow field={fields.diagnosis_date}       openDialog={openDialog} label="Duration" render={(field) => durationSince(new Date(field.value + ""))} />
              <SummaryRow field={fields.paris_classification} openDialog={openDialog} label="Paris Class" />
              <SummaryRow
                field={fields.endoscopy_details}
                openDialog={openDialog}
                label="Latest Endoscopy"
                render={(field) => new Date(valueProp(field, 'note_author_date') as string).toLocaleDateString(undefined, { year: 'numeric', month: 'long' }) + ' SES-CD ' + valueProp(field, 'sescd_total')}
                tooltip={fields.endoscopy_details?.description || "**Endoscopic Activity Score**\nSimple endoscopic score for Crohn's disease (SES-CD)\n\n- **0-2** = inactive\n- **3-6** = mild\n- **7-15** = moderate\n- **≥16** = severe."}
              />
              <SummaryRow field={fields.activity_index} label="Activity Index"   openDialog={openDialog} />
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
              <SummaryRow field={fields.abdominal_pain}  label="Abdominal Pain"  openDialog={openDialog} />
              <SummaryRow field={fields.stool_frequency} label="Stool Frequency" openDialog={openDialog} />
              <SummaryRow field={fields.weight_loss}     label="Weight Loss"     openDialog={openDialog} />
              <SummaryRow field={fields.nocturnal_stool} label="Nocturnal Stool" openDialog={openDialog} />
              <SummaryRow field={fields.last_pcdai}      label="Last PCDAI"      openDialog={openDialog} render={(field) => {
                  return[
                    field.value ? new Date(valueProp(field, 'event_date') as string).toLocaleDateString(undefined, { year: 'numeric', month: 'long' }) : null,
                    valueProp(field, 'pcdai_total')
                  ].filter(Boolean).join(", ")
                }
              } />
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
              <SummaryRow
                field={fields.steroid_exposure}
                openDialog={openDialog}
                status={valueProp(fields.steroid_exposure, 'steroid_exposed_bool') ? "bad" : "good"}
                value={valueProp(fields.steroid_exposure, 'steroid_exposed_bool')}
                tooltip={fields.steroid_exposure.description || [
                  valueProp(fields.steroid_exposure, 'first_steroid_date') ? '- First steroid exposure - ' + new Date(valueProp(fields.steroid_exposure, 'first_steroid_date') as string).toLocaleDateString(undefined, { year: 'numeric', month: 'long' }) : null,
                  valueProp(fields.steroid_exposure, 'last_steroid_date') ? '- Last steroid exposure - ' + new Date(valueProp(fields.steroid_exposure, 'last_steroid_date') as string).toLocaleDateString(undefined, { year: 'numeric', month: 'long' }) : null,
                ].filter(Boolean).join("\n") }
              />
              <SummaryRow
                field={fields.prior_surgery}
                value={valueProp(fields.prior_surgery, 'prior_surgery_bool')}
                status={valueProp(fields.prior_surgery, 'prior_surgery_bool') ? "bad" : "good"}
                tooltip={valueProp(fields.prior_surgery, 'prior_surgery_bool') ? 
                    [
                      `Based on the available records, a surgery`,
                      valueProp(fields.prior_surgery, 'first_qualifying_surgery_type') ? ` of type ${valueProp(fields.prior_surgery, 'first_qualifying_surgery_type')}` : null,
                      ` was performed`,
                      valueProp(fields.prior_surgery, 'first_qualifying_surgery_date') ? ` in ${new Date(valueProp(fields.prior_surgery, 'first_qualifying_surgery_date') as string).toLocaleString('default', { month: 'long', year: 'numeric' })}.` : null
                    ].filter(Boolean).join(" ")
                    : `No prior surgery recorded`
                }
                openDialog={openDialog}
              />
              <SummaryRow field={fields.perianal_disease} openDialog={openDialog} status={valueProp(fields.perianal_disease, 'latest_coded_perianal_date') ? "bad" : "good"} />
            </tbody>
          </table>
        </div>
      </div>
      <SourceDialog open={open} onClose={() => setOpen(false)} resource={selectedResource ?? {}} />
    </div>
  )
}
