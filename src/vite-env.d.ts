/// <reference types="vite/client" />

interface ImportMetaEnv {
    /**
     * The FHIR API root, cohort included. Set in `.env.local`.
     *
     * Typed as possibly missing (`?`) because it is whenever `.env.local` is
     * absent or lacks the line, and the type should make code check for that
     * rather than assume a string.
     */
    readonly VITE_FHIR_API_BASE_URL?: string

    /**
     * The genomics API root, cohort included. Set in `.env.local`.
     *
     * Possibly missing for the same reason as VITE_FHIR_API_BASE_URL.
     */
    readonly VITE_GENOMICS_API_BASE_URL?: string

    /**
     * The study API root, cohort included, which serves patient summaries.
     * Optional: without it, the IBD summary uses placeholder data.
     */
    readonly VITE_STUDY_API_BASE_URL?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
