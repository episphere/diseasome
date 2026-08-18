import { hclust_plot } from "../sdk/clustSdk.js";
import d3ToPng from "d3-svg-to-png";

// clust.js adds the PRS Clustering tab for your PRS app.
//
// PRS-level clustering
// Converts PRS results into a user × PGS matrix.
// Rows = users.
// Columns = PGS entries.
// Values = PRS scores.
// Clusters users and/or PGS entries.
//
// It also includes:
// a caching system to avoid recomputing the pivoted matrix every time the tab rerenders
// buttons for row/column clustering
// linkage choices: complete, single, average, ward
// distance choices: euclidean, manhattan, cosine
// calls to hclust_plot() to render heatmap + dendrogram plots

const clusterContainerId = "clusterDiv";

// Caching mechanism to avoid redundant computations
// This is not persistent - it only lasts for the current browser session
let clusterCache = {
  prsResultsHash: null,      // Hash of prsResults to detect changes
  pivoted: null,
  pgsIds: null,
  userIds: null,
};

/**
 * Generate a simple hash of prsResults to detect changes
 */
function hashPrsResults(results) {
  if (!Array.isArray(results) || results.length === 0) return null;
  // Use length + sum of PRS values as a quick hash
  let hash = results.length;
  for (const r of results) {
    if (r.PRS != null && Number.isFinite(r.PRS)) {
      hash += r.PRS;
    }
  }
  return `${hash}-${results.length}`;
}

/**
 * Check if cache is valid for current data
 */
function isCacheValid(currentHash) {
  return clusterCache.prsResultsHash === currentHash &&
         clusterCache.pivoted !== null;
}

/**
 * Invalidate the cluster cache (call when data changes)
 */
function invalidateClusterCache() {
  clusterCache = {
    prsResultsHash: null,
    pivoted: null,
    pgsIds: null,
    userIds: null,
  };
  // console.log("Cluster cache invalidated");
}

// Expose cache invalidation globally so it can be called when PRS is recalculated
window.invalidateClusterCache = invalidateClusterCache;

// Expose cluster cache via getter so AI Interpret tab can summarize clustering results.
// Uses a getter because invalidateClusterCache() reassigns the clusterCache variable.
window.getClusterCache = () => clusterCache;


/**
 * Find the user/participant object behind a PRS result id, looking in the users
 * loaded for the PRS calculation and in the Genomic Data tab selection.
 * @param {string} userId
 * @returns {Object|null}
 */
function findUserById(userId) {
  const matches = (id) => id != null && id === userId;
  const loaded = (window.loadedUsers ?? []).find(d => matches(d?.user?.id) || matches(d?.user?.participant_id));
  if (loaded?.user) return loaded.user;
  const selected = (window.getSelectedUsers?.() ?? []).find(u => matches(u?.id) || matches(u?.participant_id));
  return selected ?? null;
}

/**
 * Build the 23andMe array-version prefix for a user, e.g. "v5" or "v4_v5" when the
 * participant has files from more than one chip version. Versions come from the
 * curated metadata (user.version / genotypes[].version) or, failing that, are
 * inferred from the filename/URL (…_v5_Full_….txt).
 * @param {string} userId
 * @returns {string} "v5", "v4_v5", or "" when no version is known
 */
function getUserVersionPrefix(userId) {
  const user = findUserById(userId);
  if (!user) return '';

  const genos = Array.isArray(user.genotypes) ? user.genotypes : [];
  const versions = new Set();

  const addVersion = (value) => {
    const m = String(value ?? '').match(/^v?(\d+)$/i);
    if (m) versions.add(Number(m[1]));
  };
  const addFromFilename = (value) => {
    const m = String(value ?? '').match(/[_-]v(\d+)[_.-]/i);
    if (m) versions.add(Number(m[1]));
  };

  addVersion(user.version);
  addFromFilename(user.fileName ?? user.filename);
  addFromFilename(user.downloadUrl ?? user.download_url ?? user.url ?? user.finalUrl);
  for (const g of genos) {
    addVersion(g?.version);
    addFromFilename(g?.filename ?? g?.file ?? g?.download_url);
  }

  if (versions.size === 0) return '';
  return Array.from(versions).sort((a, b) => a - b).map(v => `v${v}`).join('_');
}

/**
 * Pivot window.prsResults (flat array of {userId, pgsId, PRS}) into
 * one object per user where each key is a pgsId and the value is PRS.
 * Returns null if no usable results exist.
 */
