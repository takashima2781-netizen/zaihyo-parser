// Exercise View Phase 3A 実行CLI。
// Book Structure Master (BSM) の代表4 CheckBlock（checkblock-01/04/90/208）を対象に、
// multi_blank / single_blank / true_false のExercise Viewを試作生成し、17項目を検証、
// 既存Knowledge Masterとの比較CSVを出力する。
// 入力（BSM・Intermediate JSON・Knowledge Master JSON）はすべて読み取り専用として扱う。
// Parser・Intermediate JSON生成処理・BSM・Knowledge Master・CSV Bridge・実使用CSV・
// HTMLアプリのいずれも変更しない。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { detectAnomalies } from "../bookStructureMaster/anomalyDetector.mjs";
import { buildExerciseViewPhase3A } from "../exerciseView/buildExerciseView.mjs";
import { findTargetCheckSections, collectMajorQuestionUnits, collectLeafDescendants } from "../exerciseView/selectors.mjs";
import { getSourceItemIds } from "../exerciseView/sourceRef.mjs";
import { indexAnomaliesByUnitId } from "../exerciseView/eligibility.mjs";
import { buildComparisonRows, toComparisonCsvText } from "../exerciseView/comparisonBuilder.mjs";
import {
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

// 既存の他レイヤーに変更がないことを確認するための、対象ファイル群のsha256スナップショット。
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

function main() {
  const bsmPath = path.join(ROOT, "output/book_structure_master_full.json");
  const corpusPath = path.join(ROOT, "output/intermediate_full_scan.json");
  const kmPath = path.join(ROOT, "output/knowledge_master_full_scan.json");

  const beforeOtherLayers = snapshotHashes(WATCHED_OTHER_LAYERS);
  const beforeBsmFull = snapshotHashes(WATCHED_BSM_FULL);
  const beforePhase2 = snapshotHashes(WATCHED_PHASE2);

  console.log("=== Step A: 入力の読み込み(読み取り専用) ===");
  const bsm = JSON.parse(readFileSync(bsmPath, "utf8"));
  const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
  const km = JSON.parse(readFileSync(kmPath, "utf8"));
  const itemsById = collectAllItems(corpus.books[0].groups);

  console.log("=== Step B: BSM異常検出(既存anomalyDetector.mjsをそのまま呼ぶ、新規判定ロジックなし) ===");
  const anomalies = detectAnomalies(bsm, { itemsById, builderErrors: [], validationIssues: [] });
  const anomaliesByUnitId = indexAnomaliesByUnitId(anomalies);

  console.log("=== Step C: Exercise View生成(対象4 CheckBlock) ===");
  const sourceBsmFile = "output/book_structure_master_full.json";
  const exerciseView = buildExerciseViewPhase3A(bsm, {
    anomaliesByUnitId,
    generatedAt: new Date().toISOString(),
    sourceBsmFile,
  });
  // 検証17(決定論性)用に、時刻以外は同一入力から再生成する
  const exerciseViewRerun = buildExerciseViewPhase3A(bsm, {
    anomaliesByUnitId,
    generatedAt: new Date(Date.now() + 1000).toISOString(),
    sourceBsmFile,
  });

  console.log("=== Step D: 対象Itemのcheckblock対応表を作る(comparison用) ===");
  const itemToCheckBlockId = new Map();
  for (const { checkBlockId, checkSection } of findTargetCheckSections(bsm)) {
    for (const majorUnit of collectMajorQuestionUnits(checkSection)) {
      for (const leaf of collectLeafDescendants(majorUnit)) {
        for (const itemId of getSourceItemIds(leaf)) itemToCheckBlockId.set(itemId, checkBlockId);
      }
    }
  }

  console.log("=== Step E: 検証(17項目) ===");
  const bsmNodesById = buildBsmIndex(bsm);
  const checks = {};
  checks["01_schema_shape"] = validateSchemaShape(exerciseView);
  checks["02_has_source_bsm_ids"] = validateHasSourceBookStructureIds(exerciseView);
  checks["03_source_bsm_ids_exist"] = validateSourceBsmIdsExist(exerciseView, bsmNodesById);
  checks["04_verbatim_match"] = validateVerbatimMatch(exerciseView, bsmNodesById);
  checks["05_answer_provenance"] = validateAnswerProvenance(exerciseView);
  checks["06_shared_prompt_no_redundant_duplication"] = validateSharedPromptNoRedundantDuplication(exerciseView);
  checks["07_multi_single_same_subtree"] = validateMultiAndSingleBlankSameSubtree(exerciseView);
  checks["08_truefalse_fields_not_mixed"] = validateTrueFalseFieldsNotMixed(exerciseView);
  checks["09_ineligible_not_exposed_as_eligible"] = validateIneligibleNotExposedAsEligible(exerciseView, anomaliesByUnitId);
  checks["10_review_required_exposed"] = validateReviewRequiredExposed(exerciseView, anomaliesByUnitId);
  checks["11_no_guessed_values"] = validateNoGuessedValues(exerciseView, bsmNodesById);
  checks["12_no_diff_other_layers"] = []; // Step Fで判定
  checks["13_no_diff_bsm_full"] = []; // Step Fで判定
  checks["14_no_regression_phase2"] = []; // Step Fで判定
  checks["15_source_item_id_access_isolated"] = validateSourceItemIdAccessIsolated(path.join(ROOT, "src/exerciseView"));
  checks["16_no_km_baseline_mixed_in"] = validateNoKmBaselineMixedIn(exerciseView);
  checks["17_deterministic_regeneration"] = validateDeterminism(exerciseView, exerciseViewRerun);

  console.log("=== Step F: 既存レイヤー・BSM Full出力・Phase2A/2Bへの影響がないことの確認 ===");
  const afterOtherLayers = snapshotHashes(WATCHED_OTHER_LAYERS);
  const afterBsmFull = snapshotHashes(WATCHED_BSM_FULL);
  const afterPhase2 = snapshotHashes(WATCHED_PHASE2);
  const changedOtherLayers = diffSnapshots(beforeOtherLayers, afterOtherLayers);
  const changedBsmFull = diffSnapshots(beforeBsmFull, afterBsmFull);
  const changedPhase2 = diffSnapshots(beforePhase2, afterPhase2);
  checks["12_no_diff_other_layers"] = changedOtherLayers.map((p) => ({ check: "other-layer-changed", path: p }));
  checks["13_no_diff_bsm_full"] = changedBsmFull.map((p) => ({ check: "bsm-full-changed", path: p }));
  checks["14_no_regression_phase2"] = changedPhase2.map((p) => ({ check: "phase2-changed", path: p }));

  console.log("=== Step G: 既存Knowledge Masterとの比較(比較専用、Exercise View本体には混入しない) ===");
  const comparisonRows = buildComparisonRows(exerciseView, km, { itemToCheckBlockId });
  const diffCategoryCounts = {};
  for (const r of comparisonRows) diffCategoryCounts[r.diffCategory] = (diffCategoryCounts[r.diffCategory] ?? 0) + 1;

  const byCheckCounts = {};
  for (const [name, issues] of Object.entries(checks)) byCheckCounts[name] = issues.length;
  const exerciseTypeCounts = {};
  const eligibilityCounts = {};
  for (const ex of exerciseView.exercises) {
    exerciseTypeCounts[ex.exerciseType] = (exerciseTypeCounts[ex.exerciseType] ?? 0) + 1;
    eligibilityCounts[ex.eligibility] = (eligibilityCounts[ex.eligibility] ?? 0) + 1;
  }

  const summary = {
    generatedAt: exerciseView.meta.generatedAt,
    targetCheckBlockIds: exerciseView.meta.targetCheckBlockIds,
    exerciseCount: exerciseView.exercises.length,
    exerciseTypeCounts,
    eligibilityCounts,
    checkIssueCounts: byCheckCounts,
    totalIssueCount: Object.values(byCheckCounts).reduce((a, b) => a + b, 0),
    comparisonRowCount: comparisonRows.length,
    diffCategoryCounts,
    otherLayersUnchanged: changedOtherLayers.length === 0,
    bsmFullUnchanged: changedBsmFull.length === 0,
    phase2Unchanged: changedPhase2.length === 0,
  };
  console.log(JSON.stringify(summary, null, 2));

  const outDir = path.join(ROOT, "output");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "exercise_view_phase3a.json"), JSON.stringify(exerciseView, null, 2), "utf8");
  writeFileSync(
    path.join(outDir, "exercise_view_phase3a_validation.json"),
    JSON.stringify({ summary, checks }, null, 2),
    "utf8"
  );
  writeFileSync(path.join(outDir, "exercise_view_phase3a_comparison.csv"), toComparisonCsvText(comparisonRows), "utf8");
  console.log("wrote: output/exercise_view_phase3a.json");
  console.log("wrote: output/exercise_view_phase3a_validation.json");
  console.log("wrote: output/exercise_view_phase3a_comparison.csv");
}

main();
