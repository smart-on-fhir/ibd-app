import type { Condition, MedicationRequest, MedicationStatement, Patient } from "fhir/r4";
import type { FHIRResourceMap } from "../../types/fhir";
import type { EndoscopyResult, IBDSubtype, ParisClassification } from "./types";
import {
    getConditionActivity,
    getConditionSeverity,
    getDiseaseDuration,
    getEarliestCondition,
    getIBDConditions,
    getIBDMedications,
    getIBDSubtype,
    getLatestEndoscopy,
    getParisClassification,
    getPatientAgeAt,
    hasPerianialDisease,
    hasPriorIBDSurgery,
    hasSteroidExposure
} from "./utils";
import { ClinicalStatement } from "../../lib/ClinicalStatement";
import { lib } from "clinical-primitives";




export class PatientRecord
{
    patient: Patient;

    resources: FHIRResourceMap;

    protected _cache: Record<string, any>;

    constructor(resources: FHIRResourceMap) {
        this.resources = resources;
        this.patient   = resources.Patient![0]! as Patient;
        this._cache    = {};
    }

    /**
     * Retrieves the latest endoscopy result for the patient.
     * The result is determined by filtering DiagnosticReport resources
     * for those related to endoscopy, based on LOINC codes and keywords,
     * and then selecting the most recent report by date.
     * The result is cached for subsequent access to improve performance.
     */
    public get latestEndoscopy(): ClinicalStatement<EndoscopyResult | null> {
        if (this._cache.latestEndoscopy === undefined) {
            this._cache.latestEndoscopy = getLatestEndoscopy(this.resources);
        }
        return this._cache.latestEndoscopy as ClinicalStatement<EndoscopyResult | null>;
    }

    /**
     * Retrieves the IBD subtype for the patient.
     * The subtype is determined by analyzing the Condition resources
     * and using the getIBDSubtype utility function.
     * The result is cached for subsequent access to improve performance.
     */
    public get ibdSubtype(): ClinicalStatement<IBDSubtype | null> {
        if (this._cache.ibdSubtype === undefined) {
            const conditions = this.resources.Condition ?? [];
            this._cache.ibdSubtype = getIBDSubtype(conditions as Condition[]);
        }
        return this._cache.ibdSubtype;
    }

    public get diseaseDuration(): ClinicalStatement<string | null> {
        if (this._cache.diseaseDuration === undefined) {
            const conditions = getIBDConditions(this.resources);
            this._cache.diseaseDuration = getDiseaseDuration(conditions as Condition[]);
        }
        return this._cache.diseaseDuration;
    }

    public get hasPriorIBDSurgery(): ClinicalStatement<boolean> {
        if (this._cache.hasPriorIBDSurgery === undefined) {
            this._cache.hasPriorIBDSurgery = hasPriorIBDSurgery(this.resources);
        }
        return this._cache.hasPriorIBDSurgery as ClinicalStatement<boolean>;
    }

    /**
     * Retrieves whether the patient has perianal disease.
     * The presence of perianal disease is determined by analyzing the Condition
     * resources and using the hasPerianialDisease utility function.
     * The result is cached for subsequent access to improve performance.
     */
    public get hasPerianialDisease(): ClinicalStatement<boolean> {
        if (this._cache.hasPerianialDisease === undefined) {
            this._cache.hasPerianialDisease = hasPerianialDisease(this.resources);
        }
        return this._cache.hasPerianialDisease as ClinicalStatement<boolean>;
    }

    public get diagnosisDate(): ClinicalStatement<Date | null> {
        if (this._cache.diagnosisDate === undefined) {
            const conditions = getIBDConditions(this.resources);
            const [earliestCondition, earliestDate] = getEarliestCondition(conditions) || [];
            this._cache.diagnosisDate = new ClinicalStatement({
                value      : earliestDate ? new Date(earliestDate) : null,
                description: earliestCondition ? new Date(earliestDate!).toISOString().substring(0, 10) : 'No IBD condition with onset date found',
                evidence   : `Used ${conditions.length} IBD Condition resources to find the one with the earliest onset.`,
                resources  : earliestCondition ? { Condition: [earliestCondition] } as FHIRResourceMap : {} as FHIRResourceMap
            });
        }
        return this._cache.diagnosisDate as ClinicalStatement<Date | null>;
    }

