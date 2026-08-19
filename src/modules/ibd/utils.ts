import type { FHIRResourceMap }   from "../../types/fhir";
import { ClinicalStatement }      from "../../lib/ClinicalStatement";
import type {
    Coding, Condition, DiagnosticReport, MedicationRequest, Observation,
    Procedure, Patient
} from "fhir/r4";
import type {
    EndoscopyResult, IBDSubtype, ParisBehavior, ParisClassification,
    ParisLocation
} from "./types";
import {
    ENDOSCOPY_KEYWORDS, ENDOSCOPY_LOINCS, IBD_SURGERY_KEYWORDS, ICD10_CROHNS,
    ICD10_PERIANAL, ICD10_UC, PERIANAL_KEYWORDS, SNOMED_CROHNS, SNOMED_IBD,
    SNOMED_UC, ICD10_IBD_U, IBD_BIOLOGICS, IBD_IMMUNOMODULATORS,
    IBD_AMINOSALICYLATES, IBD_STEROIDS, IBD_ANTIBIOTICS
} from "./config";
import { lib } from "clinical-primitives";


const IBD_SUBTYPES = {
    CD     : "Crohn's disease, Crohn colitis, or regional enteritis",
    UC     : "Ulcerative colitis, ulcerative proctitis, or ulcerative pancolitis",
    IBDU   : "Diagnosis of IBD-unclassified, IBD-U, or indeterminate colitis",
    IBD_NOS: "IBD diagnosis was documented but not classified as CD, UC, or formal IBDU"
};

export function getDuration(from: string | Date, date: string | Date): string {
    const start = new Date(from);
    const end   = new Date(date);
    const diff  = Math.floor(end.getTime() - start.getTime());

    const DAY_MS   = 1000 * 60 * 60 * 24;
    const MONTH_MS = DAY_MS * 30.44;
    const YEAR_MS  = DAY_MS * 365.25;

    if (diff <= DAY_MS) {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        return `${hours} h`;
    }
    if (diff <= MONTH_MS) {
        const days = Math.floor(diff / DAY_MS);
        return `${days} d`;
    }
    if (diff <= YEAR_MS) {
        const months = Math.floor(diff / MONTH_MS);
        return `${months} mo`;
    }
    const years = Math.floor(diff / YEAR_MS);
    const rem   = Math.floor((diff % YEAR_MS) / MONTH_MS);
    return rem === 0 ? `${years} yr` : `${years} yr ${rem} mo`;

}

export function getPatientAgeAt(patient: Patient, date: string | Date): string {
    const birthDate = patient.birthDate;
    if (!birthDate) return 'Unknown age';
    return getDuration(birthDate, date);
}

/**
 * Converts a Coding object to an IBD subtype, if possible.
 * Returns null if the coding does not correspond to a known IBD subtype.
 */
export function codingToSubtype(coding: Coding): keyof typeof IBD_SUBTYPES | null {
    const system = (coding.system ?? '').toLowerCase();
    const code   = coding.code   ?? '';

    if (system.includes('icd-10') || system.includes('icd10') || system.includes('icd-10-cm')) {
        if (ICD10_CROHNS.some(p => code.startsWith(p)))
            return "CD";
        if (ICD10_UC.some(p => code.startsWith(p)))
            return 'UC';
        if (ICD10_IBD_U.some(p => code.startsWith(p)))
            return 'IBDU';
    }

    if (system.includes('snomed') || system.includes('sct')) {
        if (SNOMED_CROHNS.has(code))
            return "CD";
        if (SNOMED_UC.has(code))
            return 'UC';
        if (SNOMED_IBD.has(code))
            return 'IBD_NOS';
    }

    return null;
}

/**
 * Returns all Condition resources that represent IBD diagnoses.
 */
export function getIBDConditions(resources: FHIRResourceMap): Condition[] {
    return (resources.Condition ?? []).filter((c: any) =>
        (c.code?.coding ?? []).some((cod: any) => codingToSubtype(cod) !== null)
    ) as Condition[];
}

