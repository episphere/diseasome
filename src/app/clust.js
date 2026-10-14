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

// Ward-linkage constraint messages (shared by the initial template and the
// in-place control updates).
const WARD_TITLE = 'Ward linkage requires Euclidean distance (ward.D2). Switch distance to Euclidean to enable it.';
const NON_EUCLIDEAN_TITLE = 'Disabled with Ward linkage — Ward only retains its minimum-variance interpretation under Euclidean distance.';

// Small-matrix guard message: pairwise distances need at least 2 jointly
// observed values, so clustering either axis requires at least a 2 × 2 matrix.
const MIN_MATRIX_TITLE = 'Clustering requires at least 2 users and 2 models (a 2 × 2 PRS matrix).';

// Plot-only re-render machinery: the token supersedes stale renders and the
// promise queue serializes hclust_plot calls so rapid option clicks can't
// interleave their SVG output in the mount.
let _plotToken = 0;
let _plotQueue = Promise.resolve();

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
  // A single user still yields a useful 1 × N heatmap; row clustering for
  // degenerate matrices is disabled by the small-matrix guard in
  // getClusterOptions() rather than by suppressing the whole tab.
  return rows.length >= 1 ? rows : null;
}

/**
 * Standardize (z-score) each PGS column across users so that no single model
 * dominates the clustering distance purely because of its scale.
 * For each PGS: z = (value - mean) / sd, computed across all users that have a
 * finite value, using the sample standard deviation (n - 1 denominator) so the
 * result matches R's scale(). Columns with fewer than 2 finite values (or zero
 * variance) are left effectively unscaled (sd defaults to 1). Missing values
 * stay missing.
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
    // Sample standard deviation (n - 1 denominator), matching R's sd()/scale().
    const sumSquared = vals.reduce((a, b) => a + (b - mean) ** 2, 0);
    const sd = Math.sqrt(sumSquared / (vals.length - 1)) || 1;
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
let _webRState = { code: null, plotsHTML: '', consoleHTML: '', consoleVisible: false, status: '', expanded: false };

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


/** Read the current clustering options (with defaults) from window.clusterOptions. */
function getClusterOptions() {
  // Clamp row/column clustering when the matrix is too small: a dendrogram over
  // a single row/column is degenerate, and pairwise distances need at least 2
  // jointly observed values, so either axis requires at least a 2 × 2 matrix.
  // The stored preference is kept, so the option springs back when more data is
  // loaded. Unknown counts (cache not built yet) do not clamp.
  const userCount = clusterCache.userIds ? clusterCache.userIds.length : null;
  const modelCount = clusterCache.pgsIds ? clusterCache.pgsIds.length : null;
  const enoughUsers = userCount === null || userCount >= 2;
  const enoughModels = modelCount === null || modelCount >= 2;
  const canCluster = enoughUsers && enoughModels;
  return {
    clusterRows: (window.clusterOptions?.clusterRows ?? true) && canCluster,
    clusterCols: (window.clusterOptions?.clusterCols ?? true) && canCluster,
    canClusterRows: canCluster,
    canClusterCols: canCluster,
    enoughUsers,
    enoughModels,
    clusterMethod: window.clusterOptions?.clusterMethod ?? 'complete',
    clusterDistance: window.clusterOptions?.clusterDistance ?? 'euclidean',
    normalize: window.clusterOptions?.normalize ?? true,
    plotSize: window.clusterOptions?.plotSize ?? 'default', // 'fit' | 'default' (80%) | 'full' (100%)
  };
}

/**
 * Sync the option buttons and legend caption with window.clusterOptions in
 * place, so option clicks don't need to rebuild the whole panel.
 */