    /**
     * Infers Paris classification from ICD-10-CM Condition codes.
     *
     * Location:
     *   K50.0x → L1 (ileal)  |  K50.1x → L2 (colonic)  |  both or K50.[89]x → L3
     *   K51.2 → E1  |  K51.3/K51.4 → E2  |  K51.0/K51.5 → E3  (UC)
     *
     * Behavior (CD only, from ICD-10-CM 7th-character subcodes):
     *   ends in 13 → fistula → B3  |  ends in 14 → abscess → B3
     *   ends in 12 → obstruction → B2  |  ends in 0 without complications → B1
     *   perianal=true also implies B3
     */
    public get parisClassification(): ParisClassification {
        if (this._cache.parisClassification === undefined) {
            const conditions = (this.resources.Condition ?? []) as Condition[];
            const ibdSubtype = this.ibdSubtype;
            const perianal   = this.hasPerianialDisease;
            this._cache.parisClassification = getParisClassification(conditions, ibdSubtype.value, perianal.value);
        }
        return this._cache.parisClassification as ParisClassification;
    }

    public get activeRegimen(): ClinicalStatement<MedicationStatement[]> {
        if (this._cache.regimen === undefined) {
            const meds = this.resources.MedicationRequest ?? [];
            const activeMeds = lib.Medication.getActiveMedications(meds as any[]);
            const activeCnt  = activeMeds.reduce((acc, med) => acc + (med.status === 'active' ? 1 : 0), 0);
            const statement  = new ClinicalStatement({
                value: activeMeds,
                description: `Active medication regimen based on MedicationRequest resources`,
                evidence   : `${activeMeds.length} active medications identified. ${activeCnt === activeMeds.length ? 'All of them are explicitly marked as active.' : `${activeCnt} of them are currently marked as active, and the rest were detected as active based on their effectivePeriod data.`}`,
                resources  : activeMeds.reduce<Record<string, typeof activeMeds>>((acc, med) => {
                    const key = lib.Medication.normalizeMedName(lib.Medication.getMedicationName(med) ?? '')
                    ;(acc[key] ??= []).push(med)
                    return acc
                }, {})
            });
            this._cache.regimen = statement;
        }
        return this._cache.regimen as ClinicalStatement<MedicationStatement[]>;
    }

    public get activeIBDRegimen(): ClinicalStatement<MedicationStatement[]> {
        if (this._cache.active_ibd_regimen === undefined) {
            const meds = getIBDMedications(this.resources);
            const activeMeds = lib.Medication.getActiveMedications(meds as any[]);
            const statement  = new ClinicalStatement({
                value: activeMeds,
                description: `Active IBD medication regimen based on MedicationRequest resources`,
                evidence   : `${activeMeds.length} active IBD medications identified.`,
                resources  : activeMeds.reduce<Record<string, typeof activeMeds>>((acc, med) => {
                    const key = lib.Medication.normalizeMedName(lib.Medication.getMedicationName(med) ?? '')
                    ;(acc[key] ??= []).push(med)
                    return acc
                }, {})
            });
            this._cache.active_ibd_regimen = statement;
        }
        return this._cache.active_ibd_regimen as ClinicalStatement<MedicationStatement[]>;
    }

