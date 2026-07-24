export { buildExerciseViewPhase3A, buildExerciseViewV1, isEmptyQuestionSubtree, EXERCISE_VIEW_GENERATOR_VERSION_V1 } from "./buildExerciseView.mjs";
export { PHASE3A_TARGET_CHECKBLOCK_IDS, findCheckSectionById, findTargetCheckSections, findAllCheckSections, collectMajorQuestionUnits, collectLeafDescendants } from "./selectors.mjs";
export { getSourceItemId, getSourceItemIds, getStableItemId, getStableItemIds, getContentFingerprint, getContentFingerprints } from "./sourceRef.mjs";
export { toRef } from "./mappings.mjs";
export { indexAnomaliesByUnitId, classifyUnitEligibility, combineEligibility } from "./eligibility.mjs";
export { INELIGIBLE_CATEGORIES_FOR_REPORT, REVIEW_REQUIRED_CATEGORIES_FOR_REPORT } from "./eligibilityCategories.mjs";
export { buildComparisonRows, toComparisonCsvText, COMPARISON_COLUMNS } from "./comparisonBuilder.mjs";
export { buildKmCompatFromExerciseView } from "./kmCompatAdapter.mjs";
export {
  buildBsmIndex,
  validateSchemaShape,
  validateHasSourceBookStructureIds,
  validateSourceBsmIdsExist,
  validateVerbatimMatch,
  validateAnswerProvenance,
  validateSharedPromptNoRedundantDuplication,
  validateMultiAndSingleBlankSameSubtree,
  validateTrueFalseFieldsNotMixed,
  validateIneligibleNotExposedAsEligible,
  validateReviewRequiredExposed,
  validateNoGuessedValues,
  validateSourceItemIdAccessIsolated,
  validateNoKmBaselineMixedIn,
  validateDeterminism,
  validateSchemaShapeV1,
  validateNoDuplicateExerciseIds,
  validateNoWithheldCategoryInExercisesArray,
  validateReviewRequiredInWithheldArray,
  validateFullItemCoverage,
  validateStableItemIdsMatchBsm,
  validateReviewOverrideConsistency,
} from "./validator.mjs";