/**
 * IBD cases include subtypes:
 * - Crohn’s Disease (CD)
 * - Ulcerative Colitis (UC)
 * - Unclassified (IBDU).
 * 
 * The remaining IBD_NOS “not otherwise specified” is not a true IBD subtype but
 * is evidence that a patient has IBD. 
 * Returns the most specific IBD subtype found across all IBD conditions. 
 * Returns null if no IBD subtype is found.
 */
export function getIBDSubtype(conditions: Condition[]): ClinicalStatement<keyof typeof IBD_SUBTYPES | null> {
    // Prefer specific subtypes over generic IBD
    const priority: (keyof typeof IBD_SUBTYPES)[] = ["CD", "UC", "IBDU", "IBD_NOS"];
    for (const target of priority) {
        for (const c of conditions) {
            for (const cod of (c.code?.coding ?? [])) {
                if (codingToSubtype(cod) === target) {
                    const label = IBD_SUBTYPES[target];
                    return new ClinicalStatement({
                        value      : target,
                        description: label,
                        evidence   : `Based on ${conditions.length} Condition resources, the most specific subtype identified is ${label}.`,
                        resources  : { Condition: [c] }
                    });
                }
            }
        }
    }
    return new ClinicalStatement({
        value      : null,
        description: 'No IBD subtype detected',
        evidence   : `Based on ${conditions.length} Condition resources, no specific IBD subtype was identified.`,
        resources  : {} as FHIRResourceMap
    });
}

/**
 * Returns true if any Condition indicates perianal disease.
 */
export function hasPerianialDisease(resources: FHIRResourceMap): ClinicalStatement<boolean> {

    const conditions = (resources.Condition ?? []) as Condition[];

    for (const c of conditions) {
        const codings = c.code?.coding ?? [];
        for (const cod of codings) {
            const sys = (cod.system ?? '').toLowerCase();
            const isICD = sys.includes('icd-10') ||
                          sys.includes('icd10') ||
                          sys.includes('icd-10-cm');
            if (isICD && ICD10_PERIANAL.some(p => cod.code?.startsWith(p))) {
                return new ClinicalStatement({
                    value      : true,
                    description: 'Perianal disease detected',
                    evidence   : `Based on ICD-10 codes, some of the following codes were identified: ${ICD10_PERIANAL.join(', ')}.`,
                    resources  : { Condition: [c] }
                });
            }
        }
    }

    for (const c of conditions) {
        const text = [
            c.code?.text,
            ...(c.code?.coding ?? []).map((x: any) => x.display ?? '')
        ].filter(Boolean).join(' ').toLowerCase();

        if (PERIANAL_KEYWORDS.some(kw => text.includes(kw))) {
            return new ClinicalStatement({
                value      : true,
                description: 'Perianal disease detected',
                evidence   : `Based on text descriptions, some of the following keywords were identified: ${PERIANAL_KEYWORDS.join(', ')}`,
                resources  : { Condition: [c] }
            });
        }
    }

    return new ClinicalStatement({
        value      : false,
        description: 'Perianal disease not detected',
        evidence   : `Based on ICD-10 codes and text descriptions, none of the following keywords were identified: ${PERIANAL_KEYWORDS.join(', ')}`,
        resources  : {} as FHIRResourceMap
    });
}

/**
 * What was the earliest diagnosis? Returns null if no onset date is available.
 */
export function getEarliestCondition(conditions: Condition[]): [Condition, number] | null {
    return conditions
        .map(c => ([c, c.onsetDateTime ?? c.recordedDate ?? c?.onsetPeriod?.start ?? c?.onsetPeriod?.end]))
        .filter(c => !!c[1])
        .map(([c, d]) => [c, new Date(d + "").getTime()])
        .filter(([_, t]: any) => !isNaN(t))
        .sort((a: any, b: any) => a[1] - b[1])[0] as [Condition, number] || null;
}

/**
 * What was the latest diagnosis? Returns null if no onset date is available.
 */
