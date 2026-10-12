/**
 * Genomics API client: synthetic germline variant calls, with annotations.
 *
 * Slow queries run as jobs: a POST to `query/...` returns an execution id, and
 * `query/results/{id}` answers 202 until the results are ready.
 */

/**
 * The API root, cohort included. Set in `.env.local`, and read once at
 * startup — changing it needs a dev-server restart or a rebuild.
 */
const GENOMICS_API_BASE_URL = import.meta.env.VITE_GENOMICS_API_BASE_URL;

/** How often a running query is checked on. */
const POLL_INTERVAL = 1500;

/**
 * Queries usually finish in 3-25 seconds, but one has taken three and a half
 * minutes, apparently when the API had been idle. Past this, something is wrong.
 */
const QUERY_TIMEOUT = 300_000;

/** Matches variants by one of their annotations. */
export type AnnotationFilter =
    | { type: "string" , key: string, value: string[] }
    | { type: "numeric", key: string, operator: "<" | "<=" | ">" | ">=" | "=", value: number }
    /**
     * Has the annotation at all. No use for keys every variant carries, empty
     * or not: IHL_ANN__ibd_taxonomy_bucket, for one, then matches everything.
     */
    | { type: "key"    , key: string }

export interface GenomicsQuery {
    vrs_ids?      : string[]
    regions?      : { chromosome: string, start: number, end: number }[]
    genes?        : string[]
    frequency?    : { operator: "<" | "<=" | ">" | ">=" | "=", value: number }
    pathogenicity?: string[]
    patient_refs? : string[]
    sample_ids?   : string[]
    genotypes?    : string[]
    annotations?  : AnnotationFilter[]
}

/** A variant, as `query/variant` returns it. */
export interface VariantRow {
    vrs_id : string
    chrom  : string
    start  : number
    ref    : string
    /** Stringified list, like `[G]`. */
    alleles: string
    gene   : string
}

/**
 * One annotation of one variant, as `query/annotation` returns it. Both values
 * are stringified lists, like `[missense_variant]`, and text is URL-encoded.
 */
export interface AnnotationRow {
    vrs_id     : string
    key        : string
    val_arr_str: string
    val_arr_num: string
}

/** A sequenced sample: a FHIR Specimen, with its nested fields stringified. */
export interface SampleRecord {
    status      : string
    receivedtime: string
    note        : string
    subject     : string
    identifier  : string
}

function buildUrl(path: string, params?: Record<string, string | number>): URL {
    // Thrown rather than left to `new URL()`, whose "Invalid URL" would not
    // say which setting is missing.
    if (!GENOMICS_API_BASE_URL) {
        throw new Error("Cannot reach the genomics API: VITE_GENOMICS_API_BASE_URL is not set in .env.local.");
    }

    const url = new URL(GENOMICS_API_BASE_URL.replace(/\/$/, "") + "/" + path.replace(/^\/+/, ""));
    for (const [key, value] of Object.entries(params ?? {})) {
        url.searchParams.set(key, String(value));
    }
    return url;
}

async function failure(res: Response, what: string): Promise<Error> {
    const body = await res.text().catch(() => "");
    return new Error(`Genomics API: ${what} failed with ${res.status} ${res.statusText}${body ? `: ${body}` : ""}`);
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Jobs allowed to run at once. The API slows down sharply under load — one job
 * among a dozen took three minutes against fifteen seconds for its siblings —
 * so a page that needs many queries waits its turn rather than piling them on.
 */
const MAX_RUNNING_JOBS = 6;

let runningJobs = 0;
const waitingJobs: (() => void)[] = [];

async function withJobSlot<T>(run: () => Promise<T>): Promise<T> {
    if (runningJobs >= MAX_RUNNING_JOBS) {
        await new Promise<void>(resolve => waitingJobs.push(resolve));
    }
    runningJobs++;
    try {
        return await run();
    } finally {
        runningJobs--;
        waitingJobs.shift()?.();
    }
}

/**
 * Runs a query and waits for all of its results, a page at a time, so a large
 * result is never silently cut short.
 * @param path The query endpoint, like `query/variant`.
 * @param query The filters. All of them must match.
 * @param pageSize Rows per page. The API's default is 20.
 */
export async function runQuery<T>(path: string, query: GenomicsQuery, pageSize = 5000): Promise<T[]> {
    const rows: T[] = [];
    for (let offset = 0; ; offset += pageSize) {
        const page = await withJobSlot(() => runJob<T>(path, query, pageSize, offset));
        rows.push(...page);
        if (page.length < pageSize) {
            return rows;
        }
    }
}

/** Attempts at a request that fails in passing before giving up on it. */
const REQUEST_ATTEMPTS = 4;

/**
 * fetch(), retried when the failure looks passing: no response at all, or a
 * gateway error. The API's gateway sends those without CORS headers, so in a
 * browser they arrive as network errors rather than as statuses. Any other
 * response, failed or not, is returned as it is.
 */
async function fetchWithRetry(url: URL, init?: RequestInit): Promise<Response> {
    for (let attempt = 1; ; attempt++) {
        try {
            const res = await fetch(url, init);
            if (![502, 503, 504].includes(res.status) || attempt === REQUEST_ATTEMPTS) {
                return res;
            }
        } catch (error) {
            if (attempt === REQUEST_ATTEMPTS) throw error;
        }
        await sleep(1000 * 2 ** (attempt - 1));
    }
}

/** One query job: starts it, then polls until its results are ready. */
async function runJob<T>(path: string, query: GenomicsQuery, limit: number, offset: number): Promise<T[]> {
    const res = await fetchWithRetry(buildUrl(path, { limit, offset }), {
        method : "POST",
        headers: { "content-type": "application/json" },
        body   : JSON.stringify(query)
    });

    if (!res.ok) {
        throw await failure(res, `starting ${path}`);
    }

    // A bare id despite the JSON content type, so read as text. Quotes are
    // stripped in case that is ever fixed.
    const executionId = (await res.text()).trim().replace(/^"|"$/g, "");
    const deadline    = Date.now() + QUERY_TIMEOUT;

    while (Date.now() < deadline) {
        const result = await fetchWithRetry(buildUrl(`query/results/${executionId}`));

        if (result.status === 200) {
            return await result.json() as T[];
        }

        if (result.status !== 202) {
            throw await failure(result, `running ${path}`);
        }

        await sleep(POLL_INTERVAL);
    }

    throw new Error(`Genomics API: ${path} did not finish within ${QUERY_TIMEOUT / 1000} seconds.`);
}

/** How many variants match a query. */
export async function countVariants(query: GenomicsQuery): Promise<number> {
    const [row] = await runQuery<{ count: number }>("query/variant/count", query);
    return row?.count ?? 0;
}

/**
 * The samples filed under any of the given patient references. A family's
 * samples share one: the patient's FHIR id for their own sample, and the same
 * with `-F` or `-M` appended for their father's and mother's.
 */
export function findSamples(patientRefs: string[]): Promise<SampleRecord[]> {
    return runQuery<SampleRecord>("query/sample", { patient_refs: patientRefs }, 100);
}

/** A sample's id, like `SYNTH_P001`, from the lab identifier in its record. */
export function sampleIdOf(sample: SampleRecord): string | undefined {
    return sample.identifier.match(/specimens, value=([^,}\]]+)/)?.[1];
}

/** The patient reference a sample is filed under. */
export function patientRefOf(sample: SampleRecord): string | undefined {
    return sample.subject.match(/reference=([^,}]+)/)?.[1];
}
