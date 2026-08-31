import { useMemo, useState }             from "react"
import { PatientRecord }                 from "../modules/ibd/PatientRecord"
import { SourceDialog, useClinicalData } from "clinical-primitives"



export function IBDSummary() {
  const { resources } = useClinicalData();
  const [open, setOpen] = useState(false);
  const [selectedResource, setSelectedResource] = useState<any>(null);

  const patientRecord = useMemo(
    () => (resources ? new PatientRecord(resources) : null),
    [resources],
  )

  const openDialog = (resource: any) => {

    const resourceCount = Object.keys(resource ?? {}).reduce((acc, key) => {
      return acc + (resource[key]?.length ?? 0);
    }, 0);

    if (resourceCount === 0) return;

    setSelectedResource(resourceCount === 1 ? resource[Object.keys(resource)[0]]![0] : resource);
    setOpen(true);
  };

  if (!patientRecord) return null

  // const latestEndoscopy = patientRecord.latestEndoscopy

  // console.log(latestEndoscopy)

  const IBD_TYPE = patientRecord.ibdSubtype.value + "" === "CD" ?
    "Crohn's Disease" :
    patientRecord.ibdSubtype.value + "" === "UC" ?
      "Ulcerative Colitis" :
      patientRecord.ibdSubtype.value + "" === "IBDU" ?
        "Unclassified" :
        patientRecord.ibdSubtype + "";

  
  return (
    <div className="p-6">

      <div className="card bg-white rounded border border-stone-200 shadow-xs">
        <h3 className="px-3 py-2">IBD Summary</h3>
        <div className="border-t border-stone-200 p-3 flex justify-between gap-6 flex-wrap">
          <div className="text-sm flex-auto">
            <h4 className="font-bold text-sky-600 tracking-wide my-0">DIAGNOSIS</h4>
            
            <div className="mt-2 flex flex-wrap">
              <span className="text-stone-500 opacity-80">IBD Type</span>
              <span
                className="ms-3 text-nowrap"
                data-tooltip={'**' + IBD_TYPE + '**\n\n' + patientRecord.ibdSubtype.evidence}
                onClick={() => openDialog(patientRecord.ibdSubtype.resources)}
              >{ IBD_TYPE }</span>
            </div>
            
            { patientRecord.diseaseDuration.value && 
              <div className="mt-2 flex flex-wrap">
                <span className="text-stone-500 opacity-80">Duration</span>
                <span
                  className="ms-3 text-nowrap"
                  data-tooltip={[
                    '**' + patientRecord.diseaseDuration.value + '**',
                    patientRecord.diagnosisDate.value ? 'Since: ' + patientRecord.diagnosisDate.value.toLocaleDateString() : null,
                    patientRecord.diseaseDuration.evidence
                  ].filter(Boolean).join('\n\n')}
                  onClick={() => openDialog(patientRecord.diseaseDuration.resources)}
                >{ patientRecord.diseaseDuration.value }</span>
              </div> }

            <div className="mt-2 flex flex-wrap">
              <span className="text-stone-500 opacity-80">Paris Class</span>
              <span className="ms-3 text-nowrap text-purple-500">L3 B1 G0</span>
            </div>
            <div className="mt-2 flex flex-wrap">
              <span className="text-stone-500 opacity-80">Endoscopy</span>
              <span className="ms-3 text-nowrap text-purple-500">Sep 2024, SEC-CD 8</span>
            </div>
            <div className="mt-2 flex flex-wrap">
              <span className="text-stone-500 opacity-80">Activity Index</span>
              <span className="ms-3 text-nowrap text-purple-500">HBI 9 (moderate)</span>
            </div>
          </div>
          <div className="text-sm flex-auto">
            <h4 className="font-bold text-sky-600 tracking-wide my-0">CURRENT SYMPTOMS</h4>
            <div className="mt-2 flex flex-wrap">
              <span className="text-stone-500 opacity-80">Abdominal Pain</span>
              <span className="ms-3 text-nowrap text-purple-500">Moderate</span>
            </div>
            <div className="mt-2 flex flex-wrap">
              <span className="text-stone-500 opacity-80">Stool Frequency</span>
              <span className="ms-3 text-nowrap text-purple-500">5/day</span>
            </div>
            <div className="mt-2 flex flex-wrap">
              <span className="text-stone-500 opacity-80">Weight Loss</span>
              <span className="ms-3 text-nowrap text-purple-500">3.2kg</span>
            </div>
            <div className="mt-2 flex flex-wrap">
              <span className="text-stone-500 opacity-80">Nocturnal Stool</span>
              <span className="ms-3 text-nowrap text-purple-500">Yes</span>
            </div>
            <div className="mt-2 flex flex-wrap">
              <span className="text-stone-500 opacity-80">Last PCDAI</span>
              <span className="ms-3 text-nowrap text-purple-500">May 2025, 32&nbsp;moderate</span>
            </div>
          </div>
          <div className="text-sm flex-auto">
            <h4 className="text-xs font-bold text-sky-600 tracking-wide my-0">KEY FACTS</h4>
            <div className="mt-2 flex flex-wrap">
              <span className="text-stone-500 opacity-80">Steroid Exposure</span>
              <span
                className="ms-3 text-nowrap"
                data-tooltip={
                  '**' + patientRecord.hasSteroidExposure.description + '**\n\n' +
                  patientRecord.hasSteroidExposure.evidence
                }
                onClick={() => openDialog(patientRecord.hasSteroidExposure.resources)}
              >{ patientRecord.hasSteroidExposure.value ? "Yes" : "No" }</span>
            </div>
            <div className="mt-2 flex flex-wrap">
              <span className="text-stone-500 opacity-80">Adherence</span>
              <span className="ms-3 text-nowrap text-purple-500">Good</span>
            </div>
            <div className="mt-2 flex flex-wrap">
              <span className="text-stone-500 opacity-80">Prior Surgery</span>
              <span
                className="ms-3 text-nowrap"
                data-tooltip={
                  '**' + patientRecord.hasPriorIBDSurgery.description + '**\n\n' +
                  patientRecord.hasPriorIBDSurgery.evidence
                }
                onClick={() => openDialog(patientRecord.hasPriorIBDSurgery.resources)}
              >{ patientRecord.hasPriorIBDSurgery.value ? "Yes" : "No" }</span>
            </div>
            <div className="mt-2 flex flex-wrap">
              <span className="text-stone-500 opacity-80">Perianal Decease</span>
              <span
                className="ms-3 text-nowrap"
                data-tooltip={
                  '**' + patientRecord.hasPerianialDisease.description + '**\n\n' +
                  patientRecord.hasPerianialDisease.evidence
                }
                onClick={() => openDialog(patientRecord.hasPerianialDisease.resources)}
              >
                { patientRecord.hasPerianialDisease.value ? "Yes" : "No" }
              </span>
            </div>
          </div>
        </div>
      </div>
      <br />
      <SourceDialog open={open} onClose={() => setOpen(false)} resource={selectedResource} />
    </div>
  )
}