export function getLatestCondition(conditions: Condition[]): [Condition, number] | null {
    return conditions
        .map(c => ([c, c.onsetDateTime ?? c.recordedDate ?? c?.onsetPeriod?.start ?? c?.onsetPeriod?.end]))
        .filter(c => !!c[1])
        .map(([c, d]) => [c, new Date(d + "").getTime()])
        .filter(([_, t]: any) => !isNaN(t))
        .sort((a: any, b: any) => b[1] - a[1])[0] as [Condition, number] || null;
}

/**
 * Returns a human-readable severity string for a Condition resource,
 * prioritizing coding display, then text, and defaulting to null
 * if neither is available.
 */
export function getConditionSeverity(conditions: Condition[]): [string, Condition] | null {
    const latestConditionWithSeverity = conditions
        .map(c => ([c, c.onsetDateTime ?? c.recordedDate ?? c?.onsetPeriod?.start ?? c?.onsetPeriod?.end, c.severity]))
        .filter(c => !!c[1] && !!c[2])
        .map(([c, d]) => [c, new Date(d + "").getTime()])
        .filter(([_, t]: any) => !isNaN(t))
        .sort((a: any, b: any) => b[1] - a[1])[0] as [Condition, number] || null;

    const severity = latestConditionWithSeverity?.[0]?.severity?.coding?.[0]?.display ?? latestConditionWithSeverity?.[0]?.severity?.text ?? null;
    return severity ? [severity, latestConditionWithSeverity![0]] : null;
}

export function getConditionActivity(conditions: Condition[]): [string, Condition] | null {
    const latestConditionWithClinicalStatus = conditions
        .map(c => ([c, c.onsetDateTime ?? c.recordedDate ?? c?.onsetPeriod?.start ?? c?.onsetPeriod?.end, c.clinicalStatus]))
        .filter(c => !!c[1] && !!c[2])
        .map(([c, d]) => [c, new Date(d + "").getTime()])
        .filter(([_, t]: any) => !isNaN(t))
        .sort((a: any, b: any) => b[1] - a[1])[0] as [Condition, number] || null;

    if (!Array.isArray(latestConditionWithClinicalStatus) || latestConditionWithClinicalStatus.length < 1) {
        return null;
    }

    const activity = (
        latestConditionWithClinicalStatus[0]?.clinicalStatus?.coding?.[0]?.display ??
        latestConditionWithClinicalStatus[0]?.clinicalStatus?.text ??
        null
    );

    return activity ? [activity, latestConditionWithClinicalStatus[0]] : null;
}

/**
 * Returns human-readable disease duration from the earliest IBD condition onset.
 * Returns null if no onset date is available.
 */
export function getDiseaseDuration(conditions: Condition[]): ClinicalStatement<string | null> {

    const [earliestCondition, earliestDate] = getEarliestCondition(conditions) || [];
    
    const evidence = `Used ${conditions.length} IBD Condition resources to find ` +
        `the date of the earliest onset. The computed duration is based on the ` +
        `interval between the earliest onset date and the current date.`;
    
    if (!earliestCondition) {
        return new ClinicalStatement({
            value      : null,
            description: 'No onset date available',
            evidence,
            resources  : {} as FHIRResourceMap
        });
    }

    const now    = Date.now();
    const months = Math.floor((now - earliestDate!) / (1000 * 60 * 60 * 24 * 30.44));

    if (months <  1)
        return new ClinicalStatement({
            value      : 'Less than 1 month',
            description: `The interval since the earliest IBD condition onset and the current date`,
            evidence,
            resources  : { Condition: [earliestCondition] } as FHIRResourceMap
        });

    if (months < 12)
        return new ClinicalStatement({
            value      : `${months} month${months === 1 ? '' : 's'}`,
            description: `The interval since the earliest IBD condition onset and the current date`,
            evidence,
            resources  : { Condition: [earliestCondition] } as FHIRResourceMap
        });

    const years = Math.floor(months / 12);
    const rem   = months % 12;

    return rem === 0
        ? new ClinicalStatement({
            value      : `${years} year${years === 1 ? '' : 's'}`,
            description: `The interval since the earliest IBD condition onset and the current date`,
            evidence,
            resources  : { Condition: [earliestCondition] } as FHIRResourceMap
        })
        : new ClinicalStatement({
            value      : `${years} yr ${rem} mo`,
            description: `The interval since the earliest IBD condition onset and the current date`,
            evidence,
            resources  : { Condition: [earliestCondition] } as FHIRResourceMap
        });
}

