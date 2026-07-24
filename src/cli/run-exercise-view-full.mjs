// Exercise View Phase 3B-1 実行CLI。
// docs/exercise_view_spec_v1.md / docs/exercise_view_schema_v1.json（Phase 3B-0で凍結）に基づき、
// BSM全体（全322 CheckBlock・1,121 Item相当）を対象にExercise View（exercises/withheldExercises）を
// 全件生成し、検証する。
// 入力（BSM・Intermediate JSON）は読み取り専用。既存Knowledge Master・CSV Bridge・HTMLアプリ・
// KM互換Adapter（Phase 3B-2で実装済み）のいずれにも接続・変更しない。
// Item IDは現行互換helper（src/exerciseView/sourceRef.mjs）経由でlegacyItemId（item-NNN）を
// 引き続き取得しつつ、F2（Item ID正式化、docs/item_id_formalization_design_memo.md）以降は
// BSMのprovenance.stableItemId由来の安定IDもExerciseへ並行して保持する。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { detectAnomalies } from "../bookStructureMaster/anomalyDetector.mjs";
import { buildExerciseViewV1, isEmptyQuestionSubtree } from "../exerciseView/buildExerciseView.mjs";
import { findAllCheckSections, collectMajorQuestionUnits, collectLeafDescendants } from "../exerciseView/selectors.mjs";
import { getSourceItemId } from "../exerciseView/sourceRef.mjs";
import { indexAnomaliesByUnitId } from "../exerciseView/eligibility.mjs";
import {
  buildBsmIndex,
  validateHasSourceBookStructureIds,
  validateSourceBsmIdsExist,
  validateVerbatimMatch,
  validateAnswerProvenance,
  validateSharedPromptNoRedundantDuplication,
  validateMultiAndSingleBlankSameSubtree,
  validateTrueFalseFieldsNotMixed,
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
  validateAnswerFormMatchesUnitKind,
  validateWithheldAnswerContentConsistency,
  validateMultiBlankSubQuestions,
  validateBodySegments,
} from "../exerciseView/validator.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

function collectAllItems(groups) {
  const items = new Map();
  function walk(g) {
    for (const cb of g.checkBlocks) for (const q of cb.questions) for (const it of q.items) items.set(it.id, it);
    for (const c of g.children) walk(c);
  }
  for (const g of groups) walk(g);
  return items;
}

// 既存の他レイヤー・BSM Full出力・Phase2A/2B・Phase3A試作記録・Phase3B-0仕様文書に
// 変更がないことを確認するための、対象ファイル群のsha256スナップショット。
const WATCHED_OTHER_LAYERS = [
  "src/parser",
  "src/knowledgeMaster",
  "src/csvBridge",
  "src/exporter",
  "reference/current_app",
  "output/csv_bridge_○×用.csv",
  "output/csv_bridge_4択用.csv",
  "output/csv_bridge_財表DB③形式.csv",
  "output/README.md",
  "output/knowledge_master_full_scan.json",
];
const WATCHED_BSM_FULL = [
  "output/book_structure_master_full.json",
  "output/book_structure_master_full_validation.json",
  "output/book_structure_master_full_anomalies.csv",
  "src/bookStructureMaster",
];
const WATCHED_PHASE2 = [
  "output/book_structure_master_phase2a.json",
  "output/book_structure_master_phase2a_validation.json",
  "docs/book_structure_master_phase2a_report.md",
  "docs/book_structure_master_phase2b_report.md",
];
// Phase 3A試作記録・Phase 3B-0凍結仕様は、今回のPhase 3B-1実装でも変更しない
// （docs/exercise_view_spec_v1.md冒頭の指示どおり、v1仕様の参照元として保持し続ける）。
const WATCHED_PHASE3_PRIOR_ARTIFACTS = [
  "output/exercise_view_phase3a.json",
  "output/exercise_view_phase3a_validation.json",
  "output/exercise_view_phase3a_comparison.csv",
  "docs/exercise_view_phase3a_report.md",
  "docs/exercise_view_schema_draft.json",
  "docs/exercise_view_phase3b_decision_memo.md",
  "docs/exercise_view_spec_v1.md",
  "docs/exercise_view_schema_v1.json",
];

function hashFile(absPath) {
  return createHash("sha256").update(readFileSync(absPath)).digest("hex");
}

