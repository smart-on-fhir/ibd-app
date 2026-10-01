# IBD App

A clinician-facing web app for exploring the records of pediatric patients with
inflammatory bowel disease (IBD). It reads FHIR R4 data from a cohort API and
presents each patient's disease course, notes, and full record, alongside
cohort-level outcome views.

Built by [SMART Health IT](https://smarthealthit.org/) on React, TypeScript,
and Vite, with UI components from
[clinical-primitives](https://github.com/smart-on-fhir/clinical-primitives).

> **Status:** early prototype. Some views use placeholder or bundled data
> rather than a live service; see [Data sources](#data-sources).

## Features

After picking a patient from the cohort list, the patient view offers:

| View                     | What it shows                                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **IBD Timeline**         | An IBD summary (subtype, diagnosis date, Paris classification, and more) above a timeline of IBD medications by drug class and IBD lab panel results. |
| **Similarity Cohort**    | Modeled outcomes for treatment options in a cohort of similar patients, with confidence intervals.                     |
| **Survival Analysis**    | Event-free survival curves for the VEO-IBD cohort, stratified by age at diagnosis, first-line therapy, sex, subtype, or severity, with a risk table. |
| **Health Record Search** | Full-text search across conditions, medications, observations, procedures, allergies, encounters, reports, immunizations, and documents. |
| **Clinical Notes**       | Clinical notes on a timeline, grouped by note type, with the note text and attachments.                                |

## Requirements

- **Node.js** 20.19+, 22.13+, or 24+ (required by Vite 8 and ESLint 10)
- **npm** (ships with Node.js)
- **Git**
- Access to an IHL FHIR cohort API (see [Configuration](#configuration))

## Installation

1. Clone the repository:

   ```sh
   git clone https://github.com/smart-on-fhir/ibd-app.git
   cd ibd-app
   ```

2. Install dependencies:

   ```sh
   npm install
   ```

   `clinical-primitives` is not on npm yet, so it is installed straight from
   [GitHub](https://github.com/smart-on-fhir/clinical-primitives), at the
   commit recorded in `package-lock.json`. npm builds it during the install,
   which makes the first install slower than usual.

3. Create your local environment file (see [Configuration](#configuration)):

   ```sh
   cp .env.example .env.local
   ```

4. Start the dev server:

   ```sh
   npm run dev
   ```

   Then open the URL Vite prints, usually <http://localhost:5173>.

### Updating clinical-primitives

The lockfile pins `clinical-primitives` to one commit, so `npm install` does
not pick up newer changes on its own. To move to the latest commit on its
default branch:

```sh
npm install github:smart-on-fhir/clinical-primitives
```

Commit the updated `package-lock.json` so everyone gets the same version.

### Developing clinical-primitives alongside this app

To work on both at once, clone `clinical-primitives` next to this project and
link it in place of the GitHub copy:

```
your-workspace/
├── clinical-primitives/
└── ibd-app/
```

```sh
cd clinical-primitives
npm install          # also builds the library into dist/
cd ../ibd-app
npm link ../clinical-primitives
```

Changes to the library reach this app once they are rebuilt into its `dist/`.
To rebuild on every save, run `npm run dev:lib` in the `clinical-primitives`
folder alongside `npm run dev` here.

The link does not change `package.json` or `package-lock.json`, so it stays
local to your machine. Any later `npm install` replaces it with the GitHub copy
again; re-run `npm link ../clinical-primitives` afterwards.

## Configuration

Settings are read from `.env.local`, which is git-ignored. Vite reads them at
startup, so restart the dev server (or rebuild) after changing them.

| Variable            | Required | Description                                                                                                         |
| ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL` | Yes      | Base URL of the IHL FHIR API, with `{cohort_id}` where the cohort ID goes. Example: `https://dashboard-test.smartcumulus.org/test/fhir/{cohort_id}` |
| `VITE_COHORT_ID`    | No       | Reserved for later use. The app currently always loads the `sim-ibd-patients` cohort.                               |

If `VITE_API_BASE_URL` is missing, the app logs a warning in the browser
console and every data request fails with a message naming the setting.

> Anything prefixed with `VITE_` is embedded in the built JavaScript and is
> visible to anyone who loads the app. Do not put secrets in these variables.

## Data sources

| Data                          | Source                                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| Patients and FHIR resources   | The IHL FHIR API at `VITE_API_BASE_URL`, cohort `sim-ibd-patients` (simulated patients).                  |
| IBD summary panel             | Placeholder data in `src/pages/IBDSummary.tsx`, pending the summary service.                              |
| Similarity Cohort             | Placeholder numbers in `src/pages/Cohort.tsx`, pending the cohort service.                                |
| Survival Analysis             | A bundled aggregate export, `src/api/veo_ibd_efs_cube_rounded.csv`. Counts are rounded for disclosure control, so totals do not always add up exactly. |

## Scripts

| Command           | Description                                                  |
| ----------------- | ------------------------------------------------------------ |
| `npm run dev`     | Start the Vite dev server with hot reload.                   |
| `npm run build`   | Type-check with `tsc`, then build for production into `dist/`. |
| `npm run preview` | Serve the production build locally with Vite.                |
| `npm start`       | Serve `dist/` in production, on `$PORT` (default 3000).      |
| `npm run lint`    | Run ESLint over the project.                                 |

## Deployment

`npm run build` produces a static site in `dist/`, and `npm start` serves it
with [serve](https://github.com/vercel/serve) on the port in `$PORT`.

Two things to keep in mind on any host:

- **`VITE_API_BASE_URL` is baked in at build time.** Set it in the build
  environment, and rebuild after changing it.
- **Unknown paths must return `index.html`.** The app uses client-side routing
  (`/patients/:id/notes` and similar), so reloading a deep link would otherwise
  return a 404. `npm start` already does this.

## Project structure

```
src/
├── api/          FHIR API client and the bundled survival data
├── components/   Shared UI components
├── hooks/        Data loading, search, and layout hooks
├── lib/          Search indexing, clinical note parsing, survival statistics
├── modules/ibd/  IBD-specific configuration: lab panels and medication classes
├── pages/        One component per route
├── router.tsx    Route definitions
└── main.tsx      Entry point
```

## Troubleshooting

- **`Failed to resolve import "clinical-primitives"`**: the package is not
  installed. Run `npm install`.
- **Errors from inside a linked `clinical-primitives`, or its styles are
  missing**: the local checkout has not been built. Run `npm run build:lib` in
  the `clinical-primitives` folder.
- **"VITE_API_BASE_URL is not set"**: create `.env.local` from `.env.example`
  and restart the dev server.

## License

[Apache License 2.0](LICENSE)
