// Centralized PGP SDK wrapper (browser).
// Imports from the pinned npm package (github:lorenasandoval88/personal_genomes_project_sdk)
// so builds are reproducible and the bundle is self-contained.
export {
	parse23Txt,
	get23Txt,
	allUsersMetaDataByType_fast,
	fetch23andMeParticipants,
	fetchAvailableDataTypes,
	fetchProfile,
} from "personal_genomes_project_sdk";
