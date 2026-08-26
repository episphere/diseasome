# Diseasome SDK

We present the Diseasome SDK, a JavaScript library and web application for computing polygenic risk scores from consumer genotype data (23andMe) and PGS Catalog score models. The SDK operates in both browser and Node.js environments, supporting programmatic use by developers and interactive exploration by end users.
live at: https://episphere.github.io/diseasome/



<img width="416" height="580" alt="image" src="https://github.com/user-attachments/assets/181e43f3-e9f2-4146-acbe-2e8f43def16e" />


---

## Overview

This project combines a programmable SDK (toolkit functionalities) with an interactive web app (UI exploration tabs).

Toolkit functionalities
- Automated retrieval and parsing of 23andMe and PGS Catalog data
- Calculation of polygenic risk scores (PRS) for local or public genomes
- Browser-based and Node.js/Cloud Run compatible workflows
- Simple developer APIs for PRS research and visualization

## UI exploration tabs
- PGP Tab: Explore public genome profiles and participant metadata, and load available genotype records for analysis.
- PGS Catalog Tab: Browse polygenic score models by trait/category, inspect model metadata (including the reported `weight_type`), and select scores to analyze.
- PRS Tab: Run score matching between genotype inputs and selected PGS models, then review comparative PRS outputs alongside their match and weight-coverage statistics. Inspect the raw genome and scoring files, plot each model's effect weights across the genome, and export the models, their full metadata, and the results as JSON or CSV.
- Cluster Tab: Interactively visualize and group samples/scores to identify similarity patterns and trait-level structure.
- AI Interpretation â€“ Score Insight: Convert PRS outputs into plain-language summaries with context and interpretation caveats.
- AI Interpretation â€“ Research Assistant: Generate follow-up insights, comparison prompts, and research-oriented notes from selected results.
---

## 23andMe chip overlap index

The PGS Catalog tab can filter and rank risk models by how well each model's variants are covered by the 23andMe **v4** and **v5** genotyping arrays.

> This index is computed once, offline, from array marker sets rather than from individual genotype data, and is distributed with the application as a static table; no user genotype data is involved at any point in its construction.

The index ships as static JSON (`data/overlap_0_100_v4.json`, `data/overlap_0_100_v5.json`).

The same holds for the **curated 23andMe (v4/v5) marker data** the index is built from:

> The curated 23andMe marker sets are derived from the arrays' published marker definitions rather than from individual genotype data, and are distributed with the application as static reference tables; no user genotype data is involved at any point in their construction.

---

## Scoring model

Variants in a harmonized PGS scoring file are matched to genotype calls through a
hash index keyed on harmonized chromosome and position, giving `O(n + m)` matching
rather than a nested scan. Genotypes are converted to effect-allele dosages
`G ∈ {0, 1, 2}`, and each sample's score is the weighted sum over matched variants:

$$\text{PRS}_i = \sum_{j} G_{ij} \cdot w_j$$

where `w` is the `effect_weight` **as reported by the PGS Catalog**.

> The weights are used exactly as published and are never interpreted. The catalog's `weight_type` (`beta`, `OR`, `HR`, or `NR` when the submitter did not report one) is carried through as metadata and displayed alongside every score, in the models table, the results table, and every export — it is never inferred from the values, and the score is never transformed on the basis of a guess about them.

Consequences, all of them intentional:

- Scores are on the **original model's scale** — not exponentiated, not standardized, not normalized against a reference panel. Comparisons are valid **across samples for a given model**, not across models.
- Variants with no usable genotype are **omitted**, never imputed or mean-substituted.
- Because of that omission, every sample × model pair reports its own denominators: total variants, matched, unmatched, missing genotypes, matching percentage, and the share of the model's total absolute weight that was actually scored,

$$\text{weight coverage} = \frac{\sum_{j \in \text{matched}} \lvert w_j \rvert}{\sum_{j \in \text{total}} \lvert w_j \rvert}$$

  computed on absolute values so positive and negative weights cannot cancel and inflate apparent coverage.

PRS results are cached in IndexedDB under `PRS: <userId>_<pgsId>` and are **not**
version-stamped — use the **Clear PRS Cache** button after any change to the
scoring math.

---

## Quick Start


### Browser SDK

```js
// ESM direct import (browser)
const sdk = await import("https://episphere.github.io/polygenic_risk_scores/dist/sdk.mjs");
// or via npm: import { fetchAllScores, fetchTraits, getTxts } from "polygenic_risk_scores";
```

### Node/Cloud Run SDK

```js
// ESM direct import (Node/Cloud Run)
const sdk = await import("https://episphere.github.io/polygenic_risk_scores/dist/cloud_sdk.mjs");
// or via npm: import { fetchAllScores, ... } from "polygenic_risk_scores/cloud_sdk.mjs";
```