/**
 * Returns true if any Procedure resource suggests prior IBD-related surgery.
 */
export function hasPriorIBDSurgery(resources: FHIRResourceMap): ClinicalStatement<boolean> {
    const procedures = (resources.Procedure ?? []) as Procedure[];

    for (const procedure of procedures) {
        const text = [
            procedure.code?.text,
            ...(procedure.code?.coding ?? []).map((c: any) => c.display ?? c.code ?? '')
        ].filter(Boolean).join(' ').toLowerCase();

        if (IBD_SURGERY_KEYWORDS.some(kw => text.includes(kw))) {
            return new ClinicalStatement<boolean>({
                value      : true,
                description: 'Prior IBD-related surgery',
                evidence   : `Found one Procedure resource mentioning IBD-related surgery keywords (${IBD_SURGERY_KEYWORDS.join(', ')})`,
                resources  : { Procedure: [procedure] } as FHIRResourceMap
            });
        }
    }

    return new ClinicalStatement<boolean>({
        value      : false,
        description: 'No Prior IBD-related surgery',
        evidence   : `Based on ${procedures.length} available Procedure resources we didn't find any mentioning IBD-related surgery keywords (${IBD_SURGERY_KEYWORDS.join(', ')})`,
    });
}

/**
 * Retrieves the latest endoscopy result for the patient.
 * The result is determined by filtering DiagnosticReport resources
 * for those related to endoscopy, based on LOINC codes and keywords,
 * and then selecting the most recent report by date.
 */
