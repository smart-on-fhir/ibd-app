/**
 * IHL API client utilities.
 * @see https://dashboard-test.smartcumulus.org/test/docs#/
 */

import type { Patient }          from "fhir/r4";
import promiseRetry              from "promise-retry";
import type { OperationOptions } from "retry";
import type { FHIRResource }     from "../types/fhir";

export interface IHL_API_Response
{
    fhir: FHIRResource[]
    pagination: IHL_API_Response_Pagination
    otherResources: string[]
}

export interface IHL_API_Response_Pagination
{
    /** Page number */
    count: number
    
    /** Link to the first page, like /fhir/patient/?_offset=0&limit=50 */
    first: string
    
    /** Link to the previous page, like /fhir/patient/?_offset=0&limit=50 */
    previous: string

    /** Link to the next page, like /fhir/patient/?_offset=0&limit=50 */
    next: string

    /** Link to the last page, like /fhir/patient/?_offset=0&limit=50 */
    last: string

    /** How many resources in this page */
    limit: number

    /** How many records have we skipped */
    offset: number
    
    /** How many records we have across all pages */
    total: number
}

export interface IHL_API_Query_Options
{
    offset?: number
    limit?: number
    payload?: Record<string, unknown>
    signal?: AbortSignal
    retryOptions?: OperationOptions

    /**
     * Limits the results to one patient's resources, sent as the `patients`
     * filter in the request body. The API matches that filter against a
     * resource's patient reference, so it is no use for Patient itself: see
     * getAllResourcePages().
     */
    patientId?: string
}

/** The request body: the caller's payload, plus the patient filter if one is given. */
function requestBody(options: IHL_API_Query_Options): string {
    const payload = options.patientId
        ? { ...options.payload, patients: [options.patientId] }
        : options.payload;
    return JSON.stringify(payload || {});
}


// The API base URLs
const FHIR_API_BASE_URL  = import.meta.env.VITE_FHIR_API_BASE_URL as string;
const STUDY_API_BASE_URL = import.meta.env.VITE_STUDY_API_BASE_URL as string;

// Warned about up front, so a missing setting shows in the console at load
// rather than first as a failed request.
if (!FHIR_API_BASE_URL) {
    throw new Error(
        "VITE_FHIR_API_BASE_URL is not set, so no data can be loaded from the API. " +
        "Set it in .env.local and restart the dev server."
    );
}

/**
 * The cohort every request loads, from `VITE_COHORT_ID` in `.env.local`. Falls
 * back to `sim-ibd-patients`, the cohort the app was built against.
 */
export const COHORT_ID = import.meta.env.VITE_COHORT_ID || "sim-ibd-patients";

/**
 * Cache for the available resource types to avoid redundant network requests.
 */
let _availableResourceTypes: Promise<string[]> | null = null;

/**
 * Build a URL for accessing a specific resource within the configured cohort.
 * @param path The path to the resource.
 * @param queryParams Optional query parameters to include in the URL.
 * @returns The constructed URL object.
 */
function buildUrl(path: string, queryParams?: Record<string, string | number | boolean | undefined>): URL {
    const url = new URL(FHIR_API_BASE_URL.replace(/\/$/, "") + '/' + path.replace(/^\/+/, ""));

    if (queryParams) {
        for (const [key, value] of Object.entries(queryParams)) {
            if (value === undefined) continue;
            url.searchParams.set(key, String(value));
        }
    }

    return url;
}

/**
 * fetch() wrapper that retries on network errors and 5xx responses using
 * exponential backoff (via promise-retry). 4xx responses are returned as-is
 * since retrying won't help - callers still need to check `res.ok`.
 */
async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit, retryOptions?: OperationOptions): Promise<Response> {
    return promiseRetry(async (retry, attempt) => {
        let res: Response;
        try {
            res = await fetch(input, init);
        } catch (err) {
            // Cancelled by the caller: retrying would only fail again.
            if ((err as Error).name === "AbortError") {
                throw err;
            }
            return retry(err as Error);
        }

        if (!res.ok && res.status >= 500) {
            return retry(new Error(`Request failed (attempt ${attempt}): ${res.status} ${res.statusText}`));
        }

        return res;
    }, { retries: 3, factor: 2, minTimeout: 500, ...retryOptions });
}