function snapshotHashes(relPaths) {
  const snapshot = {};
  for (const rel of relPaths) {
    const abs = path.join(ROOT, rel);
    let st;
    try {
      st = statSync(abs);
    } catch {
      snapshot[rel] = null;
      continue;
    }
    if (st.isDirectory()) {
      const fileHashes = {};
      (function walk(dir, relDir) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const abs2 = path.join(dir, entry.name);
          const rel2 = path.join(relDir, entry.name);
          if (entry.isDirectory()) walk(abs2, rel2);
          else fileHashes[rel2] = hashFile(abs2);
        }
      })(abs, "");
      snapshot[rel] = fileHashes;
    } else {
      snapshot[rel] = hashFile(abs);
    }
  }
  return snapshot;
}

function diffSnapshots(before, after) {
  const changed = [];
  for (const rel of Object.keys(before)) {
    const b = before[rel];
    const a = after[rel];
    if (typeof b === "string" || b === null) {
      if (a !== b) changed.push(rel);
    } else {
      const keys = new Set([...Object.keys(b), ...Object.keys(a ?? {})]);
      for (const k of keys) {
        if ((b ?? {})[k] !== (a ?? {})[k]) changed.push(`${rel}/${k}`);
      }
    }
  }
  return changed;
}

// combined = eligibility状態によらず全Exercise（exercises+withheldExercises）。
// Phase 3Aで実装済みの汎用チェック関数（配列を1つだけ見るシグネチャ）を、
// 新しいv1形状(2配列)に対しても書き換えずにそのまま再利用するためのラッパー。
function combinedView(exerciseView) {
  return { exercises: [...exerciseView.exercises, ...exerciseView.withheldExercises] };
}

