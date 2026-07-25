// 財表ドリル用CSV 正式生成CLI（Phase 3B-4、実運用切替後の正式経路）。
//
// 正式経路: BSM → Exercise View → KM互換Adapter → 既存CSV Bridge → 財表ドリル用CSV
// このCLIは、既存の検証用CLI（run-exercise-view-full.mjs／run-km-compat-adapter.mjs／
// run-phase3b3-verification.mjs）が個別に実装してきた生成ロジックを1コマンドにまとめた
// 薄い統合処理である。生成ロジック自体（Exercise View・KM互換Adapter・CSV Bridge）は
// 一切変更していない。既存の検証用CLIも削除しない（役割の違いはdocs/exercise_view_phase3b4_cutover_report.md
// および output/README.md に明記する）。
//
// 変換対象: exercises のうち single_blank・true_false のみをKM互換Adapterへ渡す。
// multi_blank は将来対応として Exercise View 本体には保持するが、CSVへは出力しない
// （KM互換Adapterの既存方針どおり。BSM/KM/CSV Bridge/HTMLは変更しない）。
// withheldExercises（review_required・ineligible）は通常出題経路へ流さず、
// 人手確認対象として別ファイル（withheld一覧）へ出力する。
//
// 安全確認: CSVを書き出す前に重大な検証違反（ID重複・Item ID取得不可・KM必須フィールド欠損・
// Adapter変換失敗・withheld混入・決定的生成不成立・CSV列欠損・reviewOverride整合性不一致）が
// 無いことを確認し、1件でもあれば正式CSVを書き出さずに失敗として終了する（fail-closed）。
// ただし、multi_blank・review_required・ineligible・空Questionは仕様上の意図した除外であり、
// エラーとして扱わない。
//
// F4(docs/exercise_view_f4_review_reflection_report.md、レビュー結果の反映機構):
// output/review_decisions.json（F3の決定ログ）に安全確認済みの"approved"判断がある場合、
// 該当Itemをwithheldではなく通常のeligible Exerciseとして生成し、正式CSVへ含める。
// 決定ログが空/存在しない場合は完全に従来どおりの出力になる。
//
// output/exercise_view_full.json（override反映済み・正式成果物）への書き込み経路は本CLIのみに
// 限定されている（docs/exercise_view_full_output_separation_report.md）。生成ロジック単体の
// 診断用出力（override無し）は run-exercise-view-full.mjs が別ファイル
// output/exercise_view_full_no_override.json へ出力する。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { detectAnomalies } from "../bookStructureMaster/anomalyDetector.mjs";
import { buildExerciseViewV1, EXERCISE_VIEW_GENERATOR_VERSION_V1 } from "../exerciseView/buildExerciseView.mjs";
import { findAllCheckSections } from "../exerciseView/selectors.mjs";
import { indexAnomaliesByUnitId } from "../exerciseView/eligibility.mjs";
import { buildKmCompatFromExerciseView } from "../exerciseView/kmCompatAdapter.mjs";
import { validateReviewOverrideConsistency } from "../exerciseView/validator.mjs";
import { validateKnowledgeMaster } from "../knowledgeMaster/validate.mjs";
import { buildLearningRows, CSV3_COLUMNS } from "../csvBridge/buildRowsLearning.mjs";
import { toCsvText } from "../csvBridge/csvWriter.mjs";
import { resolveApplicableOverrides } from "../review/resolveOverrides.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const EXERCISE_VIEW_SPEC_VERSION = "exercise-view-schema-v1.0.0";
const ADAPTER_BUILT_BY = "exercise-view-km-compat-adapter-phase3b2-1.0.0";
const OFFICIAL_CLI_VERSION = "build-drill-csv-phase3b4-1.0.0";

// reference/current_app/index.html の processCSV 内の判定条件と同一（変更しない。既存CLI群の複製）。
function isOxAnswer(ans) {
  return ans.includes("○") || ans.includes("×") || ans.includes("〇");
}
function isFourChoiceAnswer(ans) {
  return ans.length > 0 && ans !== "○" && ans !== "×" && ans !== "〇";
}

function collectAllItems(groups) {
  const items = new Map();
  function walk(g) {
    for (const cb of g.checkBlocks) for (const q of cb.questions) for (const it of q.items) items.set(it.id, it);
    for (const c of g.children) walk(c);
  }
  for (const g of groups) walk(g);
  return items;
}