---

## Architecture

```
polygenic_risk_scores/
diseasome/
├── src/
│   ├── app/           # Browser app entry and UI wiring (one module per tab)
│   ├── sdk/           # Reusable SDK modules (PGP, PGS, PRS, clustering)
│   ├── cloud/         # Cloud Run service (Dockerfile + Express entry)
│   └── css/           # App styles
├── data/              # Local 23andMe-compatible genome and PGS files
├── colab_notebooks/   # Supporting analysis notebooks
├── dist/              # Rollup build outputs
│   ├── sdk.mjs        # Browser SDK
│   ├── cloud_sdk.mjs  # Node-safe SDK
│   ├── app.mjs        # Bundled web app
│   └── chunks/        # Lazy-loaded app chunks
├── sdk.js             # Public SDK entrypoint
├── dependencies.js    # Shared third-party imports
├── index.html         # Web interface
├── rollup.config.js   # Build configuration
├── package.json       # Project dependencies and scripts
└── README.md          # Documentation
```

| Directory/File       | Purpose                                                  |
| -------------------- | -------------------------------------------------------- |
| **src/app/**         | Browser app entry and UI logic                           |
| **src/sdk/**         | SDK modules for PGP, PGS, PRS                            |
| **src/css/**         | Stylesheets                                              |
| **data/**            | Local genome files                                       |
| **dist/**            | Compiled SDK outputs (browser & node)                    |
| **sdk.js**           | Public API entry point                                   |
| **index.html**       | Web interface                                            |
| **rollup.config.js** | Bundler configuration                                    |
| **package.json**     | Project dependencies and scripts                         |
| **README.md**        | Documentation                                            |

---

## Core Functions

### Public API Functions

| Function | Description |
|---|---|
| `fetchAllScores()` | Fetch all PGS Catalog scores |
| `fetchSomeScores(ids)` | Fetch specific PGS scores by ID |
| `fetchTraits()` | Fetch trait metadata |
| `getScoresPerTrait()` | Get scores grouped by trait |
| `getScoresPerCategory()` | Get scores grouped by category |
| `getTxts(ids)` | Fetch and parse PGS text files |
| `estimateLocalForageSizeKB()` | Estimate LocalForage storage size (Browser only) |
| `checkStorageKB()` | Check storage usage and quota (Browser only) |
| `getTextSizeKB(text)` | Calculate text size in KB (Browser only) |
| `fetchAvailableDataTypes()` | List available data types |
| `allUsersMetaDataByType_fast()` | Get user metadata by type |
| `fetchProfile(id)` | Fetch a user profile |
| `get23Txt(path, id, cache)` | Load and parse a 23andMe file |
| `Match2(pgsTxt, my23Txt)` | Calculate PRS — reference implementation, `O(n × m)` |
| `MatchOptimized(pgsTxt, my23Txt)` | Calculate PRS — hash-indexed, `O(n + m)`; used by the app |

Both matchers return the score together with its provenance and coverage:
`{ PRS, weightType, totalVariants, matchedVariants, unmatchedVariants,
missingGenotypes, matchPercent, weightCoverage, alleles, calcRiskScore, ... }`.
`PRS` is `null` when nothing matched.

**SDK Availability:**
- **Browser SDK (`sdk.mjs`)**: All functions above
- **Node SDK (`cloud_sdk.mjs`)**: All functions except browser-only storage utilities (`estimateLocalForageSizeKB`, `checkStorageKB`, `getTextSizeKB`)

---

## Usage Example

```js
import { fetchAllScores, fetchTraits, getTxts } from "polygenic_risk_scores";

const scores = await fetchAllScores();
const traits = await fetchTraits();
const txts = await getTxts(["PGS000001"]);
```

Scoring a genome, and reading the score with its denominators:

```js
const sdk = await import("https://episphere.github.io/diseasome/dist/sdk.mjs");

const pgs    = await sdk.pgs.getPgsTxt("PGS000001");
const genome = await sdk.pgp.get23Txt("data/genome_LW_v5_Full_20170924182428.txt", "lw");
const r      = sdk.prs.MatchOptimized(pgs, genome);

console.log(r.PRS, r.weightType);                     // 0.7485 'NR'
console.log(`${r.matchedVariants}/${r.totalVariants}`); // 72/77
console.log((r.weightCoverage * 100).toFixed(1) + "%"); // 95.6% of Σ|w|
```

---

## Build

Run `npm run build` to generate:
- `dist/sdk.mjs` (browser SDK)
- `dist/cloud_sdk.mjs` (Node-safe SDK)

---

## Run

- Open `index.html` with a local static server (e.g. VS Code Live Server)
- For API calls, use the browser or Node SDK as shown above

---

## License

MIT

