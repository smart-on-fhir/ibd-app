import type { DiagnosticReport } from "fhir/r4";

export type IBDSubtype = "Crohn's disease" | 'Ulcerative colitis' | 'IBD-U' | 'IBD';

export interface EndoscopyResult {
    date    : string;
    finding : string;
    resource: DiagnosticReport;
}

/**
 * Disease location per Paris classification.
 * L1–L4b are Crohn's disease locations; E1–E3 are UC extent categories.
 */
export type ParisLocation = 'L1' | 'L2' | 'L3' | 'L4a' | 'L4b' | 'E1' | 'E2' | 'E3';

/** Disease behavior modifier per Paris classification (Crohn's disease only). */
export type ParisBehavior = 'B1' | 'B2' | 'B3';

export interface ParisClassification {
    location: ParisLocation | null;  // L1/L2/L3 (CD) or E1/E2/E3 (UC); null if not determinable
    behavior: ParisBehavior | null;  // B1/B2/B3 (CD only); null if ambiguous
    perianal: boolean;
    growth:   null;                  // not reliably derivable from standard ICD-10
}

export interface IBDMedicationClass {
    name: string;
    color?: string;
}