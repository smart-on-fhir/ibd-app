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
    payload?: unknown
    signal?: AbortSignal
    retryOptions?: OperationOptions
}


// const COHORT_ID   = "sim-ibd-patients";
const USE_VPN     = false;
const PUBLIC_URL  = "https://dashboard-test.smartcumulus.org/test/fhir/{cohort_id}";
const PRIVATE_URL = "https://fhmwdbpdmf.execute-api.us-east-1.amazonaws.com/synthetic/{cohort_id}/fhir";

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
    const url = new URL(
        String(USE_VPN ? PRIVATE_URL : PUBLIC_URL)
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
        body   : JSON.stringify(options.payload || {}),
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

async function getResourcesPage(
    cohortId: string,
    resourceType: string,
    options: IHL_API_Query_Options = {}
): Promise<FHIRResource[]> {
    const url = buildUrl(cohortId, resourceType, { offset: options.offset, limit: options.limit });
    
    const json = await request<IHL_API_Response>(url, {
        method : "POST",
        headers: { "content-type": "application/json" },
        body   : JSON.stringify(options.payload || {}),
        signal : options.signal
    }, options.retryOptions);
    
    return json.fhir;
}

export async function getAllResourcePages(
    cohortId: string,
    resourceType: string,
    options: Omit<IHL_API_Query_Options, "offset"> = {},
    onProgress?: (progress: number) => void
): Promise<FHIRResource[]> {
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

export async function getPatient(patientId: string, cohortId: string, options: IHL_API_Query_Options = {}): Promise<Patient> {
    const patients = await getResourcesPage(cohortId, "Patient", options);
    const patient  = patients.find(r => r.id === patientId);
    if (!patient) {
        throw new Error(`Cannot find a patient with id ${patientId}`);
    }
    return patient as Patient;
}