function updateClusterControlStates() {
  const { clusterRows, clusterCols, canClusterRows, canClusterCols, enoughUsers, enoughModels, clusterMethod, clusterDistance, normalize, plotSize } = getClusterOptions();
  const setActive = (id, active) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.classList.toggle('btn-primary', active);
    btn.classList.toggle('btn-outline-primary', !active);
    btn.setAttribute('aria-pressed', String(active));
  };
  setActive('clusterRowsBtn', clusterRows);
  setActive('clusterColsBtn', clusterCols);
  setActive('clusterMethodComplete', clusterMethod === 'complete');
  setActive('clusterMethodSingle', clusterMethod === 'single');
  setActive('clusterMethodAverage', clusterMethod === 'average');
  setActive('clusterMethodWard', clusterMethod === 'ward');
  setActive('clusterDistEuclidean', clusterDistance === 'euclidean');
  setActive('clusterDistManhattan', clusterDistance === 'manhattan');
  setActive('clusterDistCosine', clusterDistance === 'cosine');
  setActive('clusterScaleRaw', !normalize);
  setActive('clusterScaleZ', normalize);
  setActive('clusterSizeFit', plotSize === 'fit');
  setActive('clusterSizeDefault', plotSize === 'default');
  setActive('clusterSizeFull', plotSize === 'full');

  // Small-matrix guard: disable degenerate clustering and explain why inline
  // (title tooltips are invisible on touch devices).
  const rowsBtn = document.getElementById('clusterRowsBtn');
  if (rowsBtn) {
    rowsBtn.disabled = !canClusterRows;
    rowsBtn.title = canClusterRows ? 'Reorder users so similar ones sit next to each other.' : MIN_MATRIX_TITLE;
  }
  const colsBtn = document.getElementById('clusterColsBtn');
  if (colsBtn) {
    colsBtn.disabled = !canClusterCols;
    colsBtn.title = canClusterCols ? 'Reorder models so similar ones sit next to each other.' : MIN_MATRIX_TITLE;
  }
  const clusterByHint = document.getElementById('clusterByHint');
  if (clusterByHint) {
    const hint = !enoughUsers && !enoughModels
      ? 'Clustering needs at least 2 users and 2 models — load more genomes (tab 1) and risk models (tab 2).'
      : !enoughUsers
        ? 'Only one user loaded — clustering needs at least a 2 × 2 matrix. Load at least 2 genomes (tab 1).'
        : !enoughModels
          ? 'Only one model loaded — clustering needs at least a 2 × 2 matrix. Select at least 2 risk models (tab 2).'
          : '';
    clusterByHint.textContent = hint;
    clusterByHint.style.display = hint ? '' : 'none';
  }

  const wardActive = clusterMethod === 'ward';
  const nonEuclidean = clusterDistance !== 'euclidean';
  const wardBtn = document.getElementById('clusterMethodWard');
  if (wardBtn) {
    wardBtn.disabled = nonEuclidean;
    wardBtn.title = nonEuclidean ? WARD_TITLE : 'Ward (ward.D2) minimum-variance linkage — Euclidean only.';
  }
  const distTitles = { clusterDistManhattan: 'Manhattan (city-block) distance.', clusterDistCosine: 'Cosine distance.' };
  for (const [id, title] of Object.entries(distTitles)) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    btn.disabled = wardActive;
    btn.title = wardActive ? NON_EUCLIDEAN_TITLE : title;
  }

  const caption = document.getElementById('clusterLegendCaption');
  if (caption) caption.textContent = `Heatmap color = ${normalize ? 'z-score of PRS (standardized per PGS column)' : 'raw PRS value'} · gray = missing · drag to zoom — “Reset zoom” restores the full view.`;

  // Inline hint under the distance group explaining why buttons are disabled
  // (title tooltips are invisible on touch devices).
  const distHint = document.getElementById('clusterDistanceHint');
  if (distHint) {
    distHint.textContent = wardActive
      ? 'Manhattan and cosine are disabled while Ward linkage is selected — Ward requires Euclidean distance.'
      : nonEuclidean
        ? 'Ward linkage is unavailable with Manhattan/cosine distance — it requires Euclidean.'
        : 'Single, complete, and average linkage work with any distance. Ward (ward.D2) is restricted to Euclidean, where its minimum-variance interpretation holds.';
  }
}

