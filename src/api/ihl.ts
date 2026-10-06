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


/**
 * The FHIR API endpoint, with `{cohort_id}` where the cohort goes. Set in
 * `.env.local`, and read once at startup — changing it needs a dev-server
 * restart or a rebuild.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Warned about up front, so a missing setting shows in the console at load
// rather than first as a failed request.
if (!API_BASE_URL) {
    console.warn(
        "VITE_API_BASE_URL is not set, so no data can be loaded from the API. " +
        "Set it in .env.local and restart the dev server."
    );
}

/**
 * Cache for the available resource types to avoid redundant network requests.
 */
let _availableResourceTypes: Promise<string[]> | null = null;

/**
 * Build a URL for accessing a specific resource within a cohort.
 * @param cohortId The ID of the cohort.
 * @param path The path to the resource.
 * @param queryParams Optional query parameters to include in the URL.
 * @returns The constructed URL object.
 */
function buildUrl(cohortId: string, path: string, queryParams?: Record<string, string | number | boolean | undefined>): URL {
    // Thrown rather than left to `new URL()`, whose "Invalid URL" would not
    // say which setting is missing.
    if (!API_BASE_URL) {
        throw new Error("Cannot reach the API: VITE_API_BASE_URL is not set in .env.local.");
    }

    const url = new URL(
        API_BASE_URL
        .replace("{cohort_id}", cohortId)
        .replace(/\/$/, "")
        + '/' + path.replace(/^\/+/, "")
    );

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
 * Load the available resource types for a given cohort.
 * @param cohortId The ID of the cohort.
 * @param retryOptions Optional retry options and abort signal.
 * @returns A promise that resolves to an array of available resource types.
 */
export async function loadAvailableResourceTypes(cohortId: string, { retryOptions, signal }: { retryOptions?: OperationOptions, signal?: AbortSignal } = {}): Promise<string[]> {
    if (!_availableResourceTypes) {
        const url = buildUrl(cohortId, "resources");
        _availableResourceTypes = request<string[]>(url, { signal }, retryOptions);
    }
    return _availableResourceTypes;
}

/**
 * Get all resources of a specific type for a given cohort. Note that the result
 * is paginated and we are only getting one page here.
 * @param cohortId
 * @param resourceType 
 * @param options 
 * @returns 
 */
export async function getResources(cohortId: string, resourceType: string, options: IHL_API_Query_Options = {}): Promise<IHL_API_Response> {
    const url = buildUrl(cohortId, resourceType, { offset: options.offset, limit: options.limit });
    return request<IHL_API_Response>(url, {
        method : "POST",
        headers: { "content-type": "application/json" },
        body   : requestBody(options),
        signal : options.signal
    }, options.retryOptions);
}

/**
 * Get all patients for a given cohort. Uses pagination to retrieve all pages.
 * @param cohortId The ID of the cohort to retrieve patients for.
 * @param options Query options for the API request.
 */
export async function getAllPatients(cohortId: string, options: IHL_API_Query_Options = {}): Promise<Patient[]> {
    const patients = await getAllResourcePages(cohortId, "Patient", options);
    return patients as Patient[];
}

export async function getAllResourcePages(
    cohortId: string,
    resourceType: string,
    options: Omit<IHL_API_Query_Options, "offset"> = {},
    onProgress?: (progress: number) => void
): Promise<FHIRResource[]> {
    // The API filters by the resource's patient reference, which a Patient
    // does not have, so a filtered Patient request comes back empty. Fetched
    // whole and picked out here instead.
    if (resourceType === "Patient" && options.patientId) {
        const { patientId, ...rest } = options;
        const patients = await getAllResourcePages(cohortId, resourceType, rest, onProgress);
        return patients.filter(patient => patient.id === patientId);
    }

    const out: FHIRResource[] = [];

    let offset = 0, total: number;

    do {
        const json = await getResources(cohortId, resourceType, { ...options, offset });
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
export async function getPatient(patientId: string, cohortId: string, options: IHL_API_Query_Options = {}): Promise<Patient> {
    const patients = await getAllResourcePages(cohortId, "Patient", options);
    const patient  = patients.find(r => r.id === patientId);
    if (!patient) {
        throw new Error(`Cannot find a patient with id ${patientId}`);
    }
    return patient as Patient;
}

// =============================================================================
// Implement Study API
// =============================================================================

export async function getPatientSummary(patientId: string) {
    await new Promise(resolve => setTimeout(resolve, 5000));
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