function pivotPrsResults(rawResults) {
  if (!Array.isArray(rawResults) || rawResults.length === 0) return null;

  const byUser = new Map();
  for (const r of rawResults) {
    if (!r.userId || r.PRS == null || !Number.isFinite(r.PRS)) continue;
    if (!byUser.has(r.userId)) {
      const name = r.userName ?? r.userId;
      const version = getUserVersionPrefix(r.userId);
      byUser.set(r.userId, { label: version ? `${version} ${name}` : name });
    }
    byUser.get(r.userId)[r.pgsId] = r.PRS;
  }

  const rows = Array.from(byUser.values());
  return rows.length >= 2 ? rows : null;
}

/**
 * Standardize (z-score) each PGS column across users so that no single model
 * dominates the clustering distance purely because of its scale.
 * For each PGS: z = (value - mean) / sd, computed across all users that have a
 * finite value. Columns with fewer than 2 finite values (or zero variance) are
 * left effectively unscaled (sd defaults to 1). Missing values stay missing.
 * @param {Array<Object>} pivoted - Row objects: { label, <pgsId>: value, ... }
 * @param {string[]} pgsIds - PGS column ids to standardize
 * @returns {Array<Object>} New row objects with z-scored values.
 */
function standardizePivot(pivoted, pgsIds) {
  if (!Array.isArray(pivoted) || pivoted.length === 0) return pivoted;
  const round = v => (Number.isFinite(v) ? Number(v.toFixed(4)) : null);

  // Per-PGS mean/sd across users.
  const stats = {};
  for (const pgsId of pgsIds) {
    const vals = pivoted.map(row => row[pgsId]).filter(v => Number.isFinite(v));
    if (vals.length < 2) continue;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) || 1;
    stats[pgsId] = { mean, sd };
  }

  return pivoted.map(row => {
    const out = { label: row.label };
    for (const pgsId of pgsIds) {
      const v = row[pgsId];
      if (!Number.isFinite(v)) continue;
      const s = stats[pgsId];
      out[pgsId] = s ? round((v - s.mean) / s.sd) : round(v);
    }
    return out;
  });
}

/**
 * Build a { pgsId -> reported trait } lookup from the raw PRS results.
 * @param {Array<Object>} rawResults - window.prsResults entries
 * @returns {Object<string,string>} Map of PGS id to its trait name.
 */
function getPgsTraitMap(rawResults) {
  const map = {};
  if (!Array.isArray(rawResults)) return map;
  for (const r of rawResults) {
    const pgsId = r?.pgsId;
    if (!pgsId || map[pgsId]) continue;
    const trait =
      r.pgs?.meta?.trait_reported ??
      r.pgs?.meta?.trait_mapped ??
      r.organized?.summary?.trait ??
      '';
    if (trait) map[pgsId] = String(trait);
  }
  return map;
}

/**
 * Return a copy of the pivoted matrix with each PGS column key relabeled as
 * "<pgsId> — <trait>" for display. The `label` (user name) key is preserved.
 * Used only for the plot so cached data and CSV/JSON downloads keep raw PGS ids.
 * Note: ClustJS truncates axis labels to 12 chars, but hover tooltips show the
 * full relabeled text.
 * @param {Array<Object>} matrix - Row objects: { label, <pgsId>: value, ... }
 * @param {Object<string,string>} traitMap - { pgsId -> trait }
 * @returns {Array<Object>} New rows with trait-augmented column keys.
 */
function relabelPgsColumns(matrix, traitMap) {
  if (!Array.isArray(matrix) || !traitMap) return matrix;
  return matrix.map(row => {
    const out = {};
    for (const key of Object.keys(row)) {
      if (key === 'label') { out.label = row.label; continue; }
      const trait = traitMap[key];
      out[trait ? `${key} — ${trait}` : key] = row[key];
    }
    return out;
  });
}

/**
 * Get unique PGS IDs from prsResults
 */
function getUniquePgsIds(rawResults) {
  if (!Array.isArray(rawResults)) return [];
  const ids = new Set();
  for (const r of rawResults) {
    if (r.pgsId) ids.add(r.pgsId);
  }
  return Array.from(ids);
}

/**
 * Get unique user IDs from prsResults
 */
function getUniqueUserIds(rawResults) {
  if (!Array.isArray(rawResults)) return [];
  const users = new Map();
  for (const r of rawResults) {
    if (r.userId && !users.has(r.userId)) {
      users.set(r.userId, r.userName ?? r.userId);
    }
  }
  return Array.from(users.entries()).map(([id, name]) => ({ id, name }));
}

