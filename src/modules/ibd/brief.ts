/**
 * The pre-visit brief: what changed for an IBD patient over the last interval
 * between clinic visits, as a short list of findings, each citing the records
 * it rests on.
 *
 * Deterministic on purpose. Every finding is computed from coded resources and
 * carries those resources in `sources`, so the page can open each one — there
 * is nothing here a reader cannot check against the record.
 *
 * The interval runs from the previous IBD clinic visit to now, not from the
 * last visit: in the synthetic cohort the last clinic visit is usually the
 * newest thing in the record, so "since the last visit" would be empty for most
 * patients. Comparing the last visit with the one before it is what a clinician
 * preparing the next one wants anyway.
 */
import type {
    Condition, DocumentReference, Encounter, MedicationRequest, Observation,
    Procedure, Resource
} from "fhir/r4";
import { lib as cp }        from "clinical-primitives";
import type { FHIRResourceMap } from "../../types/fhir";
import { documentReferenceText } from "../../lib/clinicalNotes";
import {
    IBD_SURGERY_KEYWORDS, ENDOSCOPY_KEYWORDS,
    RE_IBD_MED_ADVANCED_OTHER, RE_IBD_MED_AMINOSALICYLATE, RE_IBD_MED_ANTI_INTEGRIN,
    RE_IBD_MED_ANTI_INTERLEUKIN, RE_IBD_MED_ANTI_TNF, RE_IBD_MED_CORTICOSTEROID,
    RE_IBD_MED_IMMUNOMODULATOR, RE_IBD_MED_JAK_INHIBITOR
} from "./config";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type Concern = "low" | "moderate" | "high";

/** One evidence row, in the shape `FindingCard`'s `EvidenceItem` takes. */
export type BriefEvidence =
    | { kind: "lab"; name: string; value: string; unit?: string; sub?: string; flag?: "high" | "low" }
    | { kind: "med"; name: string; note?: string; tag?: string; tagVariant?: "warning" | "success" | "danger" | "muted" | "info" }
    | { kind: "condition"; name: string; onset?: string; status?: string }
    | { kind: "note"; title: string; date?: string; category?: string; snippet?: string };

export interface BriefFinding {
    /** Stable within one brief, for React keys. */
    id         : string;
    title      : string;
    description: string;
    concern    : Concern;
    evidence   : BriefEvidence[];
    /** The records the finding rests on, newest first. Never empty. */
    sources    : Resource[];
}

export interface Brief {
    /** The previous clinic visit: the interval starts here (exclusive). */
    previousVisit: Encounter | null;
    /** The most recent clinic visit. */
    lastVisit    : Encounter | null;
    /** Start of the interval, as `YYYY-MM-DD`; null when there is no earlier visit. */
    since        : string | null;
    findings     : BriefFinding[];
}

// -----------------------------------------------------------------------------
// Rules
// -----------------------------------------------------------------------------

/** IBD diagnosis codes, as the dataset codes an IBD visit's reason. */
const RE_IBD_REASON = /^(34000006|64766004|K52\.3|K52\.9|K50|K51)/;

/** Note types written at a GI clinic visit, which is what makes a visit a clinic visit. */
const RE_CLINIC_NOTE = /gastroenterology (follow-up|consultation)/i;

/** Encounter classes and types that mean the patient needed acute care. */
const RE_ACUTE_ENCOUNTER = /emergency|urgent care|hospital admission|inpatient/i;

/** Routine Synthea bookkeeping, not a diagnosis anyone needs flagged. */
const RE_ROUTINE_CONDITION = /medication review due|^(employment|education|stress|social)/i;

