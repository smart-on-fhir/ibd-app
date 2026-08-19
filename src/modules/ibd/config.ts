import type { TimelineAnalyte } from "clinical-primitives";
import type { IBDMedicationClass } from "./types";

/** ICD-10 prefixes that indicate Crohn's disease */
export const ICD10_CROHNS = ['K50'];

/** ICD-10 prefixes that indicate Ulcerative Colitis */
export const ICD10_UC = ['K51'];

/** ICD-10 prefixes that indicate unclassified/other IBD */
export const ICD10_IBD_U = ['K52'];

/** SNOMED codes for specific IBD subtypes */
export const SNOMED_CROHNS = new Set(['34000006']);
export const SNOMED_UC     = new Set(['64766004']);
export const SNOMED_IBD    = new Set(['24526004', '420789003']);

/** ICD-10 prefixes for perianal/perirectal conditions */
export const ICD10_PERIANAL = ['K60', 'K61', 'K62'];

/** Keywords for perianal/perirectal conditions in text descriptions */
export const PERIANAL_KEYWORDS = [
    'perianal', 'fistula', 'abscess', 'fissure', 'perirectal', 'anal'
];

/** LOINC codes identifying endoscopy / colonoscopy reports in DiagnosticReport */
export const ENDOSCOPY_LOINCS = [
    '18745-0', '11528-7', '28574-2', '47045-0', '77432-0'
];

/** Keywords for matching endoscopy in DiagnosticReport.code.text / coding.display */
export const ENDOSCOPY_KEYWORDS = [
    'colonoscopy', 'endoscopy', 'sigmoidoscopy', 'ileoscopy', 'enteroscopy',
    'capsule endoscopy',
];

/** Keywords indicating prior IBD-related surgery */
export const IBD_SURGERY_KEYWORDS = [
    'colectomy', 'ileostomy', 'colostomy', 'resection', 'proctectomy',
    'j-pouch', 'ileal pouch',
];

/**
 * The IBD laboratory panel: which analytes to show, and the reference intervals
 * quoted for them.
 *
 * Plain {@link TimelineAnalyte} values, so this is data for `ObservationsTimeline`
 * and nothing more — there is no IBD-specific type, and no IBD-specific resolver
 * reading it. It used to have both: an `IBDLabDefinition` that was a subset of
 * `TimelineAnalyte`, and a `panelReferenceRange` that did by hand what
 * `matchBand` now does for any analyte. Two shapes for one idea is how the
 * off-by-one in an age band gets fixed in one of them.
 *
 * IMPORTANT — the intervals here are PEDIATRIC. Every age band falls inside
 * 0–17 years, and several are much narrower than that (hemoglobin 6–8 y,
 * hematocrit 8–11 y, ferritin 6–9 y). They are not valid for an adult patient,
 * and several are not even valid for a child of the wrong age.
 *
 * What enforces that is `matchBand`, which tests the patient's age at the date
 * of each specimen and declines outright when no band covers it. So for an adult
 * this table contributes nothing, which is the intended outcome — an uncolored
 * line reads as "not assessed", where one colored against a child's interval
 * would state a finding that is simply false. Anything else that starts reading
 * these `ranges` must decline on the same terms.
 *
 * Several intervals are marked assay-specific by the source. That needs no
 * handling here: a reading's own `referenceRange` already outranks anything
 * declared, so the performing laboratory's interval wins wherever it reported
 * one.
 *
 * Ordered so related analytes read together: inflammatory markers first, since
 * they are what a flare shows up in, then the anemia workup, then nutritional
 * status, then drug monitoring.
 */