export function getLatestEndoscopy(resources: FHIRResourceMap): ClinicalStatement<EndoscopyResult | null> {

    // Get all DiagnosticReport resources
    const reports = (resources.DiagnosticReport ?? []) as DiagnosticReport[];

        // // Filter DiagnosticReport resources to include only those related
        // // to endoscopy. Filtering is based on LOINC codes and keywords in
        // // the report's code text or coding display.
        const matched = reports.filter((r: DiagnosticReport) => {

            // Extract all codings from the report's code and category fields. 
            // This includes the primary coding as well as any codings within
            // categories.
            const codings = [
                ...(r.code?.coding ?? []),
                ...(r.category ?? []).flatMap((cat: any) => cat.coding ?? []),
            ];
            
            // Check if any of the codings match the LOINC codes for endoscopy.
            // If a match is found, the report is considered relevant and
            // included.
            if (codings.some((c: any) =>
                (c.system ?? '').toLowerCase().includes('loinc') &&
                ENDOSCOPY_LOINCS.includes(c.code)
            )) return true;
            
            // If no LOINC code match is found, the report's text and coding
            // displays are checked for keywords related to endoscopy. This
            // provides an additional way to identify relevant reports based
            // on textual information rather than structured codes.
            const text = [
                r.code?.text,
                ...codings.map((c: any) => c.display ?? '')
            ].filter(Boolean).join(' ').toLowerCase();

            return ENDOSCOPY_KEYWORDS.some(kw => text.includes(kw));
        });

        // Map the filtered DiagnosticReport resources to a simplified
        // structure containing only the relevant information: the date of
        // the report and the finding or conclusion. This makes it easier to
        // work with the endoscopy results without dealing with the full
        // FHIR resource structure.
        const mapped = matched.map((r: DiagnosticReport) => ({
            date:    r.effectiveDateTime ?? r.effectivePeriod?.end ?? r.issued ?? '',
            finding: r.conclusion ?? r.presentedForm?.[0]?.title ?? '(report available)',
            resource: r,
        }))

        // Filter out any entries that do not have a date. This ensures that
        // only endoscopy results with a valid date are considered for the
        // final sorting and selection of the latest result.
        .filter(r => r.date)

        // Sort the remaining entries by date in descending order. This
        // ensures that the most recent endoscopy result appears first in the
        // list, facilitating the retrieval of the latest result.
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (matched.length === 0) {
        return new ClinicalStatement({
            value: null,
            description: 'No endoscopy reports available',
            evidence: `Looking at ${reports.length} diagnostic reports but couldn't find any relevant endoscopy reports`,
        })
    };

    return new ClinicalStatement({
        value: mapped[0],
        description: 'Latest endoscopy report',
        evidence: `Looking at ${matched.length} endoscopy reports, the last one was on ${mapped[0].date}`,
        resources: {
            DiagnosticReport: [mapped[0].resource]
        }
    });
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
export function getParisClassification(
    conditions: Condition[],
    ibdSubtype: IBDSubtype | null,
    perianal:   boolean,
): ParisClassification {

    const codes = [...new Set(conditions.flatMap((c: any) =>
        (c.code?.coding ?? []).map((cod: any) => cod.code as string).filter(Boolean)
    ))];

    let location: ParisLocation | null = null;
    let behavior: ParisBehavior | null = null;

    if (ibdSubtype === "Crohn's disease") {
        const hasIleal   = codes.some(c => c.startsWith('K50.0'));
        const hasColonic = codes.some(c => c.startsWith('K50.1'));
        const hasOther   = codes.some(c => c.startsWith('K50.8') || c.startsWith('K50.9'));

        if (hasIleal && hasColonic) location = 'L3';
        else if (hasIleal)          location = 'L1';
        else if (hasColonic)        location = 'L2';
        else if (hasOther)          location = 'L3';   // unspecified → assume ileocolonic

        const hasFistula  = codes.some(c => c.endsWith('13'));
        const hasAbscess  = codes.some(c => c.endsWith('14'));
        const hasObstruct = codes.some(c => c.endsWith('12'));
        const explicit0   = codes.some(c => /^K50\.\d+0$/.test(c));

        if (hasFistula || hasAbscess || perianal) behavior = 'B3';
        else if (hasObstruct)                     behavior = 'B2';
        else if (explicit0)                       behavior = 'B1';

    } else if (ibdSubtype === 'Ulcerative colitis') {
        const pancolitis = codes.some(c => c.startsWith('K51.0') || c.startsWith('K51.5'));
        const leftSided  = codes.some(c => c.startsWith('K51.3') || c.startsWith('K51.4'));
        const proctitis  = codes.some(c => c.startsWith('K51.2'));

        if (pancolitis)     location = 'E3';
        else if (leftSided) location = 'E2';
        else if (proctitis) location = 'E1';
    }

    return { location, behavior, perianal, growth: null };
}

export function getObservationValue(obs: Observation): string {
    
    if (obs.valueQuantity !== undefined) {
        return `${isNaN(+String(obs.valueQuantity.value)) ?
            obs.valueQuantity.value :
            Number(obs.valueQuantity.value).toFixed(2)} ${obs.valueQuantity.unit || ''}`.trim();
    }
    
    if (obs.valueString !== undefined) {
        return obs.valueString ?? '';
    }
    
    if (obs.valueCodeableConcept !== undefined) {
        return obs.valueCodeableConcept.text ?? obs.valueCodeableConcept.coding?.[0]?.display ?? '';
    }

    if (obs.valueBoolean !== undefined) {
        return obs.valueBoolean + '';
    }

    if (obs.valueDateTime !== undefined) {
        return obs.valueDateTime + '';
    }

    if (obs.valuePeriod !== undefined) {
        const period = obs.valuePeriod;
        const start = period.start ? period.start : '';
        const end   = period.end   ? period.end   : '';
        return start && end ? `${start} - ${end}` : start || end || '';
    }

    if (obs.valueRange !== undefined) {
        const range = obs.valueRange;
        const low  = range.low  ? `${range.low.value} ${range.low.unit || ''}`.trim() : '';
        const high = range.high ? `${range.high.value} ${range.high.unit || ''}`.trim() : '';
        return low && high ? `${low} - ${high}` : low || high || '';
    }

    if (obs.valueRatio !== undefined) {
        const ratio = obs.valueRatio;
        const numerator   = ratio.numerator   ? `${ratio.numerator.value} ${ratio.numerator.unit || ''}`.trim() : '';
        const denominator = ratio.denominator ? `${ratio.denominator.value} ${ratio.denominator.unit || ''}`.trim() : '';
        return numerator && denominator ? `${numerator} / ${denominator}` : numerator || denominator || '';
    }

    if (obs.valueTime !== undefined) {
        return obs.valueTime + '';
    }

    return '';
}

// -----------------------------------------------------------------------------
// MEDICATIONS
// -----------------------------------------------------------------------------

export type IBDMedicationClass =
    | 'biologic'
    | 'immunomodulator'
    | 'aminosalicylate'
    | 'steroid'
    | 'antibiotic'
    | 'other';

export function classifyIBDMedication(name: string): IBDMedicationClass {
    const n = name.toLowerCase();
    if (IBD_BIOLOGICS.some(b => n.includes(b)))        return 'biologic';
    if (IBD_IMMUNOMODULATORS.some(b => n.includes(b))) return 'immunomodulator';
    if (IBD_AMINOSALICYLATES.some(b => n.includes(b))) return 'aminosalicylate';
    if (IBD_STEROIDS.some(b => n.includes(b)))         return 'steroid';
    if (IBD_ANTIBIOTICS.some(b => n.includes(b)))      return 'antibiotic';
    return 'other';
}

export function getIBDMedications(resources: FHIRResourceMap): MedicationRequest[] {
    const medications = (resources.MedicationRequest ?? []) as MedicationRequest[];
    return medications.filter(med => {

        // Determine medication relevance based on SNOMED codes first
        const code = med.medicationCodeableConcept?.coding?.[0]?.code || '';
        if (SNOMED_IBD   .has(code)) return true;
        if (SNOMED_CROHNS.has(code)) return true;
        if (SNOMED_UC    .has(code)) return true;

        // If no relevant SNOMED code is found, fall back to keyword-based classification
        const name = lib.Medication.getMedicationName(med);
        return name && classifyIBDMedication(name) !== 'other';
    });
}

export function hasSteroidExposure(resources: FHIRResourceMap): ClinicalStatement<boolean> {
    const medications = (resources.MedicationRequest ?? []) as MedicationRequest[];
    
    const map = new Map<string, MedicationRequest[]>();
    medications.forEach(med => {
        const name = lib.Medication.normalizeMedName(lib.Medication.getMedicationName(med) ?? '');
        if (!name) return;
        if (!IBD_STEROIDS.some(b => name.toLowerCase().includes(b))) return;
        if (!map.has(name)) map.set(name, []);
        map.get(name)?.push(med);
    });

    const size = map.size;

    return new ClinicalStatement({
        value      : size > 0,
        description: size > 0 ? `Steroid exposure based on ${size} medications` : 'No steroid exposure detected based on medication names',
        evidence   : `${medications.length} medications reviewed.`,
        resources  : map.size > 0 ? Object.fromEntries(map) : {} as FHIRResourceMap
    });
}

export function getActiveMedications(resources: FHIRResourceMap): ClinicalStatement<MedicationRequest[]> {
    const meds       = resources.MedicationRequest ?? [];
    const activeMeds = lib.Medication.getActiveMedications(meds as any[]);
    const activeCnt  = activeMeds.reduce((acc, med) => acc + (med.status === 'active' ? 1 : 0), 0);
    return new ClinicalStatement({
        value: activeMeds,
        description: `Active medication regimen based on MedicationRequest resources`,
        evidence: `${activeMeds.length} active medications identified. ${activeCnt === activeMeds.length ? 'All of them are explicitly marked as active.' : `${activeCnt} of them are currently marked as active, and the rest were detected as active based on their effectivePeriod data.`}`,
        resources: Object.fromEntries(activeMeds.map(med => [lib.Medication.normalizeMedName(lib.Medication.getMedicationName(med) ?? ''), [med]]))
    });
}