/** Labs the brief compares, in the order it reports them: inflammation, then anemia and nutrition. */
const BRIEF_LABS: { label: string; codes: string[] }[] = [
    { label: "CRP"         , codes: ["1988-5", "30522-7", "71426-1"] },
    { label: "Calprotectin", codes: ["38445-3"] },
    { label: "ESR"         , codes: ["4537-7", "30341-2"] },
    { label: "Albumin"     , codes: ["1751-7", "2862-1"] },
    { label: "Hemoglobin"  , codes: ["718-7", "20509-6"] },
    { label: "Ferritin"    , codes: ["2276-4", "20567-4"] },
    { label: "Platelets"   , codes: ["777-3", "26515-7"] },
];

/**
 * IBD drug classes, most specific first. Inhaled and topical forms are excluded
 * before this runs: budesonide also treats asthma.
 */
const IBD_DRUG_CLASSES: [RegExp, string][] = [
    [RE_IBD_MED_ANTI_TNF        , "Anti-TNF"],
    [RE_IBD_MED_ANTI_INTEGRIN   , "Anti-integrin"],
    [RE_IBD_MED_ANTI_INTERLEUKIN, "Anti-interleukin"],
    [RE_IBD_MED_JAK_INHIBITOR   , "JAK inhibitor"],
    [RE_IBD_MED_ADVANCED_OTHER  , "Advanced/other"],
    [RE_IBD_MED_IMMUNOMODULATOR , "Immunomodulator"],
    [RE_IBD_MED_AMINOSALICYLATE , "Aminosalicylate"],
    [RE_IBD_MED_CORTICOSTEROID  , "Corticosteroid"],
];
const RE_NON_SYSTEMIC = /inhal|nasal|topical|cream|ointment|ophthalmic|otic/i;

/** How far back before the interval a drug counts as "already on it". */
const BASELINE_MED_DAYS = 180;

const CONCERN_RANK: Record<Concern, number> = { high: 0, moderate: 1, low: 2 };

// -----------------------------------------------------------------------------
// Small helpers
// -----------------------------------------------------------------------------

const day = (s?: string | null) => (s ?? "").slice(0, 10);

function byDateDesc<T>(date: (r: T) => string) {
    return (a: T, b: T) => date(b).localeCompare(date(a));
}

function list<T extends Resource>(resources: FHIRResourceMap, type: string): T[] {
    return (resources[type] ?? []) as T[];
}

function codes(concept?: { coding?: { code?: string }[] }): string[] {
    return (concept?.coding ?? []).map(c => c.code ?? "").filter(Boolean);
}

function conceptName(concept?: { text?: string; coding?: { display?: string }[] }): string {
    return concept?.text || concept?.coding?.find(c => c.display)?.display || "Unnamed";
}