/** Show a translucent spinner overlay on the plot box while it re-renders. */
function showPlotOverlay() {
  const box = document.getElementById('clusterPlotBox');
  if (!box || box.querySelector('.cluster-plot-overlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'cluster-plot-overlay d-flex align-items-center justify-content-center';
  overlay.style.cssText = 'position:absolute; inset:0; background:rgba(255,255,255,0.6); z-index:5;';
  overlay.innerHTML = '<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Re-rendering…</span></div>';
  box.appendChild(overlay);
}

function hidePlotOverlay() {
  document.querySelector('#clusterPlotBox .cluster-plot-overlay')?.remove();
}

/**
 * Queue a plot-only re-render. The previous plot stays visible under an
 * overlay spinner; superseded clicks are skipped via the token and renders are
 * serialized via the queue so hclust_plot calls never overlap.
 */
function schedulePlotRender() {
  const token = ++_plotToken;
  showPlotOverlay();
  _plotQueue = _plotQueue
    .then(async () => {
      if (token !== _plotToken) return; // superseded by a newer option click
      await drawClusterPlot();
    })
    .catch(e => console.error('[PRS Clustering] plot render error:', e))
    .finally(() => { if (token === _plotToken) hidePlotOverlay(); });
}

/**
 * Draw (or redraw) only the heatmap/dendrogram using the cached matrix and the
 * current window.clusterOptions, leaving controls, downloads, and the WebR
 * card untouched.
 */
async function drawClusterPlot() {
  const pivoted = clusterCache.pivoted;
  if (!pivoted || !document.getElementById('clusterPlotMount')) return;
  const pgsIds = clusterCache.pgsIds ?? getUniquePgsIds(window.prsResults);
  const { clusterRows, clusterCols, clusterMethod, clusterDistance, normalize, plotSize } = getClusterOptions();

  // ClustJS validates pairwise distances even when both cluster toggles are
  // off, and any axis pair needs at least 2 jointly observed values — so a
  // heatmap requires at least a 2 × 2 matrix. Show guidance instead of a
  // console error for degenerate matrices.
  const matrixCols = Object.keys(pivoted[0]).length - 1;
  if (pivoted.length < 2 || matrixCols < 2) {
    const mount = document.getElementById('clusterPlotMount');
    mount.innerHTML = `<div class="alert alert-info my-2" style="max-width:680px;">
      <strong>Not enough data for a heatmap.</strong><br>
      The clustering heatmap needs at least 2 users and 2 models with PRS results —
      currently ${pivoted.length} user${pivoted.length === 1 ? '' : 's'} × ${matrixCols} model${matrixCols === 1 ? '' : 's'}.
      Load more genomes (tab 1) or risk models (tab 2), recalculate PRS, and return here.
      The PRS matrix can still be downloaded below.
    </div>`;
    const plotBox = document.getElementById('clusterPlotBox');
    if (plotBox) plotBox.style.minHeight = '0';
    return;
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
  // Render the plot at the selected size preset while keeping the reserved
  // area (box) unchanged: 'fit' shrinks to the visible width (no horizontal
  // scrolling), 'default' is 80%, 'full' is 100%.
  let plotScale;
  if (plotSize === 'fit') {
    const avail = document.getElementById('clusterPlotScroll')?.clientWidth || fullWidth;
    plotScale = Math.max(0.3, Math.min(1, avail / fullWidth));
  } else if (plotSize === 'full') {
    plotScale = 1;
  } else {
    plotScale = 0.8;
  }
  const plotWidth = Math.round(fullWidth * plotScale);
  const plotHeight = Math.round(fullHeight * plotScale);

  // Bound the scroll area to the drawn plot so wide/tall matrices scroll inside
  // the box without leaving blank space underneath.
  const plotBox = document.getElementById('clusterPlotBox');
  if (plotBox) plotBox.style.minHeight = plotHeight + 'px';
  const plotScroll = document.getElementById('clusterPlotScroll');
  if (plotScroll) plotScroll.style.maxHeight = plotHeight + 'px';

  try {
    await hclust_plot({
      divId: "clusterPlotMount",
      data: plotDataLabeled,
      width: plotWidth,
      height: plotHeight,
      marginBottom: 180,
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
  } catch (e) { console.error('[PRS Clustering] hclust_plot error:', e); }

  // The remote ClustJS SDK appends the row index to each user label to keep
  // axis labels unique (e.g. "v5 Cajun" is rendered as "v5 Cajun1"), which
  // reads like part of the name. Rewrite exact "<label><index>" matches in the
  // rendered SVG back to the clean label.
  try {
    const labels = plotDataLabeled.map(r => r.label);
    document.querySelectorAll('#clusterPlotMount svg text').forEach(t => {
      const raw = (t.textContent ?? '').trim();
      for (let i = 0; i < labels.length; i++) {
        if (raw === `${labels[i]}${i}`) { t.textContent = labels[i]; break; }
      }
    });
  } catch (e) { console.warn('[PRS Clustering] label cleanup skipped:', e); }
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
    // Allow the loading UI to render before heavy computation.
    // Note: setTimeout (not requestAnimationFrame) — rAF never fires while the
    // browser tab is hidden, which would leave the spinner stuck until the user
    // returns to the tab.
    await new Promise(resolve => setTimeout(resolve, 30));
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
  const { clusterRows, clusterCols, canClusterRows, canClusterCols, clusterMethod, clusterDistance, normalize, plotSize } = getClusterOptions();

  // Ward linkage minimizes the increase in within-cluster sum of squared deviations
  // and only retains its minimum-variance interpretation (R's hclust ward.D2) under
  // Euclidean distance. So Ward is only offered with Euclidean, and Manhattan/cosine
  // are disabled while Ward is active. Single/complete/average work on any supplied
  // dissimilarity matrix and stay available for all three distances.
  const wardActive = clusterMethod === 'ward';
  const nonEuclidean = clusterDistance !== 'euclidean';
  const wardTitle = WARD_TITLE;
  const nonEuclideanTitle = NON_EUCLIDEAN_TITLE;
  const traitCount = new Set(Object.values(getPgsTraitMap(window.prsResults))).size;

  clusterContainer.innerHTML = `
    <div id="clusterSectionA">
    <div class="d-flex align-items-baseline flex-wrap gap-2 mb-2">
      <span class="badge bg-light text-dark border">${pivoted.length} users</span>
      <span class="badge bg-light text-dark border">${Object.keys(pivoted[0]).length - 1} PGS models</span>
      ${traitCount > 0 ? `<span class="badge bg-light text-dark border">${traitCount} trait${traitCount === 1 ? '' : 's'}</span>` : ''}
    </div>

    <div class="card mb-3">
      <div class="card-body py-3">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label small text-uppercase text-muted fw-bold mb-1">Cluster by</label>
            <div class="btn-group d-flex" role="group">
              <button id="clusterRowsBtn" class="btn btn-sm ${clusterRows ? 'btn-primary' : 'btn-outline-primary'}" aria-pressed="${clusterRows}" ${canClusterRows ? '' : 'disabled'} title="${canClusterRows ? 'Reorder users so similar ones sit next to each other.' : MIN_MATRIX_TITLE}">Users (rows)</button>
              <button id="clusterColsBtn" class="btn btn-sm ${clusterCols ? 'btn-primary' : 'btn-outline-primary'}" aria-pressed="${clusterCols}" ${canClusterCols ? '' : 'disabled'} title="${canClusterCols ? 'Reorder models so similar ones sit next to each other.' : MIN_MATRIX_TITLE}">Models (columns)</button>
            </div>
            <div class="form-text small" id="clusterByHint" style="display:none;"></div>
          </div>
          <div class="col-md-6">
            <label class="form-label small text-uppercase text-muted fw-bold mb-1">Linkage</label>
            <div class="btn-group d-flex" role="group">
              <button id="clusterMethodComplete" class="btn btn-sm ${clusterMethod === 'complete' ? 'btn-primary' : 'btn-outline-primary'}" aria-pressed="${clusterMethod === 'complete'}">Complete</button>
              <button id="clusterMethodSingle" class="btn btn-sm ${clusterMethod === 'single' ? 'btn-primary' : 'btn-outline-primary'}" aria-pressed="${clusterMethod === 'single'}">Single</button>
              <button id="clusterMethodAverage" class="btn btn-sm ${clusterMethod === 'average' ? 'btn-primary' : 'btn-outline-primary'}" aria-pressed="${clusterMethod === 'average'}">Average</button>
              <button id="clusterMethodWard" class="btn btn-sm ${clusterMethod === 'ward' ? 'btn-primary' : 'btn-outline-primary'}" aria-pressed="${clusterMethod === 'ward'}" ${nonEuclidean ? 'disabled' : ''} title="${nonEuclidean ? wardTitle : 'Ward (ward.D2) minimum-variance linkage — Euclidean only.'}">Ward</button>
            </div>
          </div>
          <div class="col-md-6">
            <label class="form-label small text-uppercase text-muted fw-bold mb-1">Distance</label>
            <div class="btn-group d-flex" role="group">
              <button id="clusterDistEuclidean" class="btn btn-sm ${clusterDistance === 'euclidean' ? 'btn-primary' : 'btn-outline-primary'}" aria-pressed="${clusterDistance === 'euclidean'}">Euclidean</button>
              <button id="clusterDistManhattan" class="btn btn-sm ${clusterDistance === 'manhattan' ? 'btn-primary' : 'btn-outline-primary'}" aria-pressed="${clusterDistance === 'manhattan'}" ${wardActive ? 'disabled' : ''} title="${wardActive ? nonEuclideanTitle : 'Manhattan (city-block) distance.'}">Manhattan</button>
              <button id="clusterDistCosine" class="btn btn-sm ${clusterDistance === 'cosine' ? 'btn-primary' : 'btn-outline-primary'}" aria-pressed="${clusterDistance === 'cosine'}" ${wardActive ? 'disabled' : ''} title="${wardActive ? nonEuclideanTitle : 'Cosine distance.'}">Cosine</button>
            </div>
            <div class="form-text small" id="clusterDistanceHint">Single, complete, and average linkage work with any distance. Ward (ward.D2) is restricted to Euclidean, where its minimum-variance interpretation holds.</div>
          </div>
          <div class="col-md-6">
            <label class="form-label small text-uppercase text-muted fw-bold mb-1">Scale</label>
            <div class="btn-group d-flex" role="group">
              <button id="clusterScaleRaw" class="btn btn-sm ${!normalize ? 'btn-primary' : 'btn-outline-primary'}" aria-pressed="${!normalize}">Raw PRS</button>
              <button id="clusterScaleZ" class="btn btn-sm ${normalize ? 'btn-primary' : 'btn-outline-primary'}" aria-pressed="${normalize}">Z-score (per PGS)</button>
            </div>
            <div class="form-text small">Z-score standardizes each PGS column so no single model dominates by scale.</div>
          </div>
        </div>
      </div>
    </div>

    <div class="d-flex align-items-center flex-wrap gap-2 mb-1">
      <span id="clusterLegendCaption" class="small text-muted">Heatmap color = ${normalize ? 'z-score of PRS (standardized per PGS column)' : 'raw PRS value'} · gray = missing · drag to zoom — “Reset zoom” restores the full view.</span>
      <div class="ms-auto d-flex align-items-center gap-2">
        <div class="btn-group" role="group" aria-label="Plot size">
          <button id="clusterSizeFit" class="btn btn-sm ${plotSize === 'fit' ? 'btn-primary' : 'btn-outline-primary'}" aria-pressed="${plotSize === 'fit'}" title="Shrink the plot to the visible width (no horizontal scrolling).">Fit width</button>
          <button id="clusterSizeDefault" class="btn btn-sm ${plotSize === 'default' ? 'btn-primary' : 'btn-outline-primary'}" aria-pressed="${plotSize === 'default'}">80%</button>
          <button id="clusterSizeFull" class="btn btn-sm ${plotSize === 'full' ? 'btn-primary' : 'btn-outline-primary'}" aria-pressed="${plotSize === 'full'}">100%</button>
        </div>
        <button id="downloadHeatmapPngBtn" class="btn btn-outline-secondary btn-sm" title="Download the rendered heatmap as a PNG image."><i class="fa fa-download me-1" aria-hidden="true"></i>PNG</button>
      </div>
    </div>
    <div id="clusterPlotBox" style="position:relative; min-height:200px;">
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
          <button id="downloadPrsMatrixBtn" class="btn btn-outline-secondary btn-sm"><i class="fa fa-download me-1" aria-hidden="true"></i>Matrix JSON</button>
          <button id="downloadPrsCsvBtn" class="btn btn-outline-secondary btn-sm"><i class="fa fa-download me-1" aria-hidden="true"></i>Matrix CSV</button>
        </div>
        <div class="form-text small mt-2">
          JSON and CSV use the ClustJS-compatible format: one row object per user with a <code>label</code> field and one field per PGS ID. The rendered heatmap can be downloaded as PNG from the button above the plot.
        </div>
      </div>
    </div>

    <div class="card mb-3">
      <div class="card-header bg-white py-2 d-flex align-items-center justify-content-between flex-wrap gap-2">
        <button id="webRCardToggle" type="button" class="btn btn-link btn-sm p-0 text-decoration-none fw-semibold small text-uppercase text-muted" aria-expanded="${_webRState.expanded}" aria-controls="webRCardBody">
          <i id="webRCardChevron" class="fa fa-caret-${_webRState.expanded ? 'down' : 'right'} me-1" aria-hidden="true"></i>Reproduce in R &mdash; pheatmap
        </button>
        <div class="d-flex align-items-center gap-2">
          <button id="runRWebRBtn" class="btn btn-success btn-sm"><i class="fa fa-play me-1" aria-hidden="true"></i>Run in browser</button>
          <button id="resetRCodeBtn" class="btn btn-outline-secondary btn-sm"><i class="fa fa-undo me-1" aria-hidden="true"></i>Reset code</button>
        </div>
      </div>
      <div id="webRCardBody" class="${_webRState.expanded ? '' : 'd-none'}">
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
            <button id="copyRCodeBtn" class="btn btn-outline-secondary btn-sm btn-cache"><i class="fa fa-clipboard me-1" aria-hidden="true"></i>Copy</button>
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
        const prev = copyRCodeBtn.innerHTML;
        copyRCodeBtn.innerHTML = '<i class="fa fa-check me-1" aria-hidden="true"></i>Copied';
        setTimeout(() => { copyRCodeBtn.innerHTML = prev; }, 1500);
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
  // Collapsible WebR card (collapsed by default; state survives re-renders).
  const setWebRExpanded = (expanded) => {
    _webRState.expanded = expanded;
    document.getElementById('webRCardBody')?.classList.toggle('d-none', !expanded);
    const toggle = document.getElementById('webRCardToggle');
    if (toggle) toggle.setAttribute('aria-expanded', String(expanded));
    const chevron = document.getElementById('webRCardChevron');
    if (chevron) chevron.className = `fa fa-caret-${expanded ? 'down' : 'right'} me-1`;
  };
  const webRCardToggle = document.getElementById('webRCardToggle');
  if (webRCardToggle) webRCardToggle.onclick = () => setWebRExpanded(!_webRState.expanded);
  const runRWebRBtn = document.getElementById('runRWebRBtn');
  if (runRWebRBtn) runRWebRBtn.onclick = () => {
    // Expand so the status/plots/console are visible while R runs.
    setWebRExpanded(true);
    runRCodeInWebR();
  };
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

  // Attach button handlers for PRS clustering. Option clicks update the
  // controls in place and re-render only the plot (previous plot stays visible
  // under an overlay spinner) instead of rebuilding the whole panel.
  const applyOptionChange = (patch) => {
    window.clusterOptions = { ...window.clusterOptions, ...patch };
    updateClusterControlStates();
    schedulePlotRender();
  };
  document.getElementById('clusterRowsBtn').onclick = () => {
    applyOptionChange({ clusterRows: !getClusterOptions().clusterRows });
  };
  document.getElementById('clusterColsBtn').onclick = () => {
    applyOptionChange({ clusterCols: !getClusterOptions().clusterCols });
  };

  // Plot size preset handlers
  document.getElementById('clusterSizeFit').onclick = () => applyOptionChange({ plotSize: 'fit' });
  document.getElementById('clusterSizeDefault').onclick = () => applyOptionChange({ plotSize: 'default' });
  document.getElementById('clusterSizeFull').onclick = () => applyOptionChange({ plotSize: 'full' });

  // PRS clustering method handlers
  document.getElementById('clusterMethodComplete').onclick = () => applyOptionChange({ clusterMethod: 'complete' });
  document.getElementById('clusterMethodSingle').onclick = () => applyOptionChange({ clusterMethod: 'single' });
  document.getElementById('clusterMethodAverage').onclick = () => applyOptionChange({ clusterMethod: 'average' });
  document.getElementById('clusterMethodWard').onclick = () => {
    // Ward only holds its minimum-variance interpretation under Euclidean distance,
    // so selecting Ward forces the distance to Euclidean (ward.D2).
    applyOptionChange({ clusterMethod: 'ward', clusterDistance: 'euclidean' });
  };

  // PRS clustering distance handlers
  document.getElementById('clusterDistEuclidean').onclick = () => applyOptionChange({ clusterDistance: 'euclidean' });
  document.getElementById('clusterDistManhattan').onclick = () => {
    // Ward is invalid with non-Euclidean distances; fall back to complete linkage.
    const method = getClusterOptions().clusterMethod === 'ward' ? 'complete' : getClusterOptions().clusterMethod;
    applyOptionChange({ clusterDistance: 'manhattan', clusterMethod: method });
  };
  document.getElementById('clusterDistCosine').onclick = () => {
    // Ward is invalid with non-Euclidean distances; fall back to complete linkage.
    const method = getClusterOptions().clusterMethod === 'ward' ? 'complete' : getClusterOptions().clusterMethod;
    applyOptionChange({ clusterDistance: 'cosine', clusterMethod: method });
  };

  // PRS clustering scale (normalization) handlers
  document.getElementById('clusterScaleRaw').onclick = () => applyOptionChange({ normalize: false });
  document.getElementById('clusterScaleZ').onclick = () => applyOptionChange({ normalize: true });

  // Wire PRS matrix CSV download
  const downloadPrsCsvBtn = document.getElementById('downloadPrsCsvBtn');
  if (downloadPrsCsvBtn) {
    downloadPrsCsvBtn.onclick = () => {
      const data = clusterCache.pivoted ?? pivotPrsResults(window.prsResults);
      if (!data) { alert('No PRS matrix available.'); return; }
      downloadMatrixAsCsv(data, `prs_matrix_${data.length}users.csv`);
    };
  }

  // Sync control states (Ward/distance disabling, both-button label, caption)
  // and draw the plot via the serialized plot queue.
  updateClusterControlStates();
  schedulePlotRender();
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
