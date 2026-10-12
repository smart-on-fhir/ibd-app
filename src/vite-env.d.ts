/// <reference types="vite/client" />

interface ImportMetaEnv {
    /**
     * The FHIR API endpoint, with `{cohort_id}` where the cohort goes. Set in
     * `.env.local`; optional here because nothing guarantees it is.
     */
    readonly VITE_FHIR_API_BASE_URL?: string

    /**
     * The genomics API root, cohort included. Set in `.env.local`; optional
     * here because nothing guarantees it is.
     */
    readonly VITE_GENOMICS_API_BASE_URL?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
