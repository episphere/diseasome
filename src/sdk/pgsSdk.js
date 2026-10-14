// Centralized PGS Catalog SDK wrapper (browser).
// Imports from the pinned npm package (github:lorenasandoval88/pgs_catalog_sdk)
// so builds are reproducible and the bundle is self-contained.
export {
	fetchAllScores,
	fetchSomeScores,
	fetchTraits,
	getScoresPerTrait,
	getScoresPerCategory,
	getPgsTxt,
	parseScore,
	estimateLocalForageSizeKB, checkStorageKB, getTextSizeKB
} from "pgs_catalog_sdk";