function main() {
  const bsmPath = path.join(ROOT, "output/book_structure_master_full.json");
  const corpusPath = path.join(ROOT, "output/intermediate_full_scan.json");

  const beforeOtherLayers = snapshotHashes(WATCHED_OTHER_LAYERS);
  const beforeBsmFull = snapshotHashes(WATCHED_BSM_FULL);
  const beforePhase2 = snapshotHashes(WATCHED_PHASE2);
  const beforePhase3Prior = snapshotHashes(WATCHED_PHASE3_PRIOR_ARTIFACTS);

  console.log("=== Step A: 入力の読み込み(読み取り専用) ===");
  const bsm = JSON.parse(readFileSync(bsmPath, "utf8"));
  const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
  const itemsById = collectAllItems(corpus.books[0].groups);

  console.log("=== Step B: BSM異常検出(既存anomalyDetector.mjsをそのまま呼ぶ、新規判定ロジックなし) ===");
  const anomalies = detectAnomalies(bsm, { itemsById, builderErrors: [], validationIssues: [] });
  const anomaliesByUnitId = indexAnomaliesByUnitId(anomalies);

  console.log("=== Step C: 対象CheckBlockの全件列挙(固定リストではなく全322件) ===");
  const targets = findAllCheckSections(bsm);
  console.log("対象CheckBlock数:", targets.length);

  console.log("=== Step D: Exercise View全件生成 ===");
  const sourceBsmFile = "output/book_structure_master_full.json";
  const { exerciseView, generationFailures, emptyQuestionsSkipped } = buildExerciseViewV1(bsm, {
    targets,
    anomaliesByUnitId,
    generatedAt: new Date().toISOString(),
    sourceBsmFile,
  });
  // 検証(決定論性)用に、時刻以外は同一入力から再生成する
  const { exerciseView: exerciseViewRerun } = buildExerciseViewV1(bsm, {
    targets,
    anomaliesByUnitId,
    generatedAt: new Date(Date.now() + 1000).toISOString(),
    sourceBsmFile,
  });

  // Item自体が存在しない空Question(isEmptyQuestionSubtree)は、生成処理の側でも生成対象外として
  // スキップしている。ここでの集計も同じ判定を使い、「対応するItemが無いノード」を
  // 「Item IDが取得できなかった問題」として二重に数えないようにする
  // （空QuestionはemptyQuestionsSkippedとして別途カウント済み。§Phase 3B-1完了報告参照）。
  console.log("=== Step E: Item ID取得状況の集計(現行互換helper経由) ===");
  let missingItemIdCount = 0;
  const missingItemIdExamples = [];
  for (const { checkBlockId, checkSection } of targets) {
    for (const majorUnit of collectMajorQuestionUnits(checkSection)) {
      if (isEmptyQuestionSubtree(majorUnit)) continue;
      for (const leaf of collectLeafDescendants(majorUnit)) {
        if (getSourceItemId(leaf) === null) {
          missingItemIdCount += 1;
          if (missingItemIdExamples.length < 20) {
            missingItemIdExamples.push({ checkBlockId, majorUnitId: majorUnit.id, leafId: leaf.id });
          }
        }
      }
    }
  }

  console.log("=== Step F: 検証 ===");
  const bsmNodesById = buildBsmIndex(bsm);
  const combined = combinedView(exerciseView);
  const checks = {};
  checks["schema_shape_v1"] = validateSchemaShapeV1(exerciseView);
  checks["no_duplicate_exercise_ids"] = validateNoDuplicateExerciseIds(exerciseView);
  checks["has_source_bsm_ids"] = validateHasSourceBookStructureIds(combined);
  checks["source_bsm_ids_exist"] = validateSourceBsmIdsExist(combined, bsmNodesById);
  checks["verbatim_match"] = validateVerbatimMatch(combined, bsmNodesById);
  checks["answer_provenance"] = validateAnswerProvenance(combined);
  checks["shared_prompt_no_redundant_duplication"] = validateSharedPromptNoRedundantDuplication(combined);
  checks["multi_single_same_subtree"] = validateMultiAndSingleBlankSameSubtree(combined);
  checks["truefalse_fields_not_mixed"] = validateTrueFalseFieldsNotMixed(combined);
  checks["no_withheld_category_in_exercises_array"] = validateNoWithheldCategoryInExercisesArray(exerciseView, anomaliesByUnitId);
  checks["review_required_in_withheld_array"] = validateReviewRequiredInWithheldArray(exerciseView, anomaliesByUnitId);
  checks["no_guessed_values"] = validateNoGuessedValues(combined, bsmNodesById);
  checks["source_item_id_access_isolated"] = validateSourceItemIdAccessIsolated(path.join(ROOT, "src/exerciseView"));
  checks["no_km_baseline_mixed_in"] = validateNoKmBaselineMixedIn(combined);
  checks["deterministic_regeneration"] = validateDeterminism(exerciseView, exerciseViewRerun);
  checks["full_item_coverage"] = validateFullItemCoverage(exerciseView, { allItemIds: [...itemsById.keys()] });
  checks["stable_item_ids_match_bsm"] = validateStableItemIdsMatchBsm(exerciseView, bsmNodesById);
  checks["answer_form_matches_unit_kind"] = validateAnswerFormMatchesUnitKind(exerciseView, bsmNodesById);
  checks["withheld_answer_content_consistency"] = validateWithheldAnswerContentConsistency(exerciseView, bsmNodesById);
  checks["multiblank_subquestions"] = validateMultiBlankSubQuestions(exerciseView);
  checks["body_segments"] = validateBodySegments(exerciseView);
  checks["no_diff_other_layers"] = []; // Step Gで判定
  checks["no_diff_bsm_full"] = []; // Step Gで判定
  checks["no_regression_phase2"] = []; // Step Gで判定
  checks["no_diff_phase3_prior_artifacts"] = []; // Step Gで判定

  console.log("=== Step G: 既存レイヤー・BSM Full出力・Phase2/Phase3事前成果物への影響がないことの確認 ===");
  const afterOtherLayers = snapshotHashes(WATCHED_OTHER_LAYERS);
  const afterBsmFull = snapshotHashes(WATCHED_BSM_FULL);
  const afterPhase2 = snapshotHashes(WATCHED_PHASE2);
  const afterPhase3Prior = snapshotHashes(WATCHED_PHASE3_PRIOR_ARTIFACTS);
  const changedOtherLayers = diffSnapshots(beforeOtherLayers, afterOtherLayers);
  const changedBsmFull = diffSnapshots(beforeBsmFull, afterBsmFull);
  const changedPhase2 = diffSnapshots(beforePhase2, afterPhase2);
  const changedPhase3Prior = diffSnapshots(beforePhase3Prior, afterPhase3Prior);
  checks["no_diff_other_layers"] = changedOtherLayers.map((p) => ({ check: "other-layer-changed", path: p }));
  checks["no_diff_bsm_full"] = changedBsmFull.map((p) => ({ check: "bsm-full-changed", path: p }));
  checks["no_regression_phase2"] = changedPhase2.map((p) => ({ check: "phase2-changed", path: p }));
  checks["no_diff_phase3_prior_artifacts"] = changedPhase3Prior.map((p) => ({ check: "phase3-prior-artifact-changed", path: p }));

  const byCheckCounts = {};
  for (const [name, issues] of Object.entries(checks)) byCheckCounts[name] = issues.length;

  const exerciseTypeCounts = {};
  for (const ex of exerciseView.exercises) exerciseTypeCounts[ex.exerciseType] = (exerciseTypeCounts[ex.exerciseType] ?? 0) + 1;
  const withheldTypeCounts = {};
  for (const ex of exerciseView.withheldExercises) withheldTypeCounts[ex.exerciseType] = (withheldTypeCounts[ex.exerciseType] ?? 0) + 1;
  const withheldEligibilityCounts = { review_required: 0, ineligible: 0 };
  for (const ex of exerciseView.withheldExercises) withheldEligibilityCounts[ex.eligibility] += 1;
  const withheldReasonCategoryCounts = {};
  for (const ex of exerciseView.withheldExercises) {
    for (const reason of ex.ineligibilityReasons) {
      const category = reason.split(":")[0];
      withheldReasonCategoryCounts[category] = (withheldReasonCategoryCounts[category] ?? 0) + 1;
    }
  }

  // v2-1(answerFormデータ契約、docs/v2_1_data_contract_investigation.md §11実装後検証項目1-3)。
  const allForCounts = [...exerciseView.exercises, ...exerciseView.withheldExercises];
  const answerFormValueCounts = {};
  let answerFormMissingCount = 0;
  for (const ex of allForCounts) {
    if (ex.answerForm == null) {
      answerFormMissingCount += 1;
    } else {
      answerFormValueCounts[ex.answerForm] = (answerFormValueCounts[ex.answerForm] ?? 0) + 1;
    }
  }
  const answerFormMismatchCount = checks["answer_form_matches_unit_kind"]?.length ?? 0;

  // v2-4準備(withheldAnswerContent、docs/v2_4_prep_investigation.md §11実装後検証項目)。
  let withheldAnswerContentPopulatedCount = 0;
  let withheldAnswerContentNullCount = 0;
  exerciseView.withheldExercises.forEach((ex) => {
    if (ex.withheldAnswerContent != null) withheldAnswerContentPopulatedCount += 1;
    else withheldAnswerContentNullCount += 1;
  });
  const withheldAnswerContentMismatchCount = checks["withheld_answer_content_consistency"]?.length ?? 0;

  const summary = {
    generatedAt: exerciseView.meta.generatedAt,
    inputCheckBlockCount: targets.length,
    inputItemCount: itemsById.size,
    exerciseTypeCounts,
    withheldTypeCounts,
    exercisesTotal: exerciseView.exercises.length,
    withheldExercisesTotal: exerciseView.withheldExercises.length,
    withheldEligibilityCounts,
    withheldReasonCategoryCounts,
    generationFailureCount: generationFailures.length,
    emptyQuestionSkippedCount: emptyQuestionsSkipped.length,
    missingItemIdCount,
    answerFormValueCounts,
    answerFormMissingCount,
    answerFormMismatchWithUnitKindCount: answerFormMismatchCount,
    withheldAnswerContentPopulatedCount,
    withheldAnswerContentNullCount,
    withheldAnswerContentMismatchCount,
    checkIssueCounts: byCheckCounts,
    totalIssueCount: Object.values(byCheckCounts).reduce((a, b) => a + b, 0),
    otherLayersUnchanged: changedOtherLayers.length === 0,
    bsmFullUnchanged: changedBsmFull.length === 0,
    phase2Unchanged: changedPhase2.length === 0,
    phase3PriorArtifactsUnchanged: changedPhase3Prior.length === 0,
  };
  console.log(JSON.stringify(summary, null, 2));

  const outDir = path.join(ROOT, "output");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "exercise_view_full.json"), JSON.stringify(exerciseView, null, 2), "utf8");
  writeFileSync(
    path.join(outDir, "exercise_view_full_validation.json"),
    JSON.stringify({ summary, checks, generationFailures, emptyQuestionsSkipped, missingItemIdExamples }, null, 2),
    "utf8"
  );
  console.log("wrote: output/exercise_view_full.json");
  console.log("wrote: output/exercise_view_full_validation.json");
}

main();
