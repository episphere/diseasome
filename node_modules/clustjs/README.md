<div align="center">

# clustJs

**High-dimensional data visualization for the browser** — PCA, t-SNE, UMAP, hierarchical
clustering, and heatmaps, powered by [D3.js](https://d3js.org/).

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Module](https://img.shields.io/badge/module-ES%20Modules-success.svg)
![Built with D3.js](https://img.shields.io/badge/built%20with-D3.js-f68e56.svg)
![Runtime](https://img.shields.io/badge/runtime-browser-brightgreen.svg)

[**Live demo**](https://lorenasandoval88.github.io/clustjs) &middot; [**Documentation (Wiki)**](https://github.com/lorenasandoval88/clustjs/wiki) &middot; [**Issues**](https://github.com/lorenasandoval88/clustjs/issues)

<img width="552" height="398" alt="image" src="https://github.com/user-attachments/assets/81c77ae7-27fb-400a-afaa-521cb89dca21" />


</div>

---

## Features

- **Six visualizations** — PCA, distance, hierarchical clustering with heatmaps, t-SNE, UMAP, scatter, and
  pairs plots.
- **Interactive by default** — D3-powered rendering with tooltips, zoom, and click-to-select.
- **Zero build step** — import the ES module straight from a CDN, or install from npm.
- **R-compatible clustering** — `hclust_plot` mirrors R's [`scale()`](https://stat.ethz.ch/R-manual/R-devel/library/base/html/scale.html) &rarr; [`dist()`](https://stat.ethz.ch/R-manual/R-devel/library/stats/html/dist.html) &rarr;
  [`hclust()`](https://stat.ethz.ch/R-manual/R-devel/library/stats/html/hclust.html), including faithful `NA` (missing-value) handling.
- **Bring your own data** — pass an array of objects or a 2D numeric array; two sample datasets are
  included.

## Installation

Use clustJs directly from the CDN (ES modules in the browser) or install it from npm.

### CDN (ES module)

Run in the browser console or inside an HTML `<script type="module">` block:

```javascript
// One‑liner
await (await import("https://lorenasandoval88.github.io/clustjs/dist/sdk.mjs"))
    .pca_plot({ width: 600, height: 400 })

// Step‑by‑step
const sdk = await import("https://lorenasandoval88.github.io/clustjs/dist/sdk.mjs")
await sdk.pca_plot({ data: sdk.irisData, divId: "myPCA", width: 600, height: 400 })
// UI helper
await sdk.pca_UI({ divId: "myPCA", width: 600, height: 300, loadIrisOnStart: true })
```

### npm (ESM)

Install and import in your application:

```bash
npm install clustjs
```

```javascript
import { pca_plot, pca_UI, irisData } from "clustjs";

await pca_plot({ data: irisData, divId: "myPCA", width: 600, height: 400 });
await pca_UI({ divId: "myPCA", width: 600, height: 300, loadIrisOnStart: true });
```

### Notes

- **Browser/DOM required** — the plot functions render to the DOM; use them in browser apps
  (Vite, webpack, Next.js client components) or the browser console.
- **ESM only** — the SDK ships as ES modules; ensure your bundler/runtime supports ESM imports.

## Visualizations

Every visualization is available as a `*_plot()` function. Most also ship a `*_UI()` helper (which
adds interactive controls) and a `*Dt` state object.

| Plot | UI helper | State | Description |
| --- | --- | --- | --- |
| `pca_plot` | `pca_UI` | `pcaDt` | Principal component analysis scatter plot |
| `hclust_plot` | &mdash; | `hclustDt` | Clustered heatmap with row & column dendrograms |
| `heatmap_plot` | &mdash; | &mdash; | Standalone heatmap |
| `tsne_plot` | `tsne_UI` | `tsneDt` | t-SNE dimensionality reduction |
| `umap_plot` | `umap_UI` | `umapDt` | UMAP dimensionality reduction |
| `scatter_plot` | `scatter_UI` | `scatterDt` | 2D scatter plot |
| `pairs_plot` | `pairs_UI` | `pairsDt` | Scatterplot matrix (pairs plot) |

All plot functions take a single `options` object. Common options include `data`, `divId`,
`width`, `height`, `colors`, and `margin` (merge-style — override only the sides you need,
e.g. `margin: { right: 100 }`). See the
[Plot Functions & Parameters](https://github.com/lorenasandoval88/clustjs/wiki/Plot-Functions)
wiki page for the full per-function reference.

## SDK exports

Public exports from [`src/sdk.mjs`](src/sdk.mjs):

- **Datasets** — `irisData`, `spiralData`
- **Plots / UI / state** — `pca_plot`, `pca_UI`, `pcaDt`, `hclust_plot`, `hclustDt`, `heatmap_plot`,
  `tsne_plot`, `tsne_UI`, `tsneDt`, `umap_plot`, `umap_UI`, `umapDt`, `scatter_plot`, `scatter_UI`,
  `scatterDt`, `pairs_plot`, `pairs_UI`, `pairsDt`
- **Utilities** — all exports from [`otherFunctions.js`](src/otherFunctions.js)
- **Library** — `d3` (re-exported for convenience)
- **Metadata** — `version`

## Project structure

| Path | Purpose |
| --- | --- |
| `index.html` | Browser demo shell and layout |
| `main.js` | Demo app wiring (imports the SDK from `./dist/sdk.mjs`, runs plots) |
| `src/` | Reusable source modules for plots and helpers |
| `src/sdk.mjs` | Public SDK entrypoint (aggregates dataset, plot, and utility exports) |
| `src/data/` | Built-in datasets (`irisData`, `spiralData`) |
| `css/styles.css` | Demo styling |
| `dist/` | Rollup output (`dist/sdk.mjs` + sourcemap) |

## Development

```bash
# Build the SDK bundle: src/sdk.mjs -> dist/sdk.mjs
npm run build
```

To run the demo, open `index.html` with a local static server (for example VS Code Live Server).
The demo script `main.js` loads the built SDK from `./dist/sdk.mjs`.


## Hierarchical clustering & missing values

`hclust_plot` reproduces R's [`scale()`](https://stat.ethz.ch/R-manual/R-devel/library/base/html/scale.html) → [`dist()`](https://stat.ethz.ch/R-manual/R-devel/library/stats/html/dist.html) → [`hclust()`](https://stat.ethz.ch/R-manual/R-devel/library/stats/html/hclust.html) pipeline, including the way R
handles missing values (`NA`). A missing entry is **never** replaced by a numeric value; it is
simply excluded from every calculation that involves it. The pipeline runs in three stages:

1. **Scaling (optional, on by default).** Each column is standardized using only its observed
   values — mean and sample standard deviation (`n − 1` denominator), matching R's `scale()`.
   Missing values stay missing, and a constant (zero-variance) column becomes missing so it never
   produces an invalid z-score. Set `scaleData: false` to cluster raw values like base
   `hclust(dist(x))`.

2. **Pairwise distance.** For every pair of rows, only the variables observed in *both* rows
   contribute. The accumulated difference is rescaled by `P / q` (total variables / jointly
   observed variables) to compensate for the excluded dimensions:

   ```
   d(i, j) = sqrt( (P / q) · Σ (z_ik − z_jk)²  over variables observed in both i and j )
   ```

   When every variable is observed, `P / q = 1` and this reduces to ordinary Euclidean distance.
   Shared missing values contribute nothing and never make two rows look similar. If a pair has no
   jointly observed variables (or fewer than `minOverlapRatio`), the distance is undefined and
   `hclust_plot` throws instead of inventing a value — matching R's `NA`.

3. **Clustering.** The precomputed row and column distance matrices are handed to `ml-hclust`
   (`agnes`) and drawn as dendrograms; the heatmap still shows the original `NA` cells as
   "missing".

### Missing-value options

| Option | Default | Description |
| --- | --- | --- |
| `scaleData` | `true` | Standardize columns (R's `scale()`) before clustering. |
| `missingValue` | `null` | Value treated as missing in the input (e.g. set `-1` if your data encodes missing as `-1`). |
| `clusteringDistanceRows` / `clusteringDistanceCols` | `"euclidean"` | Distance metric. Supported: `euclidean`, `manhattan` (`cityblock`). Unsupported metrics throw. |
| `removeMissingBy` | `"none"` | `"row"` or `"col"` drops rows/columns containing any missing value before clustering. |
| `minOverlapRatio` | `0` | Extension: require at least this fraction (`q / P`) of jointly observed variables per pair; pairs below it are rejected. `0` reproduces R behavior (only fully unobservable pairs are rejected). |

See the [wiki](https://github.com/lorenasandoval88/clustjs/wiki) for the full derivation and worked
examples.

## Contributing

Contributions, issues, and feature requests are welcome. Please open an
[issue](https://github.com/lorenasandoval88/clustjs/issues) to discuss substantial changes, and run
`npm run build` before submitting a pull request.

## License

Released under the [MIT License](https://opensource.org/licenses/MIT). &copy; Lorena Sandoval.