export const IBD_LAB_PANEL: TimelineAnalyte[] = [
    // Inflammatory markers ---------------------------------------------------
    {
        // Three LOINCs for one measurement, and the words a record uses when it
        // carries a local code instead. Given one code only, a feed that reports
        // CRP under another would appear as a separate analyte with a fraction
        // of the trend in it — or, with `showAbsent`, as a lab never ordered.
        code    : ["1988-5", "30522-7", "71426-1"],
        keywords: ["c reactive protein", "crp"],
        label   : "CRP",
        unit    : "mg/L",
        defaultShown: true,
        // The source's CRP row states the band and unit but leaves the numbers
        // blank — not filled in yet rather than "no interval exists" — so the 5
        // mg/L ceiling already here stands. It is a standard-assay figure and
        // does not apply to hs-CRP.
        ranges  : [
            { ageLowYears: 0, ageHighYears: 18, unit: "mg/L", high: 5 }
        ]
    },
    {
        // 38445-3 leads because it is the code this entry has always been keyed
        // by — see `analyteKey`. The supplied list did not include it, so it is
        // kept ahead of the two that were supplied rather than replaced by them.
        code    : ["38445-3"],
        keywords: ["calprotectin"],
        label   : "Calprotectin, stool",
        unit    : "ug/g",
        defaultShown: true,
        // The 0–2 band is deliberately empty, as the source has it: infant stool
        // calprotectin is high enough that no useful ceiling is quoted. It is
        // carried rather than omitted so the gap is legible here — `matchBand`
        // skips a band with no numbers, so those readings plot ungraded.
        ranges  : [
            { ageLowYears: 0, ageHighYears: 2,  unit: "ug/g" },
            { ageLowYears: 2, ageHighYears: 4,  unit: "ug/g", high: 400 },
            { ageLowYears: 4, ageHighYears: 18, unit: "ug/g", high: 50 }
        ]
    },
    {
        // Westergren first, again to hold the existing key; 30341-2 is the
        // generic sedimentation-rate code and was supplied ahead of it.
        code    : ["4537-7", "30341-2"],
        keywords: ["erythrocyte sedimentation", "esr", "sed rate", "sedimentation rate"],
        label   : "ESR, Westergren",
        unit    : "mm/h",
        defaultShown: true,
        // Three bands, widening with age. The record crosses them at 10 and 17,
        // and the chart redraws its band at each crossing rather than grading a
        // whole childhood against one ceiling.
        ranges  : [
            { ageLowYears: 0,  ageHighYears: 10, unit: "mm/h", low: 0, high: 10 },
            { ageLowYears: 10, ageHighYears: 17, unit: "mm/h", low: 0, high: 15 },
            { ageLowYears: 17, ageHighYears: 18, unit: "mm/h", low: 0, high: 20 }
        ]
    },
    {
        code  : "26881-3",
        label : "Interleukin-6",
        unit  : "pg/mL",
        ranges: [{ high: 5.3 }]
    },

    // Anemia workup ----------------------------------------------------------
    {
        code    : ["718-7", "20509-6"],
        keywords: ["hemoglobin", "haemoglobin"],
        label   : "Hemoglobin",
        unit    : "g/dL",
        defaultShown: true,
        ranges  : [{ ageLowYears: 6, ageHighYears: 9, low: 11.5, high: 14.3 }]
    },
    {
        code    : ["4544-3", "20570-8"],
        keywords: ["hematocrit", "haematocrit", "hct", "packed cell"],
        label   : "Hematocrit",
        unit    : "%",
        ranges  : [{ ageLowYears: 8, ageHighYears: 12, low: 35, high: 43 }]
    },
    {
        code    : ["787-2", "30428-7"],
        keywords: ["mean corpuscular volume", "mcv"],
        label   : "MCV",
        unit    : "fL",
        ranges  : [{ ageLowYears: 6, ageHighYears: 12, low: 77.8, high: 91.1 }]
    },
    {
        code    : ["777-3", "26515-7"],
        keywords: ["platelet"],
        label   : "Platelets",
        unit    : "×10⁹/L",
        // Quoted `10*3/uL` by the source and written that way here. It needs no
        // translating: `cleanUnit` normalizes `10*3/uL` and `10*9/L` to one
        // string, because they are the same quantity — so these bands apply
        // whichever spelling a record happens to use.
        ranges  : [
            { ageLowYears: 0, ageHighYears: 1,  unit: "10*3/uL", low: 150, high: 600 },
            { ageLowYears: 1, ageHighYears: 6,  unit: "10*3/uL", low: 150, high: 500 },
            { ageLowYears: 6, ageHighYears: 18, unit: "10*3/uL", low: 150, high: 450 }
        ]
    },
    {
        code    : ["2276-4", "20567-4"],
        keywords: ["ferritin"],
        label   : "Ferritin",
        unit    : "ug/L",
        // One LOINC, two intervals. Choosing between them needs the patient's
        // sex, which is why they are kept apart rather than merged into a
        // widest-span interval that would match neither.
        ranges: [
            { ageLowYears: 6, ageHighYears: 10, sex: "male",   low: 6, high: 111 },
            { ageLowYears: 6, ageHighYears: 10, sex: "female", low: 8, high: 115 }
        ]
    },
    {
        code  : "2498-4",
        label : "Serum Iron",
        unit  : "ug/dL",
        ranges: [{ ageLowYears: 3, ageHighYears: 12, low: 53, high: 119 }]
    },
    {
        code  : "2500-7",
        label : "TIBC",
        unit  : "ug/dL",
        ranges: [{ ageLowYears: 6, ageHighYears: 18, low: 250, high: 400 }]
    },
    {
        code  : "3034-6",
        label : "Transferrin",
        unit  : "mg/dL",
        ranges: [{ ageLowYears: 6, ageHighYears: 18, low: 200, high: 360 }]
    },

    // Nutritional status -----------------------------------------------------
    {
        code    : ["1751-7", "2862-1"],
        keywords: ["albumin"],
        label   : "Albumin",
        unit    : "g/dL",
        ranges  : [
            { ageLowYears: 0, ageHighYears: 1,  unit: "g/dL", low: 2.5, high: 4.8 },
            { ageLowYears: 1, ageHighYears: 4,  unit: "g/dL", low: 3.4, high: 4.5 },
            { ageLowYears: 4, ageHighYears: 18, unit: "g/dL", low: 3.5, high: 5.5 }
        ]
    },
    {
        code  : "2284-8",
        label : "Folate, serum",
        unit  : "ug/L",
        ranges: [{ ageLowYears: 0, ageHighYears: 18, unit: "ug/L", low: 4 }]
    },
    {
        code    : ["2132-9"],
        keywords: ["vitamin b12", "cobalamin", "b-12"],
        label   : "Vitamin B12",
        unit    : "ng/L",
        ranges  : [{ ageLowYears: 0, ageHighYears: 18, unit: "ng/L", low: 180, high: 914 }]
    },
    {
        // 62292-8 first to hold the key; the supplied list did not contain it.
        code    : ["62292-8", "83070-3"],
        keywords: ["vitamin d", "25-oh", "25-hydroxyvitamin"],
        label   : "Vitamin D, 25-OH",
        unit    : "ng/mL",
        ranges  : [{ ageLowYears: 0, ageHighYears: 18, unit: "ng/mL", low: 20, high: 50 }]
    },
    {
        code  : "5763-8",
        label : "Zinc, serum",
        unit  : "ug/dL",
        ranges: [{ ageLowYears: 0, ageHighYears: 11, low: 60, high: 120 }]
    },

    // Drug monitoring --------------------------------------------------------
    {
        code : "39803-2",
        label: "Infliximab / Anti-TNF",
        // No interval on purpose: the source records none, because there is no
        // universal pediatric therapeutic range, and the specimen is a trough.
        // The line is still worth plotting — the trend is the point — it simply
        // gets no band.
    },
    {
        code   : "79713-4",
        label  : "TPMT gene interpretation",
        // A genotype interpretation, not a measurement — there is no number here
        // to plot. It used to say so with a `numeric: false` flag; the section
        // now works that out from the readings themselves and marks the row, so
        // the entry stands as an ordinary member of the panel. Genotype is not
        // the same as enzyme activity; the expected result is a normal
        // metabolizer.
    },

    // Supplied alongside the codes above, and not previously in the panel ------
    //
    // Carried with no `unit` and no `ranges`, deliberately. Nothing supplied
    // either, and inventing them is the one thing this file must not do — a
    // fabricated interval grades a patient, and a fabricated unit silently
    // disables the check that stops a table being compared against data it does
    // not match. Each row still plots: it takes its unit from the readings
    // themselves and is graded against whatever their own `referenceRange` says.
    //
    // Appended rather than filed into the sections above, so the existing rows
    // keep their positions. Order decides which analytes `initiallyShown` checks
    // by default, so interleaving these would have pushed established rows off
    // the default view.
    { code: ["29463-7", "3141-9"], label: "Weight", keywords: ["body weight", "weight"] },
    { code: ["8302-2", "3137-7"],  label: "Height", keywords: ["body height", "height"] },
    { code: ["39156-5"],           label: "BMI",    keywords: ["body mass index", "bmi"] },
    
    // 14338-8 is the serum mass-concentration code; 2877-9 is the same
    // measurement by electrophoresis, kept because a historical record may use
    // it and it is quoted in the same unit basis. LOINC's deprecated 3037-9 is
    // deliberately absent: it is [Enzymatic activity/volume], so its values are
    // U/L and would sit on this row's axis alongside mg/dL as though comparable.
    //
    // Replaces 1809-3 and 2857-1, which are salivary amylase and PSA. Both are
    // real codes for other analytes, so nothing objected to them.
    { code: ["14338-8", "2877-9"] , label: "Pre-albumin",   keywords: ["prealbumin", "pre-albumin", "transthyretin"] },
    
    { code: ["33959-8", "75241-0"], label: "Procalcitonin", keywords: ["procalcitonin", "pct"], defaultShown: true },
    { code: ["6690-2", "26464-8"] , label: "WBC",           keywords: ["white blood cell", "leukocyte", "wbc"] },
    { code: ["789-8", "26453-1"]  , label: "RBC",           keywords: ["red blood cell", "erythrocyte", "rbc"] },
    { code: ["785-6", "28539-5"]  , label: "MCH",           keywords: ["mean corpuscular hemoglobin", "mch"] },
    { code: ["786-4", "28540-3"]  , label: "MCHC",          keywords: ["mchc", "mean corpuscular hemoglobin concentration"] },
    { code: ["788-0"]             , label: "RDW-CV",        keywords: ["red cell distribution width", "rdw"] },
    { code: ["21000-5"]           , label: "RDW-SD",        keywords: ["red cell distribution width", "rdw"] },
    { code: ["751-8", "26499-4"]  , label: "Neutrophils",   keywords: ["neutrophil"] },
    { code: ["731-0", "26474-7"]  , label: "Lymphocytes",   keywords: ["lymphocyte"] },
    { code: ["742-7", "26484-6"]  , label: "Monocytes",     keywords: ["monocyte"] },
    { code: ["711-2", "26449-9"]  , label: "Eosinophils",   keywords: ["eosinophil"] },
    { code: ["704-7", "26444-0"]  , label: "Basophils",     keywords: ["basophil"] },
    { code: ["28542-9", "776-5"]  , label: "MPV",           keywords: ["mean platelet volume", "mpv"] },
    { code: ["1742-6", "1743-4"]  , label: "ALT",           keywords: ["alanine aminotransferase", "alt", "sgpt"] },
    { code: ["1920-8", "30239-8"] , label: "AST",           keywords: ["aspartate aminotransferase", "ast", "sgot"] }
];

