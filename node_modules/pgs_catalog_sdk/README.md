# pgs_catalog_sdk

Browser-first JavaScript SDK for retrieving **PGS Catalog** score and trait data, caching it with `localforage`, and powering the included demo dashboard. A separate Node-safe bundle is provided for server and cloud deployments.

## Live demo

https://lorenasandoval88.github.io/pgs_catalog_sdk/

## Documentation

Additional usage notes are available in the [project wiki](https://github.com/lorenasandoval88/pgs_catalog_sdk/wiki).

## Quick start

Test the published bundle directly in a browser console:

```javascript
const sdk = await import("https://lorenasandoval88.github.io/pgs_catalog_sdk/dist/sdk.mjs");

const scores = await sdk.fetchAllScores();
const categories = await sdk.getScoresPerCategory();

console.log({ scores, categories });
```

<img width="1005" height="405" alt="image" src="https://github.com/user-attachments/assets/f72a2125-3b67-4fb2-b79c-9fee62b83345" />

## Project structure

| Path | Purpose |
| --- | --- |
| `sdk.js` | Browser SDK entry point (bundled to `dist/sdk.mjs`). |
| `cloudNodeEntry.js` | Node/cloud SDK entry point (bundled to `dist/cloud_sdk.mjs`). |
| `index.html` | Demo dashboard page. |
| `rollup.config.mjs` | Build configuration for all bundles. |
| `test-cloud-sdk.mjs` | Smoke test that validates the cloud bundle export surface. |
| `src/js/getPGS_loadScores.js` | Score loading, caching, summaries, and trait/category aggregations. |
| `src/js/getPGS_loadTraits.js` | Trait loading, caching, and summary generation. |
| `src/js/getPGS_loadTxts.js` | Scoring file download, parsing, and cache management. |
| `src/js/landingPage.js` | Dashboard rendering helpers and internal stats loaders. |
| `src/js/storage.js` | Storage inspection utilities. |
| `src/js/getPGS_main.js` | Demo-page bootstrap. |
| `src/js/cloud/pgs_node.js` | Node-safe implementation of the core loaders (no browser APIs). |
| `src/css/styles.css` | Demo-page styles. |
| `dist/` | Generated bundles. |

## Build and run

Install dependencies and build the bundles:

```bash
npm install
npm run build
```

The build generates:

| Output | Entry | Target |
| --- | --- | --- |
| `dist/sdk.mjs` | `sdk.js` | Browser |
| `dist/main.mjs` | `src/js/getPGS_main.js` | Browser (demo page) |
| `dist/loadScores.bundle.mjs` | `src/js/getPGS_loadScores.js` | Browser |
| `dist/loadTraits.bundle.mjs` | `src/js/getPGS_loadTraits.js` | Browser |
| `dist/cloud_sdk.mjs` | `cloudNodeEntry.js` | Node |

To try the demo locally, serve the repository root with any static file server and open `index.html`.

---

## Browser SDK API

Exports from `sdk.js` / `dist/sdk.mjs`:

| Export | Signature | Description |
| --- | --- | --- |
| `localforage` | — | Re-export of the `localforage` instance used for caching. |
| `fetchAllScores` | `fetchAllScores({ cache = true, pageSize = 200 } = {})` | Loads every score record from the PGS Catalog (paginated), cached by default. |
| `fetchSomeScores` | `fetchSomeScores(ids, ...args)` | Loads specific scores by id. Accepts an array, multiple id arguments, or a trailing options object. |
| `getScoresPerTrait` | `getScoresPerTrait({ forceRefresh = false, maxTraits = Infinity, onStatus } = {})` | Aggregates score counts per reported trait. |
| `getScoresPerCategory` | `getScoresPerCategory({ forceRefresh = false, maxCategories = Infinity, onStatus } = {})` | Aggregates score counts per trait category. |
| `getPgsTxt` | `getPgsTxt(input, optionalArg, cache = true)` | Loads and parses a single scoring file. See below. |
| `parseScore` | `parseScore(id, text)` | Parses raw scoring-file text into a score object. |
| `fetchTraits` | `fetchTraits()` | Loads all trait records, cached in `localforage`. |
| `fetchDataAndRenderPlots` | `fetchDataAndRenderPlots()` | Demo helper that loads dashboard data and renders its plots. |
| `estimateLocalForageSizeKB` | `estimateLocalForageSizeKB()` | Returns the total size of cached `localforage` entries in KB. |
| `checkStorageKB` | `checkStorageKB()` | Returns `{ usage, quota, usageKB, quotaKB }` from the Storage API. |
| `getTextSizeKB` | `getTextSizeKB(text)` | Returns the size of a string or serializable value in KB. |

> `loadScoreStats()` is **internal** to `src/js/landingPage.js` and is not part of the public API.

### getPgsTxt

`getPgsTxt(input, optionalArg, cache = true)`

- `input` accepts:
  - a PGS id string, e.g. `"PGS000050"`
  - a local or remote path/URL string ending in `.txt` or `.txt.gz`
  - a `File`, `FileList`, or File-like object (anything exposing `.text()` / `.arrayBuffer()`)
- `optionalArg` is unused and reserved for backward compatibility — pass `undefined`.
- `cache` defaults to `true`. Set it to `false` to skip both cache reads and cache writes for that call.
- Gzip-compressed input is inflated transparently, so `.txt` and `.txt.gz` both work.
- Cached entries use the `PGS_Catalog:id-` key prefix, with a 300 MB cache cap and oldest-first eviction.

```javascript
await sdk.getPgsTxt("PGS000050");                       // default: uses cache
await sdk.getPgsTxt("PGS000050", undefined, false);     // bypass cache for this call
await sdk.getPgsTxt("./scores/PGS000050_hmPOS.txt.gz"); // local or remote file
await sdk.getPgsTxt(fileInput.files[0]);                // user-selected File
```

---

## Cloud SDK (Node.js)

A separate, Node-safe bundle (`dist/cloud_sdk.mjs`) for Cloud Run and server deployment.

### Features

- Exposes the core PGS loaders for Node/Cloud environments
- No browser UI, DOM, or `localforage` dependencies in the cloud entry surface
- Lean bundle size optimized for containerized environments
- Ready for Google Cloud Run, AWS Lambda, or any Node.js host

### Installation

```bash
npm install pgs_catalog_sdk
```

### Cloud SDK API

Exports from `cloudNodeEntry.js` / `dist/cloud_sdk.mjs`:

| Export | Signature | Description |
| --- | --- | --- |
| `fetchAllScores` | `fetchAllScores({ pageSize = 200 } = {})` | Loads every score record (paginated, no caching). |
| `fetchSomeScores` | `fetchSomeScores(ids, ...args)` | Loads specific scores by id. |
| `fetchTraits` | `fetchTraits({ pageSize = 200 } = {})` | Loads every trait record (paginated). |
| `getScoresPerTrait` | `getScoresPerTrait({ maxTraits = Infinity, onStatus } = {})` | Aggregates score counts per reported trait. |
| `getScoresPerCategory` | `getScoresPerCategory({ maxCategories = Infinity } = {})` | Aggregates score counts per trait category. |
| `getPgsTxt` | `getPgsTxt(input, optionalArg, cache = false)` | Downloads and parses a scoring file by PGS id. No caching in Node. |

### Cloud SDK usage

```javascript
import {
  fetchAllScores,
  fetchSomeScores,
  fetchTraits,
  getScoresPerTrait,
  getScoresPerCategory,
  getPgsTxt,
} from "pgs_catalog_sdk/cloud_sdk.mjs";

const scores = await fetchSomeScores(["PGS000001", "PGS000050"]);
console.log(scores.length);

const traits = await fetchTraits();
console.log(traits?.length ?? 0);

const score = await getPgsTxt("PGS000050");
console.log(score.meta);
```

Validate the built bundle's export surface:

```bash
node test-cloud-sdk.mjs
```

### Reliability: retry and throttling

The cloud SDK applies a retry + backoff strategy to all PGS Catalog API requests
to absorb transient `429` / `5xx` errors and avoid hammering the upstream service:

- **Retries:** up to 5 attempts per request
- **Retryable statuses:** `429`, `500`, `502`, `503`, `504`
- **Backoff:** `1500 ms × attempt` (1.5s → 3s → 4.5s → 6s → 7.5s)
- **Throttle:** 250 ms `sleep` between successful paginated requests and between
  per-ID lookups in `fetchSomeScores`
- **Headers:** every request sends `Accept: application/json` and a
  `User-Agent: Mozilla/5.0` header

This applies to `fetchAllScores`, `fetchSomeScores`, and `fetchTraits`, and to any
function that builds on them, such as `getScoresPerTrait` and `getScoresPerCategory`.

### Build details

- **Source:** `src/js/cloud/pgs_node.js`
- **Entry:** `cloudNodeEntry.js` (exports the cloud-safe SDK surface)
- **Build:** `npm run build` generates both `dist/sdk.mjs` (browser) and `dist/cloud_sdk.mjs` (Node)
- **Critical fix:** the Rollup `intro` shim `var self = globalThis;` prevents a jszip runtime crash caused by its unguarded `self` reference
