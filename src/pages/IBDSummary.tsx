import { useEffect, useState }                   from "react"
import { CircleSmall }                           from "lucide-react";
import { Loader, SourceDialog, useClinicalData } from "clinical-primitives"


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

const MOCK_SUMMARY_RESPONSE: SummaryResponse = {
  "subject_ref": "Patient/9f3abec7a25dfc956460961263e681e6c01eafa5739434d81b8bb905c26a66ea",
  "fields": {
    "ibd_type": {
      "label": "IBD Type",
      "value": "CD",
      "category": "Overview",
      "description": ""
    },
    "diagnosis_date": {
      "label": "IBD Diagnosis Date",
      "value": "2019-09-23",
      "category": "Overview",
      "description": ""
    },
    "paris_classification": {
      "label": "Paris Classification",
      "value": {
        "paris_age_group": "A1A",
        "paris_cd_location_ever": "L3",
        "paris_cd_l4a_ever": null,
        "paris_cd_l4b_ever": "PRESENT",
        "paris_cd_behavior_ever": "B3",
        "paris_cd_perianal_ever": null,
        "paris_uc_extent_ever": null,
        "paris_uc_severity_ever": null,
        "paris_growth_ever": "G1",
        "source_refs": [
          "DocumentReference/6013df1fdb612dc1c920a7b8eedec991abf4cda3abab525d85d8da16abfd047e",
          "DocumentReference/9c2a3f509e86b386d74f029ebe937a2b46e057c94c4cbabaed5dede37d472ce2",
          "DocumentReference/3ae83b0e0566315a29695cd7f3e4140a22a5e67433e947c8d76498a7366101ea",
          "DocumentReference/3a10a41760967fdccccb8646a40ae705e09aa6b747b474e389e8ecc876e40bda",
          "DocumentReference/65505905a04657de6fc79c205533c62afdbfd63101ef04ada6e38d9d88428d7b",
          "DocumentReference/5b4d15835c1b7b793478274c7b0f796fbbdca2eaccd64f9dbc704183b7e63df2",
          "DocumentReference/d28b361f1cc99325c89acab5e9bfc808f24916a76cb0a8e2fa63edafec3a335c",
          "DocumentReference/2efa83faa9c6e462c9976d48fe731de2f2b5e380d5a7fde8ac5f9f15cca5f62a",
          "DocumentReference/1a616d8548f49921db05824b3783ec45fce35221e8d6d4d4fe47bf6543663c44",
          "DocumentReference/f4ec1d595a2bd8a783bcbffdd4b4746f07de51b7e7224151a52f170355db6648",
          "DocumentReference/b19806821ecb4b56ff421d4b2b1f207f43b1918a209bcf5701c9953b7c19dd05",
          "DocumentReference/5305e454b55e55fbc71e2228725a3bd0d347ce05af68aa9b6d04635dd20bca2c",
          "DocumentReference/07f2143900e693702861daeaae79f48428c449a7edf01b819d63efdc313fc61e",
          "DocumentReference/58f3f3e5bea4276602875d3327c2e87a5a0b1de83cbebea8cf660a22f3d4e9a2",
          "DocumentReference/e0b20bb2f8cf52123e27e6b609d248bfab3ac8283971fba051b7400d87bfd8c9",
          "DocumentReference/9ddfbfecc100770b022774d93cafa65c936b3061e0044a54caf0f3f05d452941",
          "DocumentReference/ce293e1da82bc4865560ee8c850d5cc4f2625553af57d7960bd73e5cdf87b2eb",
          "DocumentReference/ed8447cfd755fca77fb55f7eddb3aa8491623e9350b4d158047f5db1c54eae0a",
          "DocumentReference/702ac7f133ac9254eac26239d43058ec41ea16366ad906528d595374db4b5258",
          "DocumentReference/adeed5799f432d912dad2190e61c940392933e18ca09b0a4a02376c11620602b",
          "DocumentReference/88b29593366e5e110f78723b8a7431b7b1022320b44e7bcd5a7efea641ef6a9a",
          "DocumentReference/edba561d939f1ff65a3dff16c8b585f93b73f58fc5413c0c24201ae44cebd898",
          "DocumentReference/c4dea8c6e71b4f3ee115a496ec5e52062fc353328e2ef8688a511ac836d15324",
          "DocumentReference/1fc30eb8d87e702469c48844318051ea77e15f3aefdd634ed2650173416de885",
          "DocumentReference/5b87a2b5122b6e99b8c209e6667b21e44a12a44fe8368dd3f3f342679c98d107",
          "DocumentReference/6a9fe15e5c36e2cd6a47d7d4b81cd29fe4474b6587e62f05d7f9cdfe44fb6957",
          "DocumentReference/9d4fce608e01f471054f4ad6e76868869d70367a575bf685b39feaa6d1279b97",
          "DocumentReference/7468073a96d9726709677979f4f50c80531bc9ce17cb66154f7bf327d709bc8d",
          "DocumentReference/ac291c7c794bcc6b050199a093ee682c48666510919ee347192f77cd19bb2f77",
          "DocumentReference/c1ac866b31e01927dc315f259738669abbef8caf346496de604fb3e067e364bb",
          "DocumentReference/93e27e9fd85ac6545091e5e2f27ac116db37d57b543549a9c53d7d002d1d954e",
          "DocumentReference/62d026ff6f1e884c0de7e6d6ddc110e94098be217ee9ebb7a100c11d482bcea2",
          "DocumentReference/96fd9c30b68076c73bab27617e21ed0fb5b5bc0e2f4e727449ee13ecac44f541",
          "DocumentReference/397c0a7b40cb90aa0d18b634054c436ca8672a7119df97b66ef30f5be8cc3954",
          "DocumentReference/5a0b29ce2f2b47427de66b330c19d045c10fd5ec97add090104a52bfc9685582"
        ]
      },
      "category": "Overview",
      "description": "",
      "value_display": "A1A L3 B3 G1",
    },
    "endoscopy_details": {
      "label": "Endoscopy Details",
      "value": {
        "note_author_date": "2020-08-01",
        "sescd_total": 17,
      },
      "source_refs": ["DocumentReference/88b29593366e5e110f78723b8a7431b7b1022320b44e7bcd5a7efea641ef6a9a"],
      "category": "Overview",
      "description": ""
    },
    "activity_index": {
      "label": "Activity Index",
      "value": {
        "index_name": "PCDAI",
        "score_date": "2026-07-24",
        "score": 5,
        "band": "remission",
      },
      "source_refs": ["DocumentReference/96fd9c30b68076c73bab27617e21ed0fb5b5bc0e2f4e727449ee13ecac44f541"],
      "category": "Overview",
      "description": "",
      "value_display": "PCDAI 5 (remission)"
    },
    "abdominal_pain": {
      "label": "Abdominal Pain",
      "value": {
        "note_author_date": "2026-06-08",
        "abdominal_pain": "MODERATE_OR_SEVERE",
      },
      "source_refs": ["DocumentReference/7468073a96d9726709677979f4f50c80531bc9ce17cb66154f7bf327d709bc8d"],
      "category": "Current Symptoms",
      "value_display": "Moderate or severe",
      "description": "Moderate or severe pain recorded on 2026-06-08"
    },
    "stool_frequency": {
      "label": "Stool Frequency",
      "value": null,
      "category": "Current Symptoms",
      "description": ""
    },
    "weight_loss": {
      "label": "Weight Loss",
      "value": {
        "event_date": "2019-10-13",
        "value_text": "Failure to thrive (child)",
        "code": "R62.51",
      },
      "source_refs": ["Condition/6c1c8eb7ae817d93c27a48b3390743a7b107463dd2fbbede756cea9ece83e182"],
      "category": "Current Symptoms",
      "value_display": "R62.51: Failure to thrive (child)",
      "description": ""
    },
    "nocturnal_stool": {
      "label": "Nocturnal Stool",
      "value": {
        "note_author_date": "2026-07-24",
        "nocturnal_stools": "NONE",
        "stools_per_day": "NOT_ASSESSED",
      },
      "source_refs": ["DocumentReference/96fd9c30b68076c73bab27617e21ed0fb5b5bc0e2f4e727449ee13ecac44f541]"],
      "category": "Current Symptoms",
      "value_display": "None",
      "description": ""
    },
    "last_pcdai": {
      "label": "Last PCDAI",
      "value": {
        "event_date": "2026-07-24",
        "pcdai_total": 5,
      },
      "value_display": "PCDAI 5",
      "source_refs": ["DocumentReference/96fd9c30b68076c73bab27617e21ed0fb5b5bc0e2f4e727449ee13ecac44f541"],
      "category": "Current Symptoms",
      "description": ""
    },
    "steroid_exposure": {
      "label": "Steroid Exposure",
      "value": {
        "steroid_exposed_bool": true,
        "first_steroid_date": "2019-10-13",
        "last_steroid_date": "2026-06-20",
      },
      "source_refs": [
        "DocumentReference/adeed5799f432d912dad2190e61c940392933e18ca09b0a4a02376c11620602b",
        "DocumentReference/07f2143900e693702861daeaae79f48428c449a7edf01b819d63efdc313fc61e",
        "DocumentReference/c1ac866b31e01927dc315f259738669abbef8caf346496de604fb3e067e364bb",
        "DocumentReference/58f3f3e5bea4276602875d3327c2e87a5a0b1de83cbebea8cf660a22f3d4e9a2",
        "DocumentReference/ed8447cfd755fca77fb55f7eddb3aa8491623e9350b4d158047f5db1c54eae0a",
        "DocumentReference/9ddfbfecc100770b022774d93cafa65c936b3061e0044a54caf0f3f05d452941",
        "DocumentReference/e0b20bb2f8cf52123e27e6b609d248bfab3ac8283971fba051b7400d87bfd8c9",
        "DocumentReference/b19806821ecb4b56ff421d4b2b1f207f43b1918a209bcf5701c9953b7c19dd05",
        "MedicationRequest/8ad26eb342d588a7dd589a54d2501c28a622c1b1262989c3b1112021f04a8b5e",
        "MedicationRequest/bd0a0658d244728eb69953748c8538335a48fb1594f2c1248986c200585dca95",
        "MedicationRequest/0b0754a1d58cf50020e440cc2cdab0148a00aea74c81a9ab3f23e46b722d420a",
        "MedicationRequest/57cdd8dbab88ec71e515eca72e6ae9cdff130f1b817a2edec205d0a13a9dee7d",
        "MedicationRequest/4c5e49ab2911038993eef35a9708a6ac4748abf6464a70e989fdb025843b2b87",
        "DocumentReference/62d026ff6f1e884c0de7e6d6ddc110e94098be217ee9ebb7a100c11d482bcea2",
        "DocumentReference/6013df1fdb612dc1c920a7b8eedec991abf4cda3abab525d85d8da16abfd047e",
        "DocumentReference/c4dea8c6e71b4f3ee115a496ec5e52062fc353328e2ef8688a511ac836d15324",
        "DocumentReference/7468073a96d9726709677979f4f50c80531bc9ce17cb66154f7bf327d709bc8d",
        "DocumentReference/2efa83faa9c6e462c9976d48fe731de2f2b5e380d5a7fde8ac5f9f15cca5f62a",
        "MedicationRequest/5511e5aa74ce1592868c9d53336ad69dcdf1728adc08784403215be1b40485b1",
        "MedicationRequest/f05bcc28d081fb0a86161bb9f448e4a0a820c01f7431ecb553dfdf2aaa806c30",
        "MedicationRequest/71e7717f09355c34ff9585c68d52e70b948600b3d68909ffa9679c1c4a3d2f1c"
      ],
      "category": "Key Facts",
      "description": ""
    },
    "prior_surgery": {
      "label": "Prior Surgery",
      "value": {
        "prior_surgery_bool": false,
        "first_qualifying_surgery_date": null,
        "first_qualifying_surgery_type": null,
      },
      "source_refs": [],
      "category": "Key Facts",
      "description": ""
    },
    "perianal_disease": {
      "label": "Perianal Disease",
      "value": {
        "paris_cd_perianal_ever": null,
        "latest_coded_perianal_date": null,
      },
      "source_refs": [],
      "category": "Key Facts",
      "description": "",
      "value_display": "Never detected"
    }
  }
};

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
      <td
        className={
          "ms-3 text-nowrap" +
          (tooltip ? " underline underline-offset-3 decoration-stone-200 decoration-dotted hover:decoration-stone-400" : "") +
          (status === "good" ? " text-green-600" : status === "bad" ? " text-amber-600" : "") +
          (field.source_refs?.length ? " cursor-pointer" : "")
        }
        data-tooltip={tooltip || null}
        onClick={() => field.source_refs?.length && openDialog(field.source_refs)}>
        { _value + "" }
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
  const [selectedResource, setSelectedResource] = useState<object | null>(null);
  const { resources } = useClinicalData();
  const [response, setResponse] = useState<typeof MOCK_SUMMARY_RESPONSE | null>(null);

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