/**
 * Request wrapper that retries on failure and returns the parsed JSON response.
 * @param input The URL or RequestInfo to fetch.
 * @param init The RequestInit options for the fetch call.
 * @param retryOptions Options for retrying the request on failure.
 * @returns The parsed JSON response of type T.
 */
async function request<T = unknown>(input: RequestInfo | URL, init?: RequestInit, retryOptions?: OperationOptions): Promise<T> {
    const res = await fetchWithRetry(input, init, retryOptions);

    if (!res.ok) {
        throw new Error(`Failed to fetch from ${init?.method ?? "GET"} ${input} -> ${res.status} ${res.statusText}`);
    }

    return await res.json() as T;
}

// =============================================================================
// FHIR API
// =============================================================================

/**
 * Load the available resource types for the configured cohort.
 * @param retryOptions Optional retry options and abort signal.
 * @returns A promise that resolves to an array of available resource types.
 */
export async function loadAvailableResourceTypes({ retryOptions, signal }: { retryOptions?: OperationOptions, signal?: AbortSignal } = {}): Promise<string[]> {
    if (!_availableResourceTypes) {
        const url = buildUrl("resources");
        _availableResourceTypes = request<string[]>(url, { signal }, retryOptions);
    }
    return _availableResourceTypes;
}

/**
 * Get all resources of a specific type for a given cohort. Note that the result
 * is paginated and we are only getting one page here.
 * @param resourceType 
 * @param options 
 * @returns 
 */
export async function getResources(resourceType: string, options: IHL_API_Query_Options = {}): Promise<IHL_API_Response> {
    const url = buildUrl(resourceType, { offset: options.offset, limit: options.limit });
    return request<IHL_API_Response>(url, {
        method : "POST",
        headers: { "content-type": "application/json" },
        body   : requestBody(options),
        signal : options.signal
    }, options.retryOptions);
}

/**
 * Get all patients for the configured cohort. Uses pagination to retrieve all pages.
 * @param options Query options for the API request.
 */
export async function getAllPatients(options: IHL_API_Query_Options = {}): Promise<Patient[]> {
    const patients = await getAllResourcePages("Patient", options);
    return patients as Patient[];
}

export async function getAllResourcePages(
    resourceType: string,
    options: Omit<IHL_API_Query_Options, "offset"> = {},
    onProgress?: (progress: number) => void
): Promise<FHIRResource[]> {
    // The API filters by the resource's patient reference, which a Patient
    // does not have, so a filtered Patient request comes back empty. Fetched
    // whole and picked out here instead.
    if (resourceType === "Patient" && options.patientId) {
        const { patientId, ...rest } = options;
        // const patients = await getAllResourcePages(resourceType, rest, onProgress);
        // return patients.filter(patient => patient.id === patientId);
        return [await getPatient(patientId, rest)];
    }

    const out: FHIRResource[] = [];

    let offset = 0, total: number;

    do {
        const json = await getResources(resourceType, { ...options, offset });
        out.push(...json.fhir);
        total  = json.pagination.total;
        offset = json.pagination.offset + json.pagination.limit;
        if (onProgress) {
            onProgress(total > 0 ? Math.min(offset / total, 1) : 1);
        }
    } while (offset < total);

    return out;
}

/**
 * Fetch a single patient by ID.
 * 
 * **NOTE:** Currently, the `/Patient` endpoint does not support filtering by
 * patient ID directly, so this function fetches all patients and filters locally.
 * @param patientId The ID of the patient to fetch.
 * @param cohortId The cohort ID to query within.
 * @param options Query options for the API request.
 */