/** IBD medication classes ────────────────────────────────────────────────── */

export const IBD_MEDICATION_CLASS: Record<string, IBDMedicationClass> = {
    "AntiTNF"         : { name: "Anti-TNF"         , color: "#CC8C" },
    "AntiInterleukin" : { name: "Anti-interleukin" , color: "#C8CC" },
    "AntiIntegrin"    : { name: "Anti-integrin"    , color: "#3CFC" },
    "JAKInhibitor"    : { name: "JAK Inhibitor"    , color: "#8C8C" },
    "Corticosteroid"  : { name: "Corticosteroid"   , color: "#F88C" },
    "Immunomodulator" : { name: "Immunomodulator"  , color: "#88CC" },
    "Aminosalicylate" : { name: "Aminosalicylate"  , color: "#F9FC" },
    "AdvancedOther"   : { name: "Advanced/Other"   , color: "#8888" },
    "Antibiotic"      : { name: "Antibiotic"       , color: "#FC0C" },     
};

// -----------------------------------------------------------------------------

export const IBD_MED_ADVANCED_OTHER: string[] = [
    "ozanimod",
    "zeposia"
];

export const IBD_MED_AMINOSALICYLATE: string[] = [
    "apriso",
    "azulfidine",
    "balsalazide",
    "canasa",
    "colazal",
    "delzicol",
    "dipentum",
    "lialda",
    "mesalamine",
    "olsalazine",
    "pentasa",
    "rowasa",
    "sulfasalazine",
];

