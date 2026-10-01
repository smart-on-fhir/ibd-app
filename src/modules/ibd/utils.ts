import type { Coding, Observation } from "fhir/r4";
import {
    IBD_LAB_PANEL, ICD10_CROHNS, ICD10_UC, SNOMED_CROHNS, SNOMED_IBD,
    SNOMED_UC, ICD10_IBD_U
} from "./config";


export const IBD_SUBTYPES = {
    CD     : "Crohn's disease, Crohn colitis, or regional enteritis",
    UC     : "Ulcerative colitis, ulcerative proctitis, or ulcerative pancolitis",
    IBDU   : "Diagnosis of IBD-unclassified, IBD-U, or indeterminate colitis",
    IBD_NOS: "IBD diagnosis was documented but not classified as CD, UC, or formal IBDU"
};


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
 * Whether an Observation is one of the analytes on {@link IBD_LAB_PANEL}.
 *
 * Code first, then the analyte's keywords against the reading's own display
 * text — the same union the library's `analyteMatcher` uses, reimplemented here
 * only because that helper is not part of the package's public exports. If it
 * ever is, delete this and call it instead.
 *
 * Considered one analyte at a time, which is enough for a yes/no membership
 * test. It is deliberately *not* enough to decide which analyte a reading
 * belongs to — laboratory names nest, and that question needs the whole panel
 * at once.
 */
/**
 * Every panel keyword, compiled once.
 *
 * Built at module load rather than per call: this runs over every Observation
 * in the record, and a long one carries thousands. Compiling ~30 patterns
 * inside that loop was the single most expensive thing the notes page did.
 *
 * Bounded by non-alphanumerics rather than \b — a keyword can end in a digit
 * or a hyphen ("25-oh", "pre-albumin"), where \b misfires.
 */
const PANEL_KEYWORD_RES: RegExp[] = IBD_LAB_PANEL.flatMap(analyte =>
    (analyte.keywords ?? []).map(keyword => {
        const escaped = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`);
    })
);

/** The panel's codes, flattened once for the same reason. */
const PANEL_CODES: Set<string> = new Set(
    IBD_LAB_PANEL.flatMap(analyte =>
        Array.isArray(analyte.code) ? analyte.code : [analyte.code]
    )
);

export function isIBDPanelObservation(obs: Observation): boolean {
    const codings = obs.code?.coding ?? [];
    const codes   = new Set(codings.map(coding => coding.code).filter(Boolean));

    if ([...codes].some(code => PANEL_CODES.has(code!))) {
        return true;
    }

    // A reading that named itself in LOINC has already said what it is, so its
    // text is not consulted: HbA1c is `4548-4` and is not an IBD panel member,
    // but its display name contains "hemoglobin" and the keyword would claim
    // it. Keywords exist for records coded locally or not usefully coded at
    // all, and this is the line between the two cases — the same one
    // `assignOwners` draws in the library.
    const namedInLoinc = codings.some(
        coding => coding.code && (coding.system ?? "").toLowerCase().includes("loinc")
    );

    if (namedInLoinc) {
        return false;
    }

    const text = [
        obs.code?.text,
        ...codings.map(coding => coding.display)
    ].filter(Boolean).join(" ").toLowerCase();

    return PANEL_KEYWORD_RES.some(re => re.test(text));
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