/**
 * Serialise a hclust_plot matrix (array of row-objects with a `label` key) to CSV
 * and trigger a browser download.
 * @param {Array<Object>} matrix - e.g. [{label:'user1', PGS000001: 0.2, ...}, ...]
 * @param {string} filename     - suggested download filename
 */
function downloadMatrixAsCsv(matrix, filename = 'matrix.csv') {
  if (!Array.isArray(matrix) || matrix.length === 0) return;
  const csv = matrixToCsvString(matrix);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/**
 * Serialise a hclust_plot matrix (array of row-objects with a `label` key) to a CSV string.
 * @param {Array<Object>} matrix - e.g. [{label:'user1', PGS000001: 0.2, ...}, ...]
 * @returns {string} CSV text (header row + data rows)
 */
function matrixToCsvString(matrix) {
  if (!Array.isArray(matrix) || matrix.length === 0) return '';
  const cols = Object.keys(matrix[0]).filter(k => k !== 'label');
  const header = ['label', ...cols].join(',');
  const rows = matrix.map(row =>
    [row.label, ...cols.map(c => row[c] ?? '')].join(',')
  );
  return [header, ...rows].join('\n');
}

// --- WebR (R compiled to WebAssembly) in-browser runner ---
const WEBR_BASE_URL = 'https://webr.r-wasm.org/latest/';
const WEBR_MATRIX_PATH = '/home/web_user/prs_matrix.csv';
let _webRPromise = null;
// Persist the WebR runner UI across renderCluster() rebuilds so clicking a
// clustering parameter for the first plot doesn't wipe the R output/code.
let _webRState = { code: null, plotsHTML: '', consoleHTML: '', consoleVisible: false, status: '' };

/** Default R snippet shown in the runner; reads the PRS matrix preloaded into WebR's FS. */
const WEBR_DEFAULT_CODE = `library(pheatmap)

# The current PRS matrix is preloaded into WebR at the path below.
prs <- read.csv("${WEBR_MATRIX_PATH}", check.names = FALSE)
rownames(prs) <- prs$label
prs_matrix <- as.matrix(prs[, -1])

# Z-score each PGS across users
prs_scaled <- scale(prs_matrix)

# Distance + hierarchical clustering of users
user_dist <- dist(prs_scaled, method = "euclidean")
user_hclust <- hclust(user_dist, method = "complete")

# Heatmap with row + column clustering
pheatmap(prs_scaled,
         cluster_rows = user_hclust,
         cluster_cols = TRUE,
         clustering_distance_cols = "euclidean",
         clustering_method = "complete",
         treeheight_row = 120,
         treeheight_col = 120,
         fontsize = 12,
         main = "PRS Hierarchical Clustering",
         border_color = NA)`;

/**
 * Lazily load and initialise WebR (base R + pheatmap). Cached across runs so the
 * multi-MB runtime and package install only happen once per session.
 * @param {HTMLElement} [statusEl] - optional element for progress messages
 * @returns {Promise<Object>} the initialised WebR instance
 */
function getWebR(statusEl) {
  if (_webRPromise) return _webRPromise;
  _webRPromise = (async () => {
    if (statusEl) statusEl.textContent = 'Loading WebR runtime (first run downloads ~R core)…';
    const { WebR, ChannelType } = await import('https://webr.r-wasm.org/latest/webr.mjs');
    // SharedArrayBuffer needs cross-origin isolation (COOP/COEP), which GitHub
    // Pages doesn't set — fall back to the PostMessage channel when not isolated.
    const channelType = globalThis.crossOriginIsolated
      ? (ChannelType?.Automatic ?? 0)
      : (ChannelType?.PostMessage ?? 3);
    const webR = new WebR({ baseUrl: WEBR_BASE_URL, channelType });
    await webR.init();
    if (statusEl) statusEl.textContent = 'Installing pheatmap…';
    await webR.installPackages(['pheatmap']);
    return webR;
  })();
  // If init fails, clear the cache so a later click can retry.
  _webRPromise.catch(() => { _webRPromise = null; });
  return _webRPromise;
}

/**
 * Run the R code from the tab-5 editor in WebR: write the current PRS matrix to
 * the virtual filesystem, capture text output, and render any plots inline.
 */
async function runRCodeInWebR() {
  const statusEl = document.getElementById('webRStatus');
  const consoleEl = document.getElementById('webRConsole');
  const plotsEl = document.getElementById('webRPlots');
  const btn = document.getElementById('runRWebRBtn');
  const code = document.getElementById('webRCode')?.value ?? '';

  const data = clusterCache.pivoted ?? pivotPrsResults(window.prsResults);
  if (!data) { alert('No PRS matrix available. Run a PRS calculation first.'); return; }

  if (btn) btn.disabled = true;
  if (plotsEl) plotsEl.innerHTML = '';
  if (consoleEl) { consoleEl.style.display = 'none'; consoleEl.textContent = ''; }

  let shelter;
  try {
    const webR = await getWebR(statusEl);
    if (statusEl) statusEl.textContent = 'Writing PRS matrix…';
    const csv = matrixToCsvString(data);
    await webR.FS.writeFile(WEBR_MATRIX_PATH, new TextEncoder().encode(csv));

    if (statusEl) statusEl.textContent = 'Running R…';
    shelter = await new webR.Shelter();
    const result = await shelter.captureR(code, {
      withAutoprint: true,
      captureStreams: true,
      captureConditions: false,
      captureGraphics: { width: 720, height: 720, pointsize: 18 },
    });

    const text = (result.output ?? [])
      .filter(o => o.type === 'stdout' || o.type === 'stderr')
      .map(o => o.data)
      .join('\n');
    if (consoleEl && text.trim()) {
      consoleEl.textContent = text;
      consoleEl.style.display = 'block';
    }

    const images = result.images ?? [];
    for (const img of images) {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d').drawImage(img, 0, 0);
      // Use an <img> (data URL) rather than a live canvas so the plot survives
      // renderCluster() rebuilds via innerHTML restoration.
      const image = document.createElement('img');
      image.src = canvas.toDataURL('image/png');
      image.alt = 'R plot output';
      image.className = 'img-fluid rounded border shadow-sm d-block mb-2';
      image.style.maxWidth = '640px';
      if (plotsEl) plotsEl.appendChild(image);
    }
    if (statusEl) statusEl.textContent = `Done — ${images.length} plot(s) rendered.`;
  } catch (err) {
    console.error('[WebR] run error:', err);
    if (statusEl) statusEl.textContent = 'Error running R (see below).';
    if (consoleEl) {
      consoleEl.textContent = String(err?.message ?? err);
      consoleEl.style.display = 'block';
    }
  } finally {
    if (shelter) { try { await shelter.purge(); } catch { /* ignore */ } }
    if (btn) btn.disabled = false;
    // Save the output so it can be restored after a renderCluster() rebuild.
    _webRState.plotsHTML = plotsEl ? plotsEl.innerHTML : '';
    _webRState.consoleHTML = consoleEl ? consoleEl.textContent : '';
    _webRState.consoleVisible = !!(consoleEl && consoleEl.style.display !== 'none');
    _webRState.status = statusEl ? statusEl.textContent : '';
  }
}


async function renderCluster() {
  const clusterContainer = document.getElementById(clusterContainerId);
  if (!clusterContainer) return;

  // Check cache validity
  const currentHash = hashPrsResults(window.prsResults);
  const cacheValid = isCacheValid(currentHash);

  // Show loading state immediately if we need to compute (not cached)
  const needsCompute = !cacheValid || !clusterCache.pivoted;
  if (needsCompute) {
    clusterContainer.innerHTML = `
      <div class="d-flex flex-column align-items-center justify-content-center py-5">
        <div class="spinner-border text-primary mb-3" role="status" style="width: 3rem; height: 3rem;">
          <span class="visually-hidden">Loading...</span>
        </div>
        <p class="text-muted loading-message">Loading cluster analysis...</p>
      </div>
    `;
    // Allow the loading UI to render before heavy computation
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 10)));
  }

  // Use cached or compute fresh data
  let pivoted, pgsIds, userIds;
  if (cacheValid && clusterCache.pivoted) {
    pivoted = clusterCache.pivoted;
    pgsIds = clusterCache.pgsIds;
    userIds = clusterCache.userIds;
  } else {
    pivoted = pivotPrsResults(window.prsResults);
    pgsIds = getUniquePgsIds(window.prsResults);
    userIds = getUniqueUserIds(window.prsResults);
    // Update cache
    clusterCache.prsResultsHash = currentHash;
    clusterCache.pivoted = pivoted;
    clusterCache.pgsIds = pgsIds;
    clusterCache.userIds = userIds;
  }

  // Show message if no PRS results available
  if (pivoted === null) {
    clusterContainer.innerHTML = `<div class="alert alert-info">
        <strong>No PRS results available.</strong><br>
        Please go to the <strong>Calculate PRS</strong> tab first and run a PRS calculation. <a href="#" onclick="document.querySelector('.tablinks[onclick*=PRS]').click(); return false;">Go to Calculate PRS →</a>
    </div>`;
    return;
  }

  // Get current clustering options (preserve state across re-renders)
  const clusterRows = window.clusterOptions?.clusterRows ?? true;
  const clusterCols = window.clusterOptions?.clusterCols ?? true;

  // Clustering algorithm options
  const clusterMethod = window.clusterOptions?.clusterMethod ?? 'complete';
  const clusterDistance = window.clusterOptions?.clusterDistance ?? 'euclidean';

  // Scale mode: raw PRS vs. per-PGS z-scored (normalized) values.
  const normalize = window.clusterOptions?.normalize ?? true;

  clusterContainer.innerHTML = `
    <div id="clusterSectionA">
    <div class="d-flex align-items-baseline flex-wrap gap-2 mb-1">
      <h5 class="mb-0">PRS Clustering</h5>
      <span class="badge bg-light text-dark border">${pivoted.length} users</span>
      <span class="badge bg-light text-dark border">${Object.keys(pivoted[0]).length - 1} PGS entries</span>
    </div>
    <p class="text-muted small mb-3">
      Hierarchical clustering of PRS results. Adjust the options below to explore how users and risk models group together.
    </p>

    <div class="card mb-3">
      <div class="card-body py-3">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label small text-uppercase text-muted fw-bold mb-1">Cluster by</label>
            <div class="btn-group d-flex" role="group">
              <button id="clusterRowsBtn" class="btn btn-sm ${clusterRows ? 'btn-primary' : 'btn-outline-primary'}">Rows (Users)</button>
              <button id="clusterColsBtn" class="btn btn-sm ${clusterCols ? 'btn-primary' : 'btn-outline-primary'}">Columns (PGS)</button>
              <button id="clusterBothBtn" class="btn btn-sm ${clusterRows && clusterCols ? 'btn-success' : 'btn-outline-success'}">${clusterRows && clusterCols ? 'None' : 'Both'}</button>
            </div>
          </div>
          <div class="col-md-6">
            <label class="form-label small text-uppercase text-muted fw-bold mb-1">Linkage</label>
            <div class="btn-group d-flex" role="group">
              <button id="clusterMethodComplete" class="btn btn-sm ${clusterMethod === 'complete' ? 'btn-secondary' : 'btn-outline-secondary'}">Complete</button>
              <button id="clusterMethodSingle" class="btn btn-sm ${clusterMethod === 'single' ? 'btn-secondary' : 'btn-outline-secondary'}">Single</button>
              <button id="clusterMethodAverage" class="btn btn-sm ${clusterMethod === 'average' ? 'btn-secondary' : 'btn-outline-secondary'}">Average</button>
              <button id="clusterMethodWard" class="btn btn-sm ${clusterMethod === 'ward' ? 'btn-secondary' : 'btn-outline-secondary'}">Ward</button>
            </div>
          </div>
          <div class="col-md-6">
            <label class="form-label small text-uppercase text-muted fw-bold mb-1">Distance</label>
            <div class="btn-group d-flex" role="group">
              <button id="clusterDistEuclidean" class="btn btn-sm ${clusterDistance === 'euclidean' ? 'btn-info' : 'btn-outline-info'}">Euclidean</button>
              <button id="clusterDistManhattan" class="btn btn-sm ${clusterDistance === 'manhattan' ? 'btn-info' : 'btn-outline-info'}">Manhattan</button>
              <button id="clusterDistCosine" class="btn btn-sm ${clusterDistance === 'cosine' ? 'btn-info' : 'btn-outline-info'}">Cosine</button>
            </div>
          </div>
          <div class="col-md-6">
            <label class="form-label small text-uppercase text-muted fw-bold mb-1">Scale</label>
            <div class="btn-group d-flex" role="group">
              <button id="clusterScaleRaw" class="btn btn-sm ${!normalize ? 'btn-dark' : 'btn-outline-dark'}">Raw PRS</button>
              <button id="clusterScaleZ" class="btn btn-sm ${normalize ? 'btn-dark' : 'btn-outline-dark'}">Z-score (per PGS)</button>
            </div>
            <div class="form-text small">Z-score standardizes each PGS column so no single model dominates by scale.</div>
          </div>
        </div>
      </div>
    </div>

    <div id="clusterPlotBox" style="position:relative;">
      <div id="clusterPlotScroll" style="overflow:auto; max-width:100%;">
        <div id="clusterPlotMount"></div>
      </div>
    </div>

    <div class="card mb-3 mt-3">
      <div class="card-header bg-white py-2">
        <span class="fw-semibold small text-uppercase text-muted">Downloads</span>
      </div>
      <div class="card-body py-3">
        <div class="d-flex flex-wrap align-items-center gap-2">
          <button id="downloadHeatmapPngBtn" class="btn btn-outline-primary btn-sm">⬇ Heatmap PNG</button>
          <span class="vr d-none d-sm-block"></span>
          <button id="downloadPrsMatrixBtn" class="btn btn-outline-secondary btn-sm">⬇ Matrix JSON</button>
          <button id="downloadPrsCsvBtn" class="btn btn-outline-secondary btn-sm">⬇ Matrix CSV</button>
        </div>
        <div class="form-text small mt-2">
          JSON and CSV use the ClustJS-compatible format: one row object per user with a <code>label</code> field and one field per PGS ID.
        </div>
      </div>
    </div>

    <div class="card mb-3">
      <div class="card-header bg-white py-2 d-flex align-items-center justify-content-between flex-wrap gap-2">
        <span class="fw-semibold small text-uppercase text-muted">Reproduce in R &mdash; pheatmap</span>
        <div class="d-flex align-items-center gap-2">
          <button id="runRWebRBtn" class="btn btn-success btn-sm">▶ Run in browser</button>
          <button id="resetRCodeBtn" class="btn btn-outline-secondary btn-sm">↺ Reset code</button>
        </div>
      </div>
      <div class="card-body py-3">
        <p class="text-muted small mb-2">
          Runs R directly in your browser via <a href="https://docs.r-wasm.org/webr/latest/" target="_blank" rel="noopener">WebR</a> &mdash; nothing to install.
          Your current PRS matrix is already loaded at <code>${WEBR_MATRIX_PATH}</code>, so the code below works as-is.
          The first run downloads the R runtime and <code>pheatmap</code> and may take a moment; later runs are fast.
        </p>
        <div id="webRStatus" class="small text-muted mb-2"></div>
        <label for="webRCode" class="form-label small text-uppercase text-muted fw-bold mb-1">R code &mdash; editable</label>
        <textarea id="webRCode" class="form-control form-control-sm bg-light" spellcheck="false" style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:0.8rem; line-height:1.5; white-space:pre; min-height:260px;"></textarea>
        <div id="webRPlots" class="mt-3"></div>
        <pre id="webRConsole" class="small bg-dark text-light rounded p-2 mt-3 mb-0" style="max-height:240px; overflow:auto; display:none;"></pre>
        <details class="mt-3">
          <summary class="small text-muted" style="cursor:pointer;">Run this in a local R / RStudio session instead</summary>
          <p class="text-muted small mt-2 mb-1">Download the CSV above, point <code>read.csv()</code> at it, and run:</p>
          <div class="d-flex justify-content-end mb-1">
            <button id="copyRCodeBtn" class="btn btn-outline-secondary btn-sm" style="font-size:0.7rem;padding:2px 8px;">📋 Copy</button>
          </div>
          <pre id="rCodeBlock" class="small bg-light border rounded p-2 mb-0" style="white-space:pre; overflow:auto;"><code>library(pheatmap)

# The current PRS matrix is preloaded into WebR at the path below.
prs <- read.csv("${WEBR_MATRIX_PATH}", check.names = FALSE)
rownames(prs) <- prs$label
prs_matrix <- as.matrix(prs[, -1])

# Z-score each PGS across users
prs_scaled <- scale(prs_matrix)

# Distance + hierarchical clustering of users
user_dist <- dist(prs_scaled, method = "euclidean")
user_hclust <- hclust(user_dist, method = "complete")

# Heatmap with row + column clustering
pheatmap(prs_scaled,
         cluster_rows = user_hclust,
         cluster_cols = TRUE,
         clustering_distance_cols = "euclidean",
         clustering_method = "complete",
         treeheight_row = 120,
         treeheight_col = 120,
         fontsize = 12,
         main = "PRS Hierarchical Clustering",
         border_color = NA)</code></pre>
        </details>
      </div>
    </div>
    </div>
  `;

  // Download PRS matrix as JSON (ClustJS-compatible)
  document.getElementById('downloadPrsMatrixBtn').onclick = () => {
    const data = clusterCache.pivoted ?? pivotPrsResults(window.prsResults);
    if (!data) { alert('No PRS matrix available. Run a PRS calculation first.'); return; }
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prs_matrix.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Copy the R clustering snippet to the clipboard.
  const copyRCodeBtn = document.getElementById('copyRCodeBtn');
  if (copyRCodeBtn) {
    copyRCodeBtn.onclick = async () => {
      const code = document.getElementById('rCodeBlock')?.innerText ?? '';
      try {
        await navigator.clipboard.writeText(code);
        const prev = copyRCodeBtn.textContent;
        copyRCodeBtn.textContent = '✓ Copied';
        setTimeout(() => { copyRCodeBtn.textContent = prev; }, 1500);
      } catch (err) {
        console.error('[PRS Clustering] Copy R code failed:', err);
        alert('Could not copy the R code.');
      }
    };
  }

  // WebR runner: seed the editor with the default code and wire Run / Reset.
  const webRCodeEl = document.getElementById('webRCode');
  if (webRCodeEl) {
    // Restore previously-entered code (or seed the default on first render).
    webRCodeEl.value = _webRState.code != null ? _webRState.code : WEBR_DEFAULT_CODE;
    webRCodeEl.addEventListener('input', () => { _webRState.code = webRCodeEl.value; });
  }
  // Restore any previously-rendered plots / console / status so switching a
  // clustering parameter for the first plot doesn't wipe the WebR output.
  const webRPlotsEl = document.getElementById('webRPlots');
  if (webRPlotsEl && _webRState.plotsHTML) webRPlotsEl.innerHTML = _webRState.plotsHTML;
  const webRConsoleEl = document.getElementById('webRConsole');
  if (webRConsoleEl && _webRState.consoleHTML) {
    webRConsoleEl.textContent = _webRState.consoleHTML;
    webRConsoleEl.style.display = _webRState.consoleVisible ? 'block' : 'none';
  }
  const webRStatusEl = document.getElementById('webRStatus');
  if (webRStatusEl && _webRState.status) webRStatusEl.textContent = _webRState.status;
  const runRWebRBtn = document.getElementById('runRWebRBtn');
  if (runRWebRBtn) runRWebRBtn.onclick = runRCodeInWebR;
  const resetRCodeBtn = document.getElementById('resetRCodeBtn');
  if (resetRCodeBtn) resetRCodeBtn.onclick = () => {
    if (webRCodeEl) webRCodeEl.value = WEBR_DEFAULT_CODE;
    _webRState.code = WEBR_DEFAULT_CODE;
  };

  // Download the rendered heatmap (the SVG inside the mount) as a PNG.
  document.getElementById('downloadHeatmapPngBtn').onclick = () => {
    const svg = document.querySelector('#clusterPlotMount svg');
    if (!svg) { alert('No plot available yet. Render the clustering heatmap first.'); return; }
    d3ToPng(svg, 'prs_clustering_heatmap', { scale: 2, background: 'white' })
      .catch(err => { console.error('[PRS Clustering] PNG export error:', err); alert('Could not export the plot as PNG.'); });
  };

  // Attach button handlers for PRS clustering
  document.getElementById('clusterRowsBtn').onclick = () => {
    window.clusterOptions = { ...window.clusterOptions, clusterRows: !clusterRows, clusterCols };
    renderCluster();
  };
  document.getElementById('clusterColsBtn').onclick = () => {
    window.clusterOptions = { ...window.clusterOptions, clusterRows, clusterCols: !clusterCols };
    renderCluster();
  };
  document.getElementById('clusterBothBtn').onclick = () => {
    const bothOn = clusterRows && clusterCols;
    window.clusterOptions = { ...window.clusterOptions, clusterRows: !bothOn, clusterCols: !bothOn };
    renderCluster();
  };

  // PRS clustering method handlers
  document.getElementById('clusterMethodComplete').onclick = () => {
    window.clusterOptions = { ...window.clusterOptions, clusterMethod: 'complete' };
    renderCluster();
  };
  document.getElementById('clusterMethodSingle').onclick = () => {
    window.clusterOptions = { ...window.clusterOptions, clusterMethod: 'single' };
    renderCluster();
  };
  document.getElementById('clusterMethodAverage').onclick = () => {
    window.clusterOptions = { ...window.clusterOptions, clusterMethod: 'average' };
    renderCluster();
  };
  document.getElementById('clusterMethodWard').onclick = () => {
    window.clusterOptions = { ...window.clusterOptions, clusterMethod: 'ward' };
    renderCluster();
  };

  // PRS clustering distance handlers
  document.getElementById('clusterDistEuclidean').onclick = () => {
    window.clusterOptions = { ...window.clusterOptions, clusterDistance: 'euclidean' };
    renderCluster();
  };
  document.getElementById('clusterDistManhattan').onclick = () => {
    window.clusterOptions = { ...window.clusterOptions, clusterDistance: 'manhattan' };
    renderCluster();
  };
  document.getElementById('clusterDistCosine').onclick = () => {
    window.clusterOptions = { ...window.clusterOptions, clusterDistance: 'cosine' };
    renderCluster();
  };

  // PRS clustering scale (normalization) handlers
  document.getElementById('clusterScaleRaw').onclick = () => {
    window.clusterOptions = { ...window.clusterOptions, normalize: false };
    renderCluster();
  };
  document.getElementById('clusterScaleZ').onclick = () => {
    window.clusterOptions = { ...window.clusterOptions, normalize: true };
    renderCluster();
  };

  // Wire PRS matrix CSV download
  const downloadPrsCsvBtn = document.getElementById('downloadPrsCsvBtn');
  if (downloadPrsCsvBtn) {
    downloadPrsCsvBtn.onclick = () => {
      const data = clusterCache.pivoted ?? pivotPrsResults(window.prsResults);
      if (!data) { alert('No PRS matrix available.'); return; }
      downloadMatrixAsCsv(data, `prs_matrix_${data.length}users.csv`);
    };
  }

  // Apply per-PGS z-score standardization when the Z-score scale is selected.
  const plotData = normalize ? standardizePivot(pivoted, pgsIds) : pivoted;

  // Append the reported trait to each PGS column label (plot only; downloads
  // keep raw PGS ids). Full label shows on hover; axis text is capped at 12 chars.
  const plotDataLabeled = relabelPgsColumns(plotData, getPgsTraitMap(window.prsResults));

  // Grow the canvas with the matrix so dendrograms and axis labels have room
  // and aren't clipped at the plot edges, while keeping a roughly square aspect.
  const colCount = Object.keys(pivoted[0]).length - 1;
  const fullWidth = Math.max(900, 120 * colCount + 400);
  const fullHeight = Math.max(760, 46 * pivoted.length + 320);
  // Render the plot smaller while keeping the reserved area (box) unchanged, so
  // the surrounding layout and the top-right download button stay put.
  const plotScale = 0.8;
  const plotWidth = Math.round(fullWidth * plotScale);
  const plotHeight = Math.round(fullHeight * plotScale);

  // Bound the scroll area to the drawn plot so wide/tall matrices scroll inside
  // the box without leaving blank space underneath.
  const plotBox = document.getElementById('clusterPlotBox');
  if (plotBox) plotBox.style.minHeight = plotHeight + 'px';
  const plotScroll = document.getElementById('clusterPlotScroll');
  if (plotScroll) plotScroll.style.maxHeight = plotHeight + 'px';

  // Render PRS cluster plot
  try {
    await hclust_plot({
       divId:  "clusterPlotMount",
      data: plotDataLabeled,
      width: plotWidth,
      height: plotHeight,
      marginBottom: 180,
     // marginRight: 240,
         // Pull the color legend + "Missing" swatch left so they aren't clipped at
      // the right edge. hclust_plot auto-computes the right margin (marginRight
      // is ignored), so legendOffsetX is the lever for legend position.
      legendOffsetX: 38,
      clusterRows: clusterRows,
      clusterCols: clusterCols,
      clusteringMethodRows: clusterMethod,
      clusteringMethodCols: clusterMethod,
      clusteringDistanceRows: clusterDistance,
      clusteringDistanceCols: clusterDistance
    });
  } catch(e) { console.error('[PRS Clustering] hclust_plot error:', e); }
}

window.renderCluster = renderCluster;

Object.defineProperty(window, "pivoted", {
  get() {
    return clusterCache.pivoted;
  },
  configurable: true,
});

Object.defineProperty(window, "clusterCache", {
  get() {
    return clusterCache;
  },
  configurable: true,
});

// --- window.sdk namespace (cluster) ---
window.sdk = Object.assign(window.sdk ?? {}, {
    renderCluster,
    invalidateClusterCache,
    getClusterCache: () => clusterCache,
});

// Add live getters for pivoted and clusterCache into window.sdk
Object.defineProperty(window.sdk, "pivoted", {
    get() { return clusterCache.pivoted; },
    configurable: true,
});
Object.defineProperty(window.sdk, "clusterCache", {
    get() { return clusterCache; },
    configurable: true,
});
