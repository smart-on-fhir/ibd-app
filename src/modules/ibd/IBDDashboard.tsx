import { useMemo, useState } from "react"
import { PatientRecord } from "./PatientRecord"
import type { ClinicalStatement } from "../../lib/ClinicalStatement"
import { lib, SourceDialog, useClinicalData } from "clinical-primitives"

function VariableRow({
  label,
  variable,
  openDialog,
  value
}: {
  label: React.ReactNode,
  variable: ClinicalStatement,
  openDialog: (resource: any) => void,
  value?: React.ReactNode
}) {
  const resourceCount = Object.keys(variable.resources ?? {}).reduce((acc, key) => {
    return acc + (variable.resources[key]?.length ?? 0);
  }, 0);

  return (
    <>
      <th className="px-2 py-1 border border-stone-200 bg-stone-100 text-nowrap text-start">{label}</th>
      <td className="px-2 py-1 border border-stone-200 bg-white">{value ?? JSON.stringify(variable.value)}</td>
      <td className="px-2 py-1 border border-stone-200 bg-white text-red-900">{variable.description}</td>
      <td className="px-2 py-1 border border-stone-200 bg-white text-stone-500">{variable.evidence}</td>
      <td className="px-2 py-1 border border-stone-200 bg-white whitespace-nowrap">
        {
          resourceCount ?
            <span className="cursor-pointer text-blue-500"
              onClick={() => openDialog(resourceCount === 1 ? variable.resources[Object.keys(variable.resources)[0]]![0] : variable.resources)}>
              {resourceCount === 1 ? "1 Resource" : `${resourceCount} Resources`}
            </span> :
            null
        }
      </td>
    </>
  )
}