export const IBD_MED_ANTI_INTEGRIN: string[] = [
    "entyvio",
    "natalizumab",
    "tysabri",
    "vedolizumab"
];

export const IBD_MED_ANTI_INTERLEUKIN: string[] = [
    "ustekinumab",
    "risankizumab",
    "guselkumab",
    "mirikizumab",
];

export const IBD_MED_ANTI_TNF: string[] = [
    "abrilada",
    "adalimumab",
    "amjevita",
    "avsola",
    "certolizumab",
    "cimzia",
    "cyltezo",
    "golimumab",
    "hadlima",
    "humira",
    "hyrimoz",
    "idacio",
    "inflectra",
    "infliximab",
    "remicade",
    "renflexis",
    "simlandi",
    "simponi",
    "yusimry",
    "zymfentra",
];

export const IBD_MED_ANTIBIOTIC: string[] = [
    "metronidazole",
    "flagyl",
    "ciprofloxacin",
    "cipro",
    "rifaximin",
    "xifaxan",
    "vancomycin",
    "vancocin",
    "fidaxomicin",
    "dificid",
    "amoxicillin",
    "clavulanate",
    "augmentin",
    "ampicillin",
    "unasyn",
    "piperacillin",
    "tazobactam",
    "zosyn",
    "sulfamethoxazole",
    "trimethoprim",
    "bactrim",
    "septra",
    "clarithromycin",
    "biaxin",
    "levofloxacin",
    "levaquin",
    "doxycycline",
    "vibramycin",
];