    public get ageAtIBDDiagnosis(): ClinicalStatement<string> {
        if (this._cache.ageAtDiagnosis === undefined) {
            const diagnosisDate = this.diagnosisDate.value;
            const dob = this.patient.birthDate;
            if (!diagnosisDate || !dob) {
                return new ClinicalStatement({
                    value: 'Unknown',
                    description: 'Age at IBD diagnosis cannot be determined due to missing birth date or diagnosis date.',
                    evidence: `Patient birth date: ${dob ? new Date(dob).toLocaleDateString() : 'missing'}, Diagnosis date: ${diagnosisDate ? new Date(diagnosisDate).toLocaleDateString() : 'missing'}`,
                    resources: {
                        Patient: [this.patient],
                        ...(diagnosisDate ? this.diagnosisDate.resources : {})
                    } as FHIRResourceMap
                });
            }

            const age = getPatientAgeAt(this.patient, diagnosisDate);
            this._cache.ageAtDiagnosis = new ClinicalStatement({
                value: age,
                description: `Patient was ${age} at the time of IBD diagnosis.`,
                evidence: `Calculated patient age at diagnosis using birth date (${new Date(dob).toLocaleDateString()}) and diagnosis date (${new Date(diagnosisDate).toLocaleDateString()}).`,
                resources: {
                    Patient: [this.patient],
                    ...(this.diagnosisDate.resources || {})
                } as FHIRResourceMap
            });
        }
        return this._cache.ageAtDiagnosis as ClinicalStatement<string>;
    }

    public get IBDSeverity(): ClinicalStatement<string | null> {
        if (this._cache.ibdSeverity === undefined) {
            const conditions = getIBDConditions(this.resources);
            const severity = conditions.length > 0 ? getConditionSeverity(conditions) : null;
            // console.log(conditions[0]?.severity)
            this._cache.ibdSeverity = new ClinicalStatement({
                value: severity ? severity[0] : null,
                description: severity ? `The most recent IBD condition has a severity of ${severity[0]}.` : 'IBD severity cannot be determined due to lack of severity information in Condition resources.',
                evidence: conditions.length > 0 ? `Analyzed ${conditions.length} IBD Condition resources to determine severity.` : 'No IBD Condition resources found to assess severity.',
                resources: severity ? { Condition: [severity[1]] } as FHIRResourceMap : {} as FHIRResourceMap
            });
        }
        return this._cache.ibdSeverity as ClinicalStatement<string | null>;
    }

    public get IBDActivity(): ClinicalStatement<string | null> {
        if (this._cache.ibdActivity === undefined) {
            const conditions = getIBDConditions(this.resources);
            const activity = conditions.length > 0 ? getConditionActivity(conditions) : null;
            this._cache.ibdActivity = new ClinicalStatement({
                value: activity ? activity[0] : null,
                description: activity ? `The most recent IBD condition has an activity status of ${activity[0]}.` : 'IBD activity cannot be determined due to lack of activity information in Condition resources.',
                evidence: conditions.length > 0 ? `Analyzed ${conditions.length} IBD Condition resources to determine activity.` : 'No IBD Condition resources found to assess activity.',
                resources: activity ? { Condition: [activity[1]] } as FHIRResourceMap : {} as FHIRResourceMap
            });
        }
        return this._cache.ibdActivity as ClinicalStatement<string | null>;
    }

    public get IBDRegimen(): ClinicalStatement<MedicationRequest[]> {
        if (this._cache.ibd_regimen === undefined) {
            const meds      = getIBDMedications(this.resources);
            const deduped   = new Map<string, MedicationRequest>();
            meds.forEach(med => deduped.set(lib.Medication.normalizeMedName(lib.Medication.getMedicationName(med) ?? ''), med));
            const value     = [...deduped.values()];
            const statement = new ClinicalStatement({
                value: [...deduped.values()],
                description: `Patient took ${value.length} different IBD medications`,
                evidence   : `${value.length} medications identified out of ${meds.length} IBD medication treatments.`,
                resources  : value.reduce<Record<string, typeof meds>>((acc, med) => {
                    const key = lib.Medication.normalizeMedName(lib.Medication.getMedicationName(med) ?? '')
                    ;(acc[key] ??= []).push(med)
                    return acc
                }, {})
            });
            this._cache.ibd_regimen = statement;
        }
        return this._cache.ibd_regimen as ClinicalStatement<MedicationRequest[]>;
    }

    public get hasSteroidExposure(): ClinicalStatement<boolean> {
        if (this._cache.hasSteroidExposure === undefined) {
            this._cache.hasSteroidExposure = hasSteroidExposure(this.resources);
        }
        return this._cache.hasSteroidExposure as ClinicalStatement<boolean>;
    }
}
