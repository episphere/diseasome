// Observable notebooks documenting how the app's precomputed 23andMe / PGS data were built.
const BASE = "https://observablehq.com/@lorenasandoval88";

export const NOTEBOOKS = {
	pgpFiles: { url: `${BASE}/23andme-files-from-the-pgp`, label: "How PGP 23andMe files were collected" },
	chipManifests: { url: `${BASE}/23andme-manifest`, label: "How the chip manifests were built" },
	chipOverlap: { url: `${BASE}/23andme-v3v4v5-overlap`, label: "Chip overlap & fingerprints" },
	chipClassification: { url: `${BASE}/23andme-chip-classification`, label: "Fingerprint-based chip classification" },
	pgsChipOverlap: { url: `${BASE}/pgs-models-overlap-with-23andme-chips`, label: "How PGS–chip overlap was computed" },
};