export const IBD_MED_CORTICOSTEROID: string[] = [
    "anusol",
    "budesonide",
    "cortenema",
    "cortifoam",
    "deltasone",
    "entocort",
    "hydrocortisone",
    "medrol",
    "prednisolone",
    "prednisone",
    "uceris",
    "methylprednisolone",
    "dexamethasone",
    "triamcinolone",
];

export const IBD_MED_IMMUNOMODULATOR: string[] = [
    "azasan",
    "azathioprine",
    "cellcept",
    "cyclophosphamide",
    "cyclosporine",
    "cytoxan",
    "imuran",
    "mercaptopurine",
    "methotrexate",
    "mycophenolate",
    "mycophenolic",
    "myfortic",
    "neoral",
    "otrexup",
    "prograf",
    "purinethol",
    "rasuvo",
    "sandimmune",
    "tacrolimus",
    "trexall",
];

export const IBD_MED_JAK_INHIBITOR: string[] = [
    "ruxolitinib",
    "tofacitinib",
    "upadacitinib",
    "baricitinib",
    "deucravacitinib",
    "deuruxolitinib",
    "filgotinib",
    "itacitinib",
    "peficitinib",
    "ritlecitinib",
];

export const RE_IBD_MED_ADVANCED_OTHER   = new RegExp(`\\b${IBD_MED_ADVANCED_OTHER  .join('|')}\\b`, 'i');
export const RE_IBD_MED_AMINOSALICYLATE  = new RegExp(`\\b${IBD_MED_AMINOSALICYLATE .join('|')}\\b`, 'i');
export const RE_IBD_MED_ANTI_INTEGRIN    = new RegExp(`\\b${IBD_MED_ANTI_INTEGRIN   .join('|')}\\b`, 'i');
export const RE_IBD_MED_ANTI_INTERLEUKIN = new RegExp(`\\b${IBD_MED_ANTI_INTERLEUKIN.join('|')}\\b`, 'i');
export const RE_IBD_MED_ANTI_TNF         = new RegExp(`\\b${IBD_MED_ANTI_TNF        .join('|')}\\b`, 'i');
export const RE_IBD_MED_ANTIBIOTIC       = new RegExp(`\\b${IBD_MED_ANTIBIOTIC      .join('|')}\\b`, 'i');
export const RE_IBD_MED_CORTICOSTEROID   = new RegExp(`\\b${IBD_MED_CORTICOSTEROID  .join('|')}\\b`, 'i');
export const RE_IBD_MED_IMMUNOMODULATOR  = new RegExp(`\\b${IBD_MED_IMMUNOMODULATOR .join('|')}\\b`, 'i');
export const RE_IBD_MED_JAK_INHIBITOR    = new RegExp(`\\b${IBD_MED_JAK_INHIBITOR   .join('|')}\\b`, 'i');

// -----------------------------------------------------------------------------

export const IBD_BIOLOGICS: string[] = [
    'infliximab', 'adalimumab', 'ustekinumab', 'vedolizumab',
    'risankizumab', 'ozanimod', 'filgotinib', 'tofacitinib',
    'upadacitinib', 'etrasimod', 'mirikizumab',
];

export const IBD_IMMUNOMODULATORS: string[] = [
    'azathioprine', 'mercaptopurine', '6-mp', 'methotrexate',
];

export const IBD_AMINOSALICYLATES: string[] = [
    'mesalamine', 'mesalazine', 'sulfasalazine', 'balsalazide', 'olsalazine',
];

export const IBD_STEROIDS: string[] = [
    'prednisone', 'prednisolone', 'budesonide', 'methylprednisolone',
    'dexamethasone'
];

export const IBD_ANTIBIOTICS: string[] = [
    'ciprofloxacin', 'metronidazole', 'rifaximin', 'amoxicillin',
    'clarithromycin', 'flagyl',
];

