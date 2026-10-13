# Diseasome SDK

Diseasome is a browser app and JavaScript SDK for exploring 23andMe genotype data and PGS Catalog models, and calculating polygenic risk scores.

**Live app:** https://episphere.github.io/diseasome/



<img width="416" height="580" alt="image" src="https://github.com/user-attachments/assets/181e43f3-e9f2-4146-acbe-2e8f43def16e" />


---

## Overview

Use the app to load 23andMe files, select PGS models, calculate and inspect scores, and explore score patterns. The AI Interpret tab offers cloud and local model options.

The SDK supports browser and Node.js/Cloud Run workflows.
---

## 23andMe chip overlap index

The app includes [`data/model_chip_overlap.csv`](data/model_chip_overlap.csv), a summary of PGS model coverage on the 23andMe **v2–v5** arrays. It compares GRCh37 variant positions; it does not measure imputation quality or PRS accuracy.

The chip manifests were built from public PGP files using positions found in at least 95% of files. The v2 manifest is based on only three files. Only overlap summaries are shipped with the app; no participant genotypes are included.

Related Observable notebooks:

- [PGP 23andMe files](https://observablehq.com/@lorenasandoval88/23andme-files-from-the-pgp)
- [Chip manifests](https://observablehq.com/@lorenasandoval88/23andme-manifest)
- [Chip overlap and fingerprints](https://observablehq.com/@lorenasandoval88/23andme-v3v4v5-overlap)
- [Chip classification](https://observablehq.com/@lorenasandoval88/23andme-chip-classification)
- [PGS–chip overlap](https://observablehq.com/@lorenasandoval88/pgs-models-overlap-with-23andme-chips)

---

## Scoring model

The app matches PGS variants to genotype calls and sums effect-allele dosages times
the published effect weights:

$$\text{PRS}_i = \sum_{j} G_{ij} \cdot w_j$$

Weights and `weight_type` are used as reported by the PGS Catalog. Unmatched variants are not imputed. Results include match and weight-coverage statistics; scores should be compared only within the same model.

PRS results are cached in the browser. Use **Clear PRS Cache** after changing the scoring code.

---

## Quick Start


### Browser

```js
const sdk = await import("https://episphere.github.io/diseasome/dist/sdk.mjs");
const model = await sdk.pgs.getPgsTxt("PGS000001");
```

### Node.js / Cloud Run

```js
const sdk = await import("./dist/cloud_sdk.mjs");
const model = await sdk.getPgsTxt("PGS000001");
```

---

## SDK API

The browser SDK groups functions under `sdk.pgp`, `sdk.pgs`, and `sdk.prs`. The Node.js SDK exports these functions directly and does not include browser-only storage helpers.

---

## Build

Run `npm run build` to generate:
- `dist/sdk.mjs` (browser SDK)
- `dist/cloud_sdk.mjs` (Node-safe SDK)
- `dist/app.mjs` (web app)

---

## Run the app

Serve the repository with a local static server and open `index.html`.

---

## License

MIT
