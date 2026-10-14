// Node-safe PGS Catalog SDK wrapper for Node.js/Cloud Run environments.
// Same function names as the browser wrapper (pgsSdk.js).
export {
	fetchAllScores,
	fetchSomeScores,
	fetchTraits,
	getScoresPerTrait,
	getScoresPerCategory,
	getPgsTxt
} from "pgs_catalog_sdk/cloud_sdk.mjs";