function addDays(date: string, days: number): string {
    const d = new Date(date + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

function formatDate(date: string): string {
    return new Date(date + "T00:00:00").toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// -----------------------------------------------------------------------------
// Visits
// -----------------------------------------------------------------------------

/** IBD clinic visits, oldest first: IBD-reason encounters with a GI clinic note attached. */
export function clinicVisits(resources: FHIRResourceMap): Encounter[] {
    const clinicEncounterIds = new Set(
        list<DocumentReference>(resources, "DocumentReference")
            .filter(doc => RE_CLINIC_NOTE.test(doc.type?.text ?? ""))
            .flatMap(doc => (doc.context?.encounter ?? []).map(ref => ref.reference?.split("/")[1]))
    );

    return list<Encounter>(resources, "Encounter")
        .filter(enc => clinicEncounterIds.has(enc.id))
        .filter(enc => (enc.reasonCode ?? []).some(rc => codes(rc).some(code => RE_IBD_REASON.test(code))))
        .sort((a, b) => day(a.period?.start).localeCompare(day(b.period?.start)));
}

// -----------------------------------------------------------------------------
// Findings
// -----------------------------------------------------------------------------

function interpretationFlag(obs: Observation): "high" | "low" | null {
    const code = obs.interpretation?.[0]?.coding?.[0]?.code ?? "";
    if (/^H/.test(code)) return "high";
    if (/^L/.test(code)) return "low";
    return null;
}

function labValue(obs: Observation): string {
    const value = obs.valueQuantity?.value;
    return value === undefined ? "—" : String(Math.round(value * 100) / 100);
}

/**
 * One finding per lab that is abnormal at the end of the interval, or that
 * changed status across it. A lab normal at both ends says nothing new.
 */
function labFindings(resources: FHIRResourceMap, since: string): BriefFinding[] {
    const observations = list<Observation>(resources, "Observation").filter(o => o.valueQuantity?.value !== undefined);
    const findings: BriefFinding[] = [];

    for (const lab of BRIEF_LABS) {
        const readings = observations
            .filter(o => codes(o.code).some(code => lab.codes.includes(code)))
            .sort(byDateDesc(o => day(o.effectiveDateTime)));

        const latest   = readings.find(o => day(o.effectiveDateTime) > since);
        const baseline = readings.find(o => day(o.effectiveDateTime) <= since);
        if (!latest) continue;

        const now  = interpretationFlag(latest);
        const then = baseline ? interpretationFlag(baseline) : null;
        if (!now && !then) continue;

        const unit  = latest.valueQuantity?.unit;
        const range = latest.referenceRange?.[0]?.text;
        const date  = day(latest.effectiveDateTime);

        let title: string, concern: Concern;
        if (now && !then) {
            title   = `${lab.label} newly ${now}: ${labValue(latest)} ${unit ?? ""}`.trim();
            concern = "high";
        } else if (now && then) {
            title   = `${lab.label} still ${now}: ${labValue(latest)} ${unit ?? ""}`.trim();
            concern = "moderate";
        } else {
            title   = `${lab.label} back in range: ${labValue(latest)} ${unit ?? ""}`.trim();
            concern = "low";
        }

        const evidence: BriefEvidence[] = [
            { kind: "lab", name: `${lab.label} (${formatDate(date)})`, value: labValue(latest), unit, sub: range, ...(now ? { flag: now } : {}) },
        ];
        if (baseline) {
            evidence.push({
                kind: "lab", name: `${lab.label} (${formatDate(day(baseline.effectiveDateTime))})`,
                value: labValue(baseline), unit: baseline.valueQuantity?.unit,
                sub: baseline.referenceRange?.[0]?.text, ...(then ? { flag: then } : {}),
            });
        }

        findings.push({
            id: `lab-${lab.label}`,
            title,
            description: baseline
                ? `${labValue(baseline)} on ${formatDate(day(baseline.effectiveDateTime))}, ${labValue(latest)} on ${formatDate(date)}.`
                : `First ${lab.label} result in the record: ${formatDate(date)}.`,
            concern,
            evidence,
            sources: baseline ? [latest, baseline] : [latest],
        });
    }

    return findings;
}

/** The IBD drug an order is for, as a lower-case ingredient, with its class; null for anything else. */
function ibdDrug(order: MedicationRequest): { drug: string; drugClass: string } | null {
    const name = cp.Medication.getMedicationName(order as never) ?? "";
    if (!name || RE_NON_SYSTEMIC.test(name)) return null;
    for (const [re, drugClass] of IBD_DRUG_CLASSES) {
        const match = name.match(re);
        if (match) return { drug: match[0].toLowerCase(), drugClass };
    }
    return null;
}

/** Drugs started in the interval (not ordered in the six months before it) and drugs stopped. */
function medicationFindings(resources: FHIRResourceMap, since: string): BriefFinding[] {
    const orders = list<MedicationRequest>(resources, "MedicationRequest")
        .map(order => ({ order, drug: ibdDrug(order), date: day(order.authoredOn) }))
        .filter((o): o is { order: MedicationRequest; drug: NonNullable<ReturnType<typeof ibdDrug>>; date: string } => !!o.drug && !!o.date)
        .sort(byDateDesc(o => o.date));

    const baselineStart = addDays(since, -BASELINE_MED_DAYS);
    const inInterval = orders.filter(o => o.date > since);
    const inBaseline = orders.filter(o => o.date <= since && o.date > baselineStart);

    const drugsNow    = new Map(inInterval.map(o => [o.drug.drug, o]));
    const drugsBefore = new Map(inBaseline.map(o => [o.drug.drug, o]));

    const findings: BriefFinding[] = [];

    for (const [drug, o] of drugsNow) {
        if (drugsBefore.has(drug)) continue;
        const steroid = o.drug.drugClass === "Corticosteroid";
        findings.push({
            id: `med-start-${drug}`,
            title: `Started ${drug}`,
            description: `${o.drug.drugClass}, first ordered ${formatDate(o.date)}${steroid ? ", which often signals a flare" : ""}.`,
            concern: steroid ? "high" : "moderate",
            evidence: inInterval.filter(x => x.drug.drug === drug).map(x => ({
                kind: "med" as const, name: cp.Medication.getMedicationName(x.order as never) ?? drug,
                note: `Ordered ${formatDate(x.date)} · ${x.order.status}`, tag: x.drug.drugClass, tagVariant: steroid ? "warning" as const : "info" as const,
            })),
            sources: inInterval.filter(x => x.drug.drug === drug).map(x => x.order),
        });
    }

    for (const [drug, o] of drugsBefore) {
        if (drugsNow.has(drug)) continue;
        findings.push({
            id: `med-stop-${drug}`,
            title: `No ${drug} orders since ${formatDate(since)}`,
            description: `${o.drug.drugClass}, last ordered ${formatDate(o.date)}. Confirm whether it was stopped.`,
            concern: o.drug.drugClass === "Corticosteroid" ? "low" : "moderate",
            evidence: [{
                kind: "med", name: cp.Medication.getMedicationName(o.order as never) ?? drug,
                note: `Last ordered ${formatDate(o.date)} · ${o.order.status}`, tag: o.drug.drugClass, tagVariant: "muted",
            }],
            sources: [o.order],
        });
    }

    return findings;
}

/** Emergency, urgent care and inpatient encounters in the interval, as one finding. */
function acuteCareFinding(resources: FHIRResourceMap, since: string): BriefFinding[] {
    const acute = list<Encounter>(resources, "Encounter")
        .filter(enc => day(enc.period?.start) > since)
        .filter(enc => enc.class?.code === "EMER" || enc.class?.code === "IMP"
            || (enc.type ?? []).some(t => RE_ACUTE_ENCOUNTER.test(conceptName(t))))
        .sort(byDateDesc(enc => day(enc.period?.start)));
    if (!acute.length) return [];

    return [{
        id: "acute-care",
        title: `${acute.length} acute care ${acute.length === 1 ? "visit" : "visits"} since ${formatDate(since)}`,
        description: "Emergency, urgent care or inpatient encounters in the interval.",
        concern: "high",
        evidence: acute.map(enc => ({
            kind: "condition" as const,
            // The class says what kind of care it was; the type is often just
            // "Encounter for problem".
            name: enc.class?.code === "IMP" ? "Inpatient admission"
                : enc.class?.code === "EMER" ? "Emergency visit"
                : conceptName(enc.type?.[0]),
            onset: formatDate(day(enc.period?.start)),
            status: (enc.reasonCode ?? []).map(conceptName).join(", ") || undefined,
        })),
        sources: acute,
    }];
}

/** New diagnoses and IBD-relevant procedures (endoscopy, surgery) in the interval. */
function eventFindings(resources: FHIRResourceMap, since: string): BriefFinding[] {
    const findings: BriefFinding[] = [];

    const seen = new Set<string>();
    const conditions = list<Condition>(resources, "Condition")
        .filter(c => day(c.onsetDateTime ?? c.recordedDate) > since)
        .filter(c => !RE_ROUTINE_CONDITION.test(conceptName(c.code)))
        .sort(byDateDesc(c => day(c.onsetDateTime ?? c.recordedDate)))
        .filter(c => {
            const key = conceptName(c.code);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    if (conditions.length) {
        findings.push({
            id: "new-conditions",
            title: `${conditions.length} new ${conditions.length === 1 ? "diagnosis" : "diagnoses"}`,
            description: conditions.slice(0, 3).map(c => conceptName(c.code)).join(", ") + (conditions.length > 3 ? ", …" : "."),
            concern: "low",
            evidence: conditions.map(c => ({
                kind: "condition" as const, name: conceptName(c.code),
                onset: formatDate(day(c.onsetDateTime ?? c.recordedDate)),
                status: c.clinicalStatus?.coding?.[0]?.code,
            })),
            sources: conditions,
        });
    }

    const keywords = [...ENDOSCOPY_KEYWORDS, ...IBD_SURGERY_KEYWORDS];
    const procedures = list<Procedure>(resources, "Procedure")
        .filter(p => day(p.performedPeriod?.start ?? p.performedDateTime) > since)
        .filter(p => keywords.some(k => conceptName(p.code).toLowerCase().includes(k)))
        .sort(byDateDesc(p => day(p.performedPeriod?.start ?? p.performedDateTime)));
    if (procedures.length) {
        findings.push({
            id: "procedures",
            title: `${procedures.length} endoscopy or surgery ${procedures.length === 1 ? "procedure" : "procedures"}`,
            description: procedures.slice(0, 3).map(p => conceptName(p.code)).join(", ") + ".",
            concern: "moderate",
            evidence: procedures.map(p => ({
                kind: "condition" as const, name: conceptName(p.code),
                onset: formatDate(day(p.performedPeriod?.start ?? p.performedDateTime)),
            })),
            sources: procedures,
        });
    }

    return findings;
}

/** The interval's GI notes, newest first, as one finding to read before the visit. */
function notesFinding(resources: FHIRResourceMap, since: string): BriefFinding[] {
    const notes = list<DocumentReference>(resources, "DocumentReference")
        .filter(doc => day(doc.date) > since)
        .filter(doc => /gastroenterology|endoscopy|histopathology|radiology|discharge|operative/i.test(doc.type?.text ?? ""))
        .sort(byDateDesc(doc => day(doc.date)));
    if (!notes.length) return [];

    return [{
        id: "notes",
        title: `${notes.length} GI ${notes.length === 1 ? "note" : "notes"} to review`,
        description: `Written since ${formatDate(since)}. Newest: ${notes[0].type?.text ?? "note"}, ${formatDate(day(notes[0].date))}.`,
        concern: "low",
        evidence: notes.map(doc => ({
            kind: "note" as const,
            title: doc.type?.text ?? "Note",
            date: formatDate(day(doc.date)),
            snippet: documentReferenceText(doc, resources).replace(/\s+/g, " ").slice(0, 240),
        })),
        sources: notes,
    }];
}

// -----------------------------------------------------------------------------
// Entry point
// -----------------------------------------------------------------------------

/** Build the brief from one patient's resources (keyed by resourceType). */
export function buildBrief(resources: FHIRResourceMap): Brief {
    const visits        = clinicVisits(resources);
    const lastVisit     = visits.at(-1) ?? null;
    const previousVisit = visits.at(-2) ?? null;
    const since         = previousVisit ? day(previousVisit.period?.start) : null;

    if (!since) {
        return { previousVisit, lastVisit, since, findings: [] };
    }

    const findings = [
        ...acuteCareFinding(resources, since),
        ...labFindings(resources, since),
        ...medicationFindings(resources, since),
        ...eventFindings(resources, since),
        ...notesFinding(resources, since),
    ]
        .filter(f => f.sources.length > 0)
        .sort((a, b) => CONCERN_RANK[a.concern] - CONCERN_RANK[b.concern]);

    return { previousVisit, lastVisit, since, findings };
}
