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

export interface GenomicsQuery {
    vrs_ids?      : string[]
    regions?      : { chromosome: string, start: number, end: number }[]
    genes?        : string[]
    frequency?    : { operator: "<" | "<=" | ">" | ">=" | "=", value: number }
    pathogenicity?: string[]
    patient_refs? : string[]
    sample_ids?   : string[]
    genotypes?    : string[]
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
 * Runs a query job and waits for its results.
 * @param path The query endpoint, like `query/variant`.
 * @param query The filters. All of them must match.
 * @param limit The most rows to return. The API's default is 20.
 */
export async function runQuery<T>(path: string, query: GenomicsQuery, limit = 1000): Promise<T[]> {
    const res = await fetch(buildUrl(path, { limit }), {
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
        const result = await fetch(buildUrl(`query/results/${executionId}`));

        if (result.status === 200) {
            const rows = await result.json() as T[];
            if (rows.length >= limit) {
                console.warn(`Genomics API: ${path} returned ${rows.length} rows, its limit. Some may be missing.`);
            }
            return rows;
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

/** A sample's metadata. */
export async function getSample(sampleId: string): Promise<SampleRecord> {
    const res = await fetch(buildUrl(`vcf/sample/${encodeURIComponent(sampleId)}`));
    if (!res.ok) {
        throw await failure(res, `loading sample ${sampleId}`);
    }
    const [sample] = await res.json() as SampleRecord[];
    if (!sample) {
        throw new Error(`Genomics API: no sample with id ${sampleId}.`);
    }
    return sample;
}