export function IBDDashboard() {
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
    "Crohn's Decease" :
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
          {/* <div className="text-xs" /> */}
        </div>
      </div>

      <br />


      {/* <h1 className="text-2xl font-semibold text-stone-900">IBD Dashboard</h1> */}
      {/* <hr className="my-4 text-stone-200" /> */}

      <table className="text-xs hidden">
        <thead>
          <tr>
            <th className="px-2 py-1"></th>
            <th className="px-2 py-1 border border-stone-200 bg-stone-100">Value</th>
            <th className="px-2 py-1 border border-stone-200 bg-stone-100">Description</th>
            <th className="px-2 py-1 border border-stone-200 bg-stone-100">Evidence</th>
            <th className="px-2 py-1 border border-stone-200 bg-stone-100">Resources</th>
          </tr>
        </thead>
        <tbody>
            <tr>
              <VariableRow label="IBD Subtype" variable={patientRecord.ibdSubtype} openDialog={(resource) => { setSelectedResource(resource); setOpen(true); }} />
            </tr>
            <tr>
              <VariableRow label="Diagnosis Date" variable={patientRecord.diagnosisDate} openDialog={(resource) => { setSelectedResource(resource); setOpen(true); }} />
            </tr>
            <tr>
              <VariableRow label="Age at IBD Diagnosis" variable={patientRecord.ageAtIBDDiagnosis} openDialog={(resource) => { setSelectedResource(resource); setOpen(true); }} />
            </tr>
            <tr>
              <td className="px-2 py-1 border border-stone-200 bg-stone-100">Endoscopy Diagnosis Date</td>
              <td className="px-2 py-1 border border-stone-200 bg-white"></td>
              <td className="px-2 py-1 border border-stone-200 bg-white"></td>
              <td className="px-2 py-1 border border-stone-200 bg-white text-stone-500"></td>
              <td className="px-2 py-1 border border-stone-200 bg-white"></td>
            </tr>
            <tr>
              <VariableRow label="Disease Duration" variable={patientRecord.diseaseDuration} openDialog={(resource) => { setSelectedResource(resource); setOpen(true); }} />
            </tr>
            <tr>
              <VariableRow label="Has Perianial Disease" variable={patientRecord.hasPerianialDisease} openDialog={(resource) => { setSelectedResource(resource); setOpen(true); }} />
            </tr>
            <tr>
              <VariableRow label="Has Prior IBD Surgery" variable={patientRecord.hasPriorIBDSurgery} openDialog={(resource) => { setSelectedResource(resource); setOpen(true); }} />
            </tr>
            <tr>
              <VariableRow label="Latest Endoscopy" variable={patientRecord.latestEndoscopy} openDialog={(resource) => { setSelectedResource(resource); setOpen(true); }} />
            </tr>
            <tr>
              <td className="px-2 py-1 border border-stone-200 bg-stone-100">Paris Classification</td>
              <td className="px-2 py-1 border border-stone-200 bg-white">{patientRecord.parisClassification?.behavior ?? ""} {patientRecord.parisClassification?.location ?? ""} {patientRecord.parisClassification?.growth ? "G1" : "G0"}</td>
              <td className="px-2 py-1 border border-stone-200 bg-white"></td>
              <td className="px-2 py-1 border border-stone-200 bg-white text-stone-500"></td>
              <td className="px-2 py-1 border border-stone-200 bg-white"></td>
            </tr>
            <tr>
              <VariableRow label="IBD Severity" variable={patientRecord.IBDSeverity} openDialog={(resource) => { setSelectedResource(resource); setOpen(true); }} />
            </tr>
            <tr>
              <VariableRow label="IBD Activity" variable={patientRecord.IBDActivity} openDialog={(resource) => { setSelectedResource(resource); setOpen(true); }} />
            </tr>
            <tr>
              <VariableRow label="Steroid Exposure" variable={patientRecord.hasSteroidExposure} openDialog={(resource) => { setSelectedResource(resource); setOpen(true); }} />
            </tr>
            <tr>
              <td className="px-2 py-1 border border-stone-200 bg-stone-100">Nocturnal Stool</td>
              <td className="px-2 py-1 border border-stone-200 bg-white"></td>
              <td className="px-2 py-1 border border-stone-200 bg-white"></td>
              <td className="px-2 py-1 border border-stone-200 bg-white text-stone-500"></td>
              <td className="px-2 py-1 border border-stone-200 bg-white"></td>
            </tr>
            <tr>
              <td className="px-2 py-1 border border-stone-200 bg-stone-100">Stool Frequency</td>
              <td className="px-2 py-1 border border-stone-200 bg-white"></td>
              <td className="px-2 py-1 border border-stone-200 bg-white"></td>
              <td className="px-2 py-1 border border-stone-200 bg-white text-stone-500"></td>
              <td className="px-2 py-1 border border-stone-200 bg-white"></td>
            </tr>
            <tr>
              <td className="px-2 py-1 border border-stone-200 bg-stone-100">Abdominal Pain</td>
              <td className="px-2 py-1 border border-stone-200 bg-white"></td>
              <td className="px-2 py-1 border border-stone-200 bg-white"></td>
              <td className="px-2 py-1 border border-stone-200 bg-white text-stone-500"></td>
              <td className="px-2 py-1 border border-stone-200 bg-white"></td>
            </tr>
            <tr>
              <td className="px-2 py-1 border border-stone-200 bg-stone-100">Adherence</td>
              <td className="px-2 py-1 border border-stone-200 bg-white"></td>
              <td className="px-2 py-1 border border-stone-200 bg-white"></td>
              <td className="px-2 py-1 border border-stone-200 bg-white text-stone-500"></td>
              <td className="px-2 py-1 border border-stone-200 bg-white"></td>
            </tr>
            <tr>
              <td className="px-2 py-1 border border-stone-200 bg-stone-100">Weight Loss</td>
              <td className="px-2 py-1 border border-stone-200 bg-white"></td>
              <td className="px-2 py-1 border border-stone-200 bg-white"></td>
              <td className="px-2 py-1 border border-stone-200 bg-white text-stone-500"></td>
              <td className="px-2 py-1 border border-stone-200 bg-white"></td>
            </tr>
            <tr>
              <VariableRow
                label="Current Regimen"
                variable={patientRecord.activeRegimen}
                openDialog={(resource) => { setSelectedResource(resource); setOpen(true); }}
                value={
                  patientRecord.activeRegimen.value
                  .map(m => lib.Medication.normalizeMedName(lib.Medication.getMedicationName(m) ?? ''))
                  .sort()
                  .map((m, i) => {
                    return <div key={i} className="text-nowrap">&bull; {m}</div>
                  })
                }
                />
              {/* <td className="px-2 py-1 border border-stone-200 bg-stone-100">Current Regimen</td>
              <td className="px-2 py-1 border border-stone-200 bg-white text-xs text-nowrap">{
                  patientRecord.activeRegimen.value.map((m, i) => {
                      return <div key={i}>&bull; {lib.Medication.normalizeMedName(lib.Medication.getMedicationName(m) ?? '')}</div>
                    })
                  }
              </td>
              <td className="px-2 py-1 border border-stone-200 bg-white"></td>
              <td className="px-2 py-1 border border-stone-200 bg-white text-stone-500"></td>
              <td className="px-2 py-1 border border-stone-200 bg-white"></td> */}
            </tr>
            <tr>
              <VariableRow
                label="Current IBD Regimen"
                variable={patientRecord.activeIBDRegimen}
                openDialog={(resource) => { setSelectedResource(resource); setOpen(true); }}
                value={
                  patientRecord.activeIBDRegimen.value
                  .map(m => lib.Medication.normalizeMedName(lib.Medication.getMedicationName(m) ?? ''))
                  .sort()
                  .map((m, i) => {
                    return <div key={i} className="text-nowrap">&bull; {m}</div>
                  })
                }
                />
            </tr>
            <tr>
              <VariableRow
                label="IBD Regimen"
                variable={patientRecord.IBDRegimen}
                openDialog={(resource) => { setSelectedResource(resource); setOpen(true); }}
                value={
                  patientRecord.IBDRegimen.value
                  .map(m => lib.Medication.normalizeMedName(lib.Medication.getMedicationName(m) ?? ''))
                  .sort()
                  .map((m, i) => {
                    return <div key={i} className="text-nowrap">&bull; {m}</div>
                  })
                }
                />
            </tr>
        </tbody>
      </table>

      <SourceDialog open={open} onClose={() => setOpen(false)} resource={selectedResource} />
    </div>
  )
}