function hashFile(absPath) {
  return createHash("sha256").update(readFileSync(absPath)).digest("hex");
}
function sha256OfObject(obj) {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

function stripTimestamps(exerciseView) {
  const clone = JSON.parse(JSON.stringify(exerciseView));
  delete clone.meta.generatedAt;
  for (const ex of [...clone.exercises, ...clone.withheldExercises]) delete ex.provenance.generatedAt;
  return clone;
}

function escapeCsvField(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toSimpleCsv(columns, rows) {
  const lines = [columns.map(escapeCsvField).join(",")];
  for (const row of rows) lines.push(columns.map((c) => escapeCsvField(row[c])).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

// ============================================================
// パイプライン1回分: BSM → Exercise View → KM互換Adapter
// ============================================================
function runPipelineOnce({ bsm, itemsById, adapterParams, approvedOverrides }) {
  const anomalies = detectAnomalies(bsm, { itemsById, builderErrors: [], validationIssues: [] });
  const anomaliesByUnitId = indexAnomaliesByUnitId(anomalies);
  const targets = findAllCheckSections(bsm);
  const { exerciseView } = buildExerciseViewV1(bsm, {
    targets,
    anomaliesByUnitId,
    generatedAt: new Date().toISOString(),
    sourceBsmFile: "output/book_structure_master_full.json",
    approvedOverrides,
  });
  const { km: kmCompat, unsupportedByAdapter, conversionFailures } = buildKmCompatFromExerciseView(exerciseView, adapterParams);
  return { exerciseView, kmCompat, unsupportedByAdapter, conversionFailures, targets };
}

// stableItemId(F2、docs/item_id_formalization_design_memo.md)を、除外一覧・レビューキューへ
// 追加する。将来のレビュー記録は現行item-NNN(sourceItemIds)ではなくこちらを主キーとして使うことを推奨する。
function buildExcludedItemsRegistry(exerciseView) {
  const rows = [];
  for (const ex of exerciseView.exercises) {
    if (ex.exerciseType === "multi_blank") {
      rows.push({
        exerciseId: ex.exerciseId,
        exerciseType: ex.exerciseType,
        eligibility: ex.eligibility,
        excludedFrom: "drill_csv_multi_blank_future_work",
        checkSectionId: ex.sourceBookStructureIds[0] ?? "",
        checkBlockId: (ex.sourceBookStructureIds[0] ?? "").replace(/^cs-/, ""),
        majorUnitId: ex.sourceBookStructureIds[1] ?? "",
        sourceItemIds: ex.sourceItemIds.join(";"),
        stableItemIds: ex.stableItemIds.join(";"),
        reason: "multi_blankは将来対応として保持。現時点ではKM互換Adapter・CSVへは出力しない",
      });
    }
  }
  for (const ex of exerciseView.withheldExercises) {
    rows.push({
      exerciseId: ex.exerciseId,
      exerciseType: ex.exerciseType,
      eligibility: ex.eligibility,
      excludedFrom: "drill_csv_withheld_manual_review_required",
      checkSectionId: ex.sourceBookStructureIds[0] ?? "",
      checkBlockId: (ex.sourceBookStructureIds[0] ?? "").replace(/^cs-/, ""),
      majorUnitId: ex.sourceBookStructureIds[1] ?? "",
      sourceItemIds: ex.sourceItemIds.join(";"),
      stableItemIds: ex.stableItemIds.join(";"),
      reason: ex.ineligibilityReasons.join(" | "),
    });
  }
  return rows;
}

function buildWithheldReviewQueue(exerciseView) {
  return exerciseView.withheldExercises.map((ex) => ({
    exerciseId: ex.exerciseId,
    exerciseType: ex.exerciseType,
    eligibility: ex.eligibility,
    checkBlockId: (ex.sourceBookStructureIds[0] ?? "").replace(/^cs-/, ""),
    sourceItemIds: ex.sourceItemIds.join(";"),
    stableItemIds: ex.stableItemIds.join(";"),
    promptOrBody: (ex.prompt?.text ?? ex.body?.text ?? "").slice(0, 200),
    reasons: ex.ineligibilityReasons.join(" | "),
  }));
}

function main() {
  const log = [];
  const record = (msg) => {
    console.log(msg);
    log.push(`[${new Date().toISOString()}] ${msg}`);
  };

  record("=== Step 1: BSM/Intermediate JSON 読込(読み取り専用) ===");
  const bsmPath = path.join(ROOT, "output/book_structure_master_full.json");
  const corpusPath = path.join(ROOT, "output/intermediate_full_scan.json");
  const bsm = JSON.parse(readFileSync(bsmPath, "utf8"));
  const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
  const groups = corpus.books[0].groups;
  const itemsById = collectAllItems(groups);
  record("=== Step 1b: F4レビュー結果反映機構(docs/exercise_view_f4_review_reflection_report.md) ===");
  // output/review_decisions.jsonが存在しない場合は空の決定ログとして扱う(F3実装前・レビュー未実施と同じ挙動)。
  // SKIP_REVIEW_OVERRIDES=1指定時は、ファイルの内容に関わらずoverride無し版を強制する(即時ロールバック手段)。
  const decisionsPath = path.join(ROOT, "output/review_decisions.json");
  const skipReviewOverrides = process.env.SKIP_REVIEW_OVERRIDES === "1";
  const reviewDecisionsFileSha256 = !skipReviewOverrides && existsSync(decisionsPath) ? hashFile(decisionsPath) : null;
  const decisionsLog = skipReviewOverrides
    ? { schemaVersion: "review-decisions-v1.0.0", decisions: [] }
    : existsSync(decisionsPath)
      ? JSON.parse(readFileSync(decisionsPath, "utf8"))
      : { schemaVersion: "review-decisions-v1.0.0", decisions: [] };
  const overridesResult = resolveApplicableOverrides(bsm, decisionsLog, {
    currentGeneratorVersion: EXERCISE_VIEW_GENERATOR_VERSION_V1,
    currentBsmSchemaVersion: bsm.meta.schemaVersion,
  });
  record(
    `override解決結果: 適用可能=${overridesResult.applicable.size}件、blocked=${overridesResult.blocked.length}件、` +
      `形状不正=${overridesResult.invalidRecords.length}件、skipReviewOverrides=${skipReviewOverrides}`
  );

  const inputIdentification = {
    bsmFile: "output/book_structure_master_full.json",
    bsmFileSha256: hashFile(bsmPath),
    intermediateJsonFile: "output/intermediate_full_scan.json",
    intermediateJsonSha256: hashFile(corpusPath),
    inputItemCount: itemsById.size,
    reviewDecisionsFile: reviewDecisionsFileSha256 ? "output/review_decisions.json" : null,
    reviewDecisionsFileSha256,
  };

  const adapterParams = {
    bookId: corpus.books[0].id,
    bookTitle: corpus.books[0].title,
    schemaVersion: corpus.meta.schemaVersion,
    builtBy: ADAPTER_BUILT_BY,
  };

  record("=== Step 2: Exercise View生成 → KM互換Adapter変換(2回実行し決定論性を確認) ===");
  const run1 = runPipelineOnce({ bsm, itemsById, adapterParams, approvedOverrides: overridesResult.applicable });
  const run2 = runPipelineOnce({ bsm, itemsById, adapterParams, approvedOverrides: overridesResult.applicable });
  const evHashMatch = sha256OfObject(stripTimestamps(run1.exerciseView)) === sha256OfObject(stripTimestamps(run2.exerciseView));
  const kmHashMatch = sha256OfObject(run1.kmCompat) === sha256OfObject(run2.kmCompat);
  const deterministic = evHashMatch && kmHashMatch;

  const { exerciseView, kmCompat, unsupportedByAdapter, conversionFailures } = run1;

  record("=== Step 3: 既存CSV Bridge(無変更)で財表ドリル用CSVの行を生成 ===");
  const { rows: learningRows } = buildLearningRows({ groups, km: kmCompat });
  const oxRows = [];
  const fourChoiceRows = [];
  for (const r of learningRows) {
    const ans = (r.row["解答"] || "").trim();
    if (isOxAnswer(ans)) oxRows.push(r.row);
    if (isFourChoiceAnswer(ans)) fourChoiceRows.push(r.row);
  }
  const oxCsvText = toCsvText(CSV3_COLUMNS, oxRows);
  const fourChoiceCsvText = toCsvText(CSV3_COLUMNS, fourChoiceRows);

  record("=== Step 4: 書き出し前の安全確認(重大な検証違反が無いこと) ===");

  // 4-1. Exercise ID重複
  const seenIds = new Set();
  let duplicateExerciseIdCount = 0;
  for (const ex of [...exerciseView.exercises, ...exerciseView.withheldExercises]) {
    if (seenIds.has(ex.exerciseId)) duplicateExerciseIdCount++;
    seenIds.add(ex.exerciseId);
  }

  // 4-2. Item ID取得不可(変換対象のsingle_blank/true_falseのみ対象。空Question(isEmptyQuestionSubtree)は
  //      Exercise View生成時点で既にexercises/withheldExercisesのどちらにも含まれないため、ここでの対象外扱いは
  //      Exercise View側の設計により自動的に満たされている。念のためexercises/withheldExercises側でも確認する)
  let missingItemIdCount = 0;
  for (const ex of [...exerciseView.exercises, ...exerciseView.withheldExercises]) {
    if (ex.exerciseType === "single_blank" || ex.exerciseType === "true_false") {
      if (ex.sourceItemIds.length !== 1 || !ex.sourceItemIds[0]) missingItemIdCount++;
    }
  }

  // 4-3. KM必須フィールド欠損(常時出力される件数サマリ3種は実質違反ではないため除外)
  const kmValidationIssues = validateKnowledgeMaster(corpus.books[0], kmCompat);
  const INFORMATIONAL_KM_CHECKS = new Set(["question-count-matches-presentation-count", "answerunit-count-matches-parsed-answers-count", "item-coverage"]);
  const kmRealViolations = kmValidationIssues.filter((i) => !INFORMATIONAL_KM_CHECKS.has(i.check));

  // 4-4. Adapter変換失敗
  const adapterConversionFailureCount = conversionFailures.length;

  // 4-5. withheldの通常出題経路への混入
  const withheldItemIds = new Set(exerciseView.withheldExercises.flatMap((ex) => ex.sourceItemIds));
  let withheldLeakCount = 0;
  for (const r of learningRows) {
    if (withheldItemIds.has(r.itemId) && r.kmResolved) withheldLeakCount++;
  }

  // 4-6. 決定的生成(Step 2で確認済み)
  // 4-7. CSV必須列欠損
  const oxHeaderOk = oxCsvText.slice(1).split("\r\n")[0].split(",").length === CSV3_COLUMNS.length;
  const fcHeaderOk = fourChoiceCsvText.slice(1).split("\r\n")[0].split(",").length === CSV3_COLUMNS.length;
  const csvColumnsOk = oxHeaderOk && fcHeaderOk;

  // 4-8. F4: reviewOverride整合性(未承認のoverrideが誤って適用されていないか、
  //      承認されたはずのoverrideが取りこぼされていないかの独立した再確認。fail-closed)
  const reviewOverrideConsistencyIssues = validateReviewOverrideConsistency(exerciseView, overridesResult.applicable);

  const gateChecks = {
    duplicateExerciseIdCount,
    missingItemIdCount,
    kmRealViolationCount: kmRealViolations.length,
    adapterConversionFailureCount,
    withheldLeakCount,
    deterministic,
    csvColumnsOk,
    reviewOverrideConsistencyIssueCount: reviewOverrideConsistencyIssues.length,
  };
  const gatePassed =
    duplicateExerciseIdCount === 0 &&
    missingItemIdCount === 0 &&
    kmRealViolations.length === 0 &&
    adapterConversionFailureCount === 0 &&
    withheldLeakCount === 0 &&
    deterministic &&
    csvColumnsOk &&
    reviewOverrideConsistencyIssues.length === 0;

  record(`安全確認結果: ${JSON.stringify(gateChecks)}`);
  record(`gatePassed=${gatePassed}`);

  const exerciseTypeCounts = {};
  for (const ex of exerciseView.exercises) exerciseTypeCounts[ex.exerciseType] = (exerciseTypeCounts[ex.exerciseType] ?? 0) + 1;
  const withheldEligibilityCounts = { review_required: 0, ineligible: 0 };
  for (const ex of exerciseView.withheldExercises) withheldEligibilityCounts[ex.eligibility] += 1;
  const withheldReasonCategoryCounts = {};
  for (const ex of exerciseView.withheldExercises) {
    for (const reason of ex.ineligibilityReasons) {
      const category = reason.split(":")[0];
      withheldReasonCategoryCounts[category] = (withheldReasonCategoryCounts[category] ?? 0) + 1;
    }
  }

  const anyExercise = exerciseView.exercises[0] ?? exerciseView.withheldExercises[0];
  const versionInfo = {
    exerciseViewSpecVersion: EXERCISE_VIEW_SPEC_VERSION,
    exerciseViewGeneratorVersion: anyExercise?.provenance?.generatorVersion ?? null,
    exerciseViewGenerationRules: exerciseView.meta.generationRules,
    adapterBuiltBy: ADAPTER_BUILT_BY,
    officialCliVersion: OFFICIAL_CLI_VERSION,
    inputIdentification,
  };

  const outputCounts = {
    exercisesTotal: exerciseView.exercises.length,
    exerciseTypeCounts,
    withheldExercisesTotal: exerciseView.withheldExercises.length,
    withheldEligibilityCounts,
    withheldReasonCategoryCounts,
    multiBlankExcludedFromCsvCount: unsupportedByAdapter.multiBlankExcluded.length,
    oxRowCount: oxRows.length,
    fourChoiceRowCount: fourChoiceRows.length,
    csvTotalRowCount: oxRows.length + fourChoiceRows.length,
    reviewOverrideAppliedCount: overridesResult.applicable.size,
  };

  const outDir = path.join(ROOT, "output");
  mkdirSync(outDir, { recursive: true });

  // Exercise View本体・除外一覧・withheldレビューキューは、安全確認の結果によらず常に出力する
  // （診断・監査目的のため。CSVの書き出しのみゲートの対象とする）。
  writeFileSync(path.join(outDir, "exercise_view_full.json"), JSON.stringify(exerciseView, null, 2), "utf8");
  writeFileSync(
    path.join(outDir, "drill_csv_excluded_items.csv"),
    toSimpleCsv(
      ["exerciseId", "exerciseType", "eligibility", "excludedFrom", "checkSectionId", "checkBlockId", "majorUnitId", "sourceItemIds", "stableItemIds", "reason"],
      buildExcludedItemsRegistry(exerciseView)
    ),
    "utf8"
  );
  writeFileSync(
    path.join(outDir, "drill_csv_withheld_review_queue.csv"),
    toSimpleCsv(
      ["exerciseId", "exerciseType", "eligibility", "checkBlockId", "sourceItemIds", "stableItemIds", "promptOrBody", "reasons"],
      buildWithheldReviewQueue(exerciseView)
    ),
    "utf8"
  );
  // F4: 反映前・反映後を追跡できる監査情報(docs/exercise_view_f4_review_reflection_report.md §9)。
  const appliedList = [...exerciseView.exercises, ...exerciseView.withheldExercises]
    .filter((ex) => ex.reviewOverride !== null)
    .map((ex) => ({
      stableItemId: ex.reviewOverride.stableItemId,
      exerciseId: ex.exerciseId,
      decisionReviewedAt: ex.reviewOverride.decisionReviewedAt,
      decisionReviewedBy: ex.reviewOverride.decisionReviewedBy,
    }));
  const reflectionAudit = {
    generatedAt: new Date().toISOString(),
    reviewDecisionsFile: inputIdentification.reviewDecisionsFile,
    reviewDecisionsFileSha256: inputIdentification.reviewDecisionsFileSha256,
    skipReviewOverrides,
    appliedCount: appliedList.length,
    applied: appliedList,
    blockedCount: overridesResult.blocked.length,
    blocked: overridesResult.blocked,
    invalidRecordCount: overridesResult.invalidRecords.length,
    invalidRecords: overridesResult.invalidRecords,
    statusCounts: overridesResult.statusCounts,
    reviewOverrideConsistencyIssueCount: reviewOverrideConsistencyIssues.length,
    reviewOverrideConsistencyIssues,
  };
  writeFileSync(path.join(outDir, "drill_csv_review_reflection_audit.json"), JSON.stringify(reflectionAudit, null, 2), "utf8");
  record("wrote: output/drill_csv_review_reflection_audit.json");

  record("wrote: output/exercise_view_full.json");
  record("wrote: output/drill_csv_excluded_items.csv");
  record("wrote: output/drill_csv_withheld_review_queue.csv");

  let officialCsvWritten = false;
  if (gatePassed) {
    writeFileSync(path.join(outDir, "drill_csv_○×用.csv"), oxCsvText, "utf8");
    writeFileSync(path.join(outDir, "drill_csv_4択用.csv"), fourChoiceCsvText, "utf8");
    officialCsvWritten = true;
    record("wrote: output/drill_csv_○×用.csv (正式)");
    record("wrote: output/drill_csv_4択用.csv (正式)");
  } else {
    record("重大な検証違反があるため、正式CSV(drill_csv_○×用.csv / drill_csv_4択用.csv)は書き出していません。");
  }

  const validationOutput = {
    status: gatePassed ? "success" : "failed",
    generatedAt: new Date().toISOString(),
    versionInfo,
    outputCounts,
    gateChecks,
    officialCsvWritten,
    kmValidationIssues,
  };
  writeFileSync(path.join(outDir, "drill_csv_validation.json"), JSON.stringify(validationOutput, null, 2), "utf8");
  writeFileSync(path.join(outDir, "drill_csv_generation.log"), log.join("\n") + "\n", "utf8");
  record("wrote: output/drill_csv_validation.json");
  record("wrote: output/drill_csv_generation.log");

  console.log(JSON.stringify({ status: validationOutput.status, outputCounts, gateChecks }, null, 2));
  if (!gatePassed) process.exitCode = 1;
}

main();
