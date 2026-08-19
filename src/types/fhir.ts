export type {
  Bundle as FHIRBundle,
  Patient as FHIRPatient,
  Condition as FHIRCondition,
  Observation as FHIRObservation,
  Medication as FHIRMedication,
  MedicationRequest as FHIRMedicationRequest,
  Encounter as FHIREncounter,
  Procedure as FHIRProcedure,
  DiagnosticReport as FHIRDiagnosticReport,
  AllergyIntolerance as FHIRAllergyIntolerance,
  Resource as FHIRResource,
} from 'fhir/r4'

export type FHIRResourceMap = Partial<Record<string, fhir4.Resource[]>>