export async function getPatient(patientId: string, options: IHL_API_Query_Options = {}): Promise<Patient> {

    const res = await getResources("Patient", { ...options, patientId });
    const patient  = res.fhir[0]
    // const patients = await getAllResourcePages("Patient", options });
    // const patient  = patients.find(r => r.id === patientId);
    if (!patient) {
        throw new Error(`Cannot find a patient with id ${patientId}`);
    }
    return patient as Patient;
}

// =============================================================================
// Implement Study API
// =============================================================================

export async function getPatientSummary(patientId: string) {

    // The API response and the App's implementation are not compatible yet. We
    // currently just logs the response for debugging purposes.
    if (STUDY_API_BASE_URL) {
        fetch(`${STUDY_API_BASE_URL}/patient/summary?version=007`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ subject_ref: patientId })
        }).then(response => {
            if (!response.ok) {
                throw new Error(`Failed to fetch patient summary: ${response.statusText}`);
            }
            return response.json();
        }).then(json => {
            console.log(json);
        }).catch(error => {
            console.error("Failed to fetch patient summary:", error);
        });
    }
    
    /*
    {
        "subject_ref": "Patient/29c70fc826dcd14048563a07cbb3f74fe7b20785ce0e81926864620d92b84994",
        "fields": {
            "ibd_diagnosis_subtype_best": {
                "display": "Best IBD Diagnosis Subtype",
                "description": "IBD subtype carried by the winning diagnosis-date evidence row.",
                "details": "Values CD/UC/IBDU/IBD_NOS. Provenance of the anchor only; do not use for subtype cohorts or arm assignment.",
                "type": "string",
                "label": "IBD Type",
                "value": "UC",
                "category": "Overview",
                "source_refs": []
            },
            "ibd_diagnosis_date_best": {
                "display": "Best IBD Diagnosis Date",
                "description": "Final resolved IBD diagnosis (establishment) date, winner of the 5-rung resolution ladder.",
                "details": "",
                "type": "day",
                "label": "IBD Diagnosis Date",
                "value": "2019-11-01",
                "category": "Overview",
                "source_refs": []
            },
            "paris_classification": {
                "label": "Paris Classification",
                "value": "A1A E4 S1",
                "category": "Overview",
                "source_refs": [
                    "DocumentReference/b0edc35c1659429ec5cf48a314ecc1015a175c68da6eacb20d2404889a9c36f7",
                    "DocumentReference/b12d6db61ea7e0eb9257ad3c706d880566c12f54939e78ffdb09456fa5376cf6",
                    "DocumentReference/3aac8f0348a2a0242dec750fcd288cd19d6069a8847eafb79b8d55bf82978cac",
                    "DocumentReference/9ab4cb8cd847a11457caf8b4b70e8424af60ce47ef36bde20a75ec8bfdea95ea",
                    "DocumentReference/d185f73af10817f3ec21bb5e6b1e0a494e21726d17b888b975a0cfb85e8de793",
                    "DocumentReference/5f3e450252550fd6fc5b8b7c61f9fb4fc802b16a12ea6e802532d8f870c38972",
                    "DocumentReference/065f3512b0597ca56905d902d1e6a9486e3357085e99f7f30b00268737253b5a",
                    "DocumentReference/480fd7189eb957ce00f0d2474c990a3c4d1e30e5a6e655f6828feab4ba1e2388",
                    "DocumentReference/5272bc540ed88666a72dbb445288728438afb81d911da2987406e3dcc0f0b7b2",
                    "DocumentReference/dc1d78440474ededea0c026d28c4d05971bf90e55183512eaa0d3cc6d21ca75e",
                    "DocumentReference/bf6eb69f08ddb2ad02686beae57a2dd0a05e281cb2acb84fc093f968189bd863",
                    "DocumentReference/507c3b8f8243cf1aefbdf7484dcbb3f5182d30cd531a31eacafe7a8d76222132",
                    "DocumentReference/76293ae753d2983949e52cb91bf26be8d68d2f2d25711b9536ca9b94b77396be",
                    "DocumentReference/62cbfcab8b8a3be1df4946f98188a3d359c4ebf16c5072a4da13dbed19998791",
                    "DocumentReference/b9c9b6b90d61cdabcf4573c090c65cd3ddea28465573f2a1daae71f0121c1841",
                    "DocumentReference/861871d8f5f68fbfbe2c2682b684237514f7d17a113fb334b549cfd0450ec0bb",
                    "DocumentReference/e5386e36ea4f7707274585e33d051ef2a112f2d873e2ddfb366122357427f35f",
                    "DocumentReference/7c024e7c5a3e0c8583799346655504fac35f2d19ec58586cac70ebcc38701b86",
                    "DocumentReference/b44007b52f5772e897dd7ca3d0c357b9f767d7b3bfb60d05fec2fc711e1148f1",
                    "DocumentReference/4ab206c483e78e24e46b3cf02eb717e88939b3d676fd47d8590653a771e09af3",
                    "DocumentReference/3bdf4eb27ab904ccfc8e97d5950fa8b296f3268938afc2520e63ede0137f4ff4",
                    "DocumentReference/805f8a0aa4314b6d18876e1dd66985017a56047bc31e1dfedf78d60b480ef2ae",
                    "DocumentReference/c8b407629cbc876d1ae8043c9fc49ee9dfbc6c5cdd26635a067bf9076cc85ebc",
                    "DocumentReference/eefb70b1b45987234bed2f39603431541f300198421bee09c38d7a1861dc4c1f",
                    "DocumentReference/7b21f8f6752b5559e21e955d46baf600d2b21711c66e4e1bf655c8d512111f45",
                    "DocumentReference/306a4b816be9cf33588d9c6f8adf82049fde4ee5ec9e4403db8bc110816014c8",
                    "DocumentReference/2e9c8d4b88401cd7ebcd7e81c465d019de9c354bb1fe3f1503f7d7929bdcc300",
                    "DocumentReference/036ce9ea785f17aa1c1017351ca844fd7f88e507683ca2c75df4ce9000763a14",
                    "DocumentReference/fbabf4eeba73aab3f421b94b40141ceaf7a5b9f3ab399b001e663b1953736788",
                    "DocumentReference/8af1fe5e6abec44f396a64770f780f912fc086643b000114317ed14f7c345dcc",
                    "DocumentReference/6b0b9bf5cce96d2fdfb39e1b862b40448c61a8cfe7f201b153027cb0ac69f6b7",
                    "DocumentReference/26b9abe29b958568d3a701bd0a413568c4d227dc3691a5b53a3082c979c68639",
                    "DocumentReference/1c29a0397025d39fda7ab731562452a09120115642ce553a016af1ab30e3f621",
                    "DocumentReference/539cbad9598bdd6edad2a9ac918bdb4280f30662106eebfa898cff2c41e638bd",
                    "DocumentReference/600baf54fbc3122ff92e35b6c79636cb5e9e3859a9b82d7ea0c53361ee7e5e07",
                    "DocumentReference/33d1cdd348f8816652453d2c85792cfbee837a35dc03ace2dea4c16f417a8f58",
                    "DocumentReference/c5816a4f6695585e72ed7ba1a4f6918ae2dec162d5d3eb34d7a2d0ed0293933b",
                    "DocumentReference/dbdd6523e6f5b55131983af51df0859fc44ac75259ba9458ec2ab65ecc2815b9",
                    "DocumentReference/34774e9f70cb2d196486ae3c5757523b4beab4c457f6d02a2130d327351c2364",
                    "DocumentReference/1a3e126e208a65b9122065c0c3d67ebee04505f9cc07040945a4b4b34738be9d",
                    "DocumentReference/7e48db24f27af515a2ea3ac26838ca0337ae5720601017d4583dcaa373212c6a",
                    "DocumentReference/c8f6c49cbb92465ddd9c7edd96b0208d629825750e22688858408a8a136fc510",
                    "DocumentReference/cf344703dc8e66b43725366593813065ba1c26d4591a2c819ecfd7617f526793",
                    "DocumentReference/c112a64174a4ecf3be5911dd283377a0fa75252ded48eb0a3eb016f088f0486f",
                    "DocumentReference/c50c7f2bce819edf402afbe22cd6bcf4a58dab5768cc46e6d87c0f0982795ae1",
                    "DocumentReference/c9033641abe8c87f837224e84e116e84238d727452bd2c879c7075f5d02d72c3",
                    "DocumentReference/cb181d27eb5f134156a5adbdc79a0915393039699904e7a71eb1b91818004ea2",
                    "DocumentReference/3bd809d7ed2f16fd55e9e51565cd802e2be92dd32197918709ffd13770dda24e",
                    "DocumentReference/949dcf61fd83b144723af22ae78ff7760b2c8e71545727bf8d46f84d0c3f16ce",
                    "DocumentReference/4e825aa6300e35fe03a3ffe5af44e80a49c69af7b95bac4902a154031ce827a3",
                    "DocumentReference/07fc1c69655dafd01a02b29c84496dc9fc7f1f7826521c07626d9713fa348e41",
                    "DocumentReference/bb94af0a9f610b4e58611b0d84fa9cee726dac6c3f28b24395a83fa6a3356fd7",
                    "DocumentReference/fcc802a79386f3d3602fa47776d4f8d57c08a5730274d1dd6bec976d21640e60",
                    "DocumentReference/1d7eb6bea8849061a3324b11384552cecceebccfdab7a6d55cd1729f1a23e17c",
                    "DocumentReference/b62c9ebbb2041d9e0ede1bf8a61e897728e43a4c05ddb86dfe77e89c08e35c68"
                ]
            },
            "endoscopy_details": {
                "label": "Endoscopy Details",
                "value": {},
                "category": "Overview",
                "source_refs": []
            },
            "activity_index": {
                "label": "Activity Index",
                "value": {},
                "category": "Overview",
                "source_refs": []
            },
            "abdominal_pain": {
                "details": "\n note_author_date:Author date of a clinical note - one canonical value per note via ibd__sample_casedef_author.",
                "label": "Abdominal Pain",
                "value": {
                    "note_author_date": "2026-07-13",
                    "abdominal_pain": "NONE"
                },
                "category": "Current Symptoms",
                "source_refs": [
                    "DocumentReference/c8f6c49cbb92465ddd9c7edd96b0208d629825750e22688858408a8a136fc510"
                ]
            },
            "stool_frequency": {
                "label": "Stool Frequency",
                "value": {},
                "category": "Current Symptoms",
                "source_refs": []
            },
            "weight_loss": {
                "details": "\n event_date:NULL when no defensible date exists; sort NULLS LAST.\n\n value_text:Text payload of a timeline event (enums, subtypes, display strings).\n\n code:Valueset concept code (e.g. ICD-10/RxNorm/LOINC).",
                "label": "Weight Loss",
                "value": {
                    "event_date": "2019-12-03",
                    "value_text": "Failure to thrive (child)",
                    "code": "R62.51",
                    "pcdai_weight_date": "2026-07-13",
                    "pcdai_weight": "GAIN_OR_VOLUNTARY",
                    "pcdai_weight_spans": "[[1877, 1953]]"
                },
                "category": "Current Symptoms",
                "source_refs": [
                    "Condition/41fa37f8038f85869beaa671356ea32200db7e0945c613010954b2aecde46923",
                    "DocumentReference/c8f6c49cbb92465ddd9c7edd96b0208d629825750e22688858408a8a136fc510"
                ]
            },
            "nocturnal_stool": {
                "details": "\n note_author_date:Author date of a clinical note - one canonical value per note via ibd__sample_casedef_author.",
                "label": "Nocturnal Stool",
                "value": {
                    "note_author_date": "2026-07-13",
                    "nocturnal_stools": "NOT_ASSESSED",
                    "stools_per_day": "NUM_STOOLS_3_TO_5"
                },
                "category": "Current Symptoms",
                "source_refs": [
                    "DocumentReference/c8f6c49cbb92465ddd9c7edd96b0208d629825750e22688858408a8a136fc510"
                ]
            },
            "last_pcdai": {
                "label": "Last PCDAI",
                "value": {},
                "category": "Current Symptoms",
                "source_refs": []
            },
            "steroid_exposure": {
                "label": "Steroid Exposure",
                "value": {
                    "steroid_exposed_bool": true,
                    "first_steroid_date": "2012-05-30",
                    "last_steroid_date": "2026-01-20"
                },
                "category": "Key Facts",
                "source_refs": [
                    "MedicationRequest/9b60ede7bf89e7d20e30cc758236f36dbe7a6f292fdfe8acdaec80312097115c",
                    "MedicationRequest/0681ddef6c6cce33a7149f6727732d2f5fa68c92b5423854f7205939a23f53f1",
                    "DocumentReference/dc1d78440474ededea0c026d28c4d05971bf90e55183512eaa0d3cc6d21ca75e",
                    "DocumentReference/eefb70b1b45987234bed2f39603431541f300198421bee09c38d7a1861dc4c1f",
                    "DocumentReference/507c3b8f8243cf1aefbdf7484dcbb3f5182d30cd531a31eacafe7a8d76222132",
                    "DocumentReference/5f3e450252550fd6fc5b8b7c61f9fb4fc802b16a12ea6e802532d8f870c38972",
                    "DocumentReference/b62c9ebbb2041d9e0ede1bf8a61e897728e43a4c05ddb86dfe77e89c08e35c68",
                    "DocumentReference/949dcf61fd83b144723af22ae78ff7760b2c8e71545727bf8d46f84d0c3f16ce",
                    "DocumentReference/b12d6db61ea7e0eb9257ad3c706d880566c12f54939e78ffdb09456fa5376cf6",
                    "DocumentReference/1a3e126e208a65b9122065c0c3d67ebee04505f9cc07040945a4b4b34738be9d",
                    "DocumentReference/cf344703dc8e66b43725366593813065ba1c26d4591a2c819ecfd7617f526793",
                    "DocumentReference/1c29a0397025d39fda7ab731562452a09120115642ce553a016af1ab30e3f621",
                    "DocumentReference/b0edc35c1659429ec5cf48a314ecc1015a175c68da6eacb20d2404889a9c36f7",
                    "DocumentReference/fcc802a79386f3d3602fa47776d4f8d57c08a5730274d1dd6bec976d21640e60",
                    "DocumentReference/ef504e0e34d214d1875e523ab427088127d1c7fddcfb047eab243de3339fa223",
                    "DocumentReference/2e9c8d4b88401cd7ebcd7e81c465d019de9c354bb1fe3f1503f7d7929bdcc300",
                    "DocumentReference/bb94af0a9f610b4e58611b0d84fa9cee726dac6c3f28b24395a83fa6a3356fd7",
                    "DocumentReference/8af1fe5e6abec44f396a64770f780f912fc086643b000114317ed14f7c345dcc",
                    "DocumentReference/cb181d27eb5f134156a5adbdc79a0915393039699904e7a71eb1b91818004ea2",
                    "DocumentReference/1d7eb6bea8849061a3324b11384552cecceebccfdab7a6d55cd1729f1a23e17c",
                    "DocumentReference/e5386e36ea4f7707274585e33d051ef2a112f2d873e2ddfb366122357427f35f",
                    "MedicationRequest/0a69f482af9157d60857da1e07a6614745c28419954c6eba37c89237a35d92b6",
                    "DocumentReference/c8f6c49cbb92465ddd9c7edd96b0208d629825750e22688858408a8a136fc510",
                    "DocumentReference/c8b407629cbc876d1ae8043c9fc49ee9dfbc6c5cdd26635a067bf9076cc85ebc",
                    "DocumentReference/b9c9b6b90d61cdabcf4573c090c65cd3ddea28465573f2a1daae71f0121c1841",
                    "DocumentReference/c112a64174a4ecf3be5911dd283377a0fa75252ded48eb0a3eb016f088f0486f",
                    "DocumentReference/b44007b52f5772e897dd7ca3d0c357b9f767d7b3bfb60d05fec2fc711e1148f1",
                    "DocumentReference/76293ae753d2983949e52cb91bf26be8d68d2f2d25711b9536ca9b94b77396be",
                    "DocumentReference/d185f73af10817f3ec21bb5e6b1e0a494e21726d17b888b975a0cfb85e8de793",
                    "DocumentReference/7c024e7c5a3e0c8583799346655504fac35f2d19ec58586cac70ebcc38701b86",
                    "DocumentReference/600baf54fbc3122ff92e35b6c79636cb5e9e3859a9b82d7ea0c53361ee7e5e07",
                    "DocumentReference/306a4b816be9cf33588d9c6f8adf82049fde4ee5ec9e4403db8bc110816014c8",
                    "DocumentReference/5272bc540ed88666a72dbb445288728438afb81d911da2987406e3dcc0f0b7b2",
                    "DocumentReference/3aac8f0348a2a0242dec750fcd288cd19d6069a8847eafb79b8d55bf82978cac",
                    "DocumentReference/7b21f8f6752b5559e21e955d46baf600d2b21711c66e4e1bf655c8d512111f45",
                    "DocumentReference/dbdd6523e6f5b55131983af51df0859fc44ac75259ba9458ec2ab65ecc2815b9",
                    "DocumentReference/480fd7189eb957ce00f0d2474c990a3c4d1e30e5a6e655f6828feab4ba1e2388",
                    "DocumentReference/c9033641abe8c87f837224e84e116e84238d727452bd2c879c7075f5d02d72c3",
                    "DocumentReference/34774e9f70cb2d196486ae3c5757523b4beab4c457f6d02a2130d327351c2364",
                    "DocumentReference/3bd809d7ed2f16fd55e9e51565cd802e2be92dd32197918709ffd13770dda24e",
                    "DocumentReference/bf6eb69f08ddb2ad02686beae57a2dd0a05e281cb2acb84fc093f968189bd863",
                    "MedicationRequest/37058b780dc67399edaa568f7a824c1b80fa6c8471f91859962ba57108810a58",
                    "MedicationRequest/d3a82c6689c8cc383d611c43d14945e4c04b2286e133b40a52e04a85e4d6bec7",
                    "MedicationRequest/48e3098c3878b969f14dadf13643c2a6f3fa05136367cf3c0213ce1e6fcb982e"
                ]
            },
            "prior_surgery": {
                "details": "\n first_qualifying_surgery_date:Date of the first qualifying IBD surgery\n\n first_qualifying_surgery_type:Type of the first qualifying IBD surgery",
                "label": "Prior Surgery",
                "value": {
                    "prior_surgery_bool": true,
                    "first_qualifying_surgery_date": "2023-09-02",
                    "first_qualifying_surgery_type": "OSTOMY_OR_FECAL_DIVERSION"
                },
                "category": "Key Facts",
                "source_refs": []
            },
            "perianal_disease": {
                "details": "\n paris_cd_perianal_ever:Crohn disease Paris perianal disease modifier at maximum extent or severity across all notes - describes the phenotype after progression so it is not a model covariate",
                "label": "Perianal Disease",
                "value": {
                    "paris_cd_perianal_ever": null,
                    "latest_coded_perianal_date": null
                },
                "category": "Key Facts",
                "source_refs": []
            }
        }
    }
    */
    return {
        subject_ref: `Patient/${patientId}`,
        fields: {
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
                "source_refs": [
                    "DocumentReference/88b29593366e5e110f78723b8a7431b7b1022320b44e7bcd5a7efea641ef6a9a"
                ],
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
                "source_refs": [
                    "DocumentReference/96fd9c30b68076c73bab27617e21ed0fb5b5bc0e2f4e727449ee13ecac44f541"
                ],
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
}
