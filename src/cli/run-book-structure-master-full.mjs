// Book Structure Master Phase 2B 実行CLI。
// Intermediate JSON全体（全1,121 Item・322 CheckBlock）を対象に、固定ID指定なしで
// Book Structure Masterを自動生成し、17項目の検証と異常検出を行う。
// Intermediate JSONは読み取り専用の入力として扱う。Parser・Intermediate JSON生成処理・
// Knowledge Master・CSV Bridge・学習用CSV・HTMLアプリのいずれも変更しない。
// Phase 2Aの出力・検証結果（output/book_structure_master_phase2a*.json）も変更しない。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  buildBookStructureMasterPhase2A,
  buildBookStructureMasterFull,
} from "../bookStructureMaster/buildBookStructureMaster.mjs";
import {
  validateSchemaShape,
  validateProvenance,
  validateDuplicateIds,
  validateNoContentDiagMixing,
  validateNoInventedValues,
  validateVerbatimAgainstIntermediateJson,
  validateSharedPromptDeduplication,
  validateCounts,
  validateFullItemCoverage,
  validateTrueFalseFieldSeparation,
  validateKnownUnresolvedItems,
  validatePhase2ARegression,
  validateProvenanceConsistency,
  validateStableItemIdUniqueness,
  validateCollisionBlocksReported,
  validateSharedBodyBlankPositions,
} from "../bookStructureMaster/validator.mjs";
import { detectAnomalies } from "../bookStructureMaster/anomalyDetector.mjs";
import { toAnomaliesCsvText } from "../bookStructureMaster/anomaliesCsvWriter.mjs";
import { PHASE2A_TARGET_CHECKBLOCK_IDS } from "../bookStructureMaster/selectors.mjs";

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

function itemIdsByCheckBlockId(groups) {
  const map = new Map();
  function walk(g) {
    for (const cb of g.checkBlocks) {
      const ids = [];
      for (const q of cb.questions) for (const it of q.items) ids.push(it.id);
      map.set(cb.id, ids);
    }
    for (const c of g.children) walk(c);
  }
  for (const g of groups) walk(g);
  return map;
}

// 既存の他レイヤー（Parser/KM/CSV Bridge/学習用CSV/HTMLアプリ）に変更がないことを確認するための、
// 対象ファイル群のsha256ハッシュのスナップショットを取る（読み取り専用の確認、書き込みは行わない）。
const WATCHED_PATHS = [
  "src/parser",
  "src/knowledgeMaster",
  "src/csvBridge",
  "src/exporter",
  "reference/current_app",
  "output/csv_bridge_○×用.csv",
  "output/csv_bridge_4択用.csv",
  "output/README.md",
  "output/book_structure_master_phase2a.json",
  "output/book_structure_master_phase2a_validation.json",
  "docs/book_structure_master_phase2a_report.md",
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
  const corpusPath = path.join(ROOT, "output/intermediate_full_scan.json");
  const corpusRaw = readFileSync(corpusPath, "utf8");
  const corpus = JSON.parse(corpusRaw);

  const beforeHashes = snapshotHashes(WATCHED_PATHS);

  console.log("=== Step A: 全CheckBlockを対象にBook Structure Masterを生成（2回実行し決定論性を確認） ===");
  const { bsm, allCheckBlockIds, allItemIds, coveredItemIds, builderErrors, stableItemIdCollisionBlocks } =
    buildBookStructureMasterFull(corpus);
  const rerun = buildBookStructureMasterFull(corpus);
  const stableIdGenerationDeterministic = JSON.stringify(bsm) === JSON.stringify(rerun.bsm);
  console.log("対象CheckBlock数:", allCheckBlockIds.length);
  console.log("対象Item数:", allItemIds.length);
  console.log("builderErrors:", builderErrors.length);
  console.log("stableItemId衝突ブロック数(要人手確認):", stableItemIdCollisionBlocks.length);
  console.log("2回連続生成の決定論性(sha256/構造完全一致):", stableIdGenerationDeterministic);

  console.log("=== Step B: Phase 2A出力を再取得（リグレッション比較用、既存ファイルは読み取りのみ） ===");
  const phase2aResult = buildBookStructureMasterPhase2A(corpus, { targetCheckBlockIds: PHASE2A_TARGET_CHECKBLOCK_IDS });
  const existingPhase2aRaw = readFileSync(path.join(ROOT, "output/book_structure_master_phase2a.json"), "utf8");
  const existingPhase2aBsm = JSON.parse(existingPhase2aRaw);

  console.log("=== Step C: 検証（17項目） ===");
  const allItems = collectAllItems(corpus.books[0].groups);
  const itemsById = new Map(allItemIds.map((id) => [id, allItems.get(id)]));
  const cbIdToItemIds = itemIdsByCheckBlockId(corpus.books[0].groups);

  const checks = {};
  checks["01_schema_shape"] = validateSchemaShape(bsm);
  // 1121→1112: Parserのマーカー誤検出補正(Group A、9件、docs/phase2c_pdf_visual_verification.md参照)により、
  // 箱囲みのない見出しラベルを誤って空欄としてカウントしていたItem 9件が正しく除外されたことによる期待値更新。
  // 1112→1164: 教材データ品質調査(2026-07-27、共通指示文実装の表示確認中に発見)で、本文中の
  // 列挙記号（例:「２ 動態論の特徴 …。」）がtopicHeadingと誤分類され、項目見出し4件が本文を
  // 丸ごと吸収する一方、本来の設問本文・52 Itemが失われていたことが判明した。classify.mjsの
  // topicHeading判定に長さ・句点の条件を追加して修正し、失われていた52 Itemが正しく復元された
  // ことによる期待値更新（docs/book_structure_master_phase1_review.md等と同じ位置づけの調査記録）。
  checks["02_count_correspondence"] = validateCounts(bsm, { expectedItemCount: 1164, expectedCheckBlockCount: 322 });
  checks["03_verbatim_match"] = validateVerbatimAgainstIntermediateJson(bsm, itemsById);
  checks["04_missing_text"] = checks["03_verbatim_match"]; // 逐語一致チェックが原文欠落検出を兼ねる
  checks["05_provenance_gap"] = validateProvenance(bsm);
  checks["06_duplicate_id"] = validateDuplicateIds(bsm);
  checks["07_shared_prompt_dedup"] = validateSharedPromptDeduplication(bsm);
  checks["08_shared_prompt_mismatch_detectable"] = []; // anomalyDetectorのshared_prompt_mismatchで別途集計（0件想定）
  checks["09_no_content_diag_mixing"] = validateNoContentDiagMixing(bsm);
  checks["10_no_invented_values"] = validateNoInventedValues(bsm);
  const unresolvedResult = validateKnownUnresolvedItems(bsm, { itemsById });
  checks["11_known_unresolved_29"] = unresolvedResult.issues;
  checks["12_truefalse_field_separation"] = validateTrueFalseFieldSeparation(bsm, { itemsById });
  checks["13_phase2a_regression"] = validatePhase2ARegression(bsm, existingPhase2aBsm);
  checks["14_intermediate_json_unchanged"] = []; // Step Eで判定し反映
  checks["15_no_diff_other_layers"] = []; // Step Eで判定し反映
  checks["16_full_item_coverage"] = validateFullItemCoverage(bsm, {
    allItemIds,
    builderErrorCheckBlockIds: builderErrors.map((e) => e.checkBlockId),
    itemIdsByCheckBlockId: cbIdToItemIds,
  });
  checks["17_builder_error_count"] = builderErrors.map((e) => ({ check: "builder-error", ...e }));
  // Item ID正式化(F2)向けの追加検証
  checks["18_provenance_consistency"] = validateProvenanceConsistency(bsm);
  checks["19_stable_item_id_uniqueness"] = validateStableItemIdUniqueness(bsm);
  checks["20_collision_blocks_reported"] = validateCollisionBlocksReported(bsm, stableItemIdCollisionBlocks);
  checks["21_stable_id_generation_deterministic"] = stableIdGenerationDeterministic
    ? []
    : [{ check: "stable-id-generation-nondeterministic" }];
  // shared_body_blanks空欄位置スキーマ(docs/phase2c_blank_position_schema_design.md)
  checks["22_shared_body_blank_positions"] = validateSharedBodyBlankPositions(bsm);

  console.log("=== Step D: 異常検出 ===");
  const validationIssuesForAnomalies = [
    ...checks["01_schema_shape"],
    ...checks["05_provenance_gap"],
    ...checks["06_duplicate_id"],
    ...checks["07_shared_prompt_dedup"],
    ...checks["09_no_content_diag_mixing"],
    ...checks["10_no_invented_values"],
    ...checks["03_verbatim_match"],
  ];
  const anomalies = detectAnomalies(bsm, { itemsById, builderErrors, validationIssues: validationIssuesForAnomalies });
  const anomaliesByCategory = {};
  for (const a of anomalies) anomaliesByCategory[a.category] = (anomaliesByCategory[a.category] ?? 0) + 1;
  console.log("anomalies件数:", anomalies.length, anomaliesByCategory);

  console.log("=== Step E: 既存ファイルへの影響がないことの確認 ===");
  const corpusRawAfter = readFileSync(corpusPath, "utf8");
  const intermediateJsonUnchanged = corpusRawAfter === corpusRaw;
  const afterHashes = snapshotHashes(WATCHED_PATHS);
  const changedPaths = diffSnapshots(beforeHashes, afterHashes);
  checks["14_intermediate_json_unchanged"] = intermediateJsonUnchanged ? [] : [{ check: "intermediate-json-changed" }];
  checks["15_no_diff_other_layers"] = changedPaths.map((p) => ({ check: "other-layer-changed", path: p }));

  const byCheckCounts = {};
  for (const [name, issues] of Object.entries(checks)) byCheckCounts[name] = issues.length;

  const summary = {
    generatedAt: new Date().toISOString(),
    allCheckBlockCount: allCheckBlockIds.length,
    allItemCount: allItemIds.length,
    coveredItemCount: coveredItemIds.length,
    builderErrorCount: builderErrors.length,
    checkIssueCounts: byCheckCounts,
    totalIssueCount: Object.values(byCheckCounts).reduce((a, b) => a + b, 0),
    anomalyCount: anomalies.length,
    anomaliesByCategory,
    intermediateJsonUnchanged,
    otherLayersUnchanged: changedPaths.length === 0,
    changedPaths,
    stableItemIdCollisionBlockCount: stableItemIdCollisionBlocks.length,
    stableIdGenerationDeterministic,
  };
  console.log(JSON.stringify(summary, null, 2));

  const outDir = path.join(ROOT, "output");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "book_structure_master_full.json"), JSON.stringify(bsm, null, 2), "utf8");
  writeFileSync(
    path.join(outDir, "book_structure_master_full_validation.json"),
    JSON.stringify({ summary, checks }, null, 2),
    "utf8"
  );
  writeFileSync(path.join(outDir, "book_structure_master_full_anomalies.csv"), toAnomaliesCsvText(anomalies), "utf8");
  writeFileSync(
    path.join(outDir, "book_structure_master_full_stable_id_collisions.json"),
    JSON.stringify(
      {
        note:
          "同一(documentId,page,block,marker)が複数Itemに割り当たったグループ一覧(要人手確認)。" +
          "docs/item_id_formalization_design_memo.md §1・§4参照。occurrenceOrdinalにより機械的に一意化済みだが、" +
          "列挙記号の再利用が正しいか、Parserの誤判定かは人手で確認することを推奨する。",
        collisionBlockCount: stableItemIdCollisionBlocks.length,
        collisionBlocks: stableItemIdCollisionBlocks,
      },
      null,
      2
    ),
    "utf8"
  );
  console.log("wrote: output/book_structure_master_full.json");
  console.log("wrote: output/book_structure_master_full_validation.json");
  console.log("wrote: output/book_structure_master_full_anomalies.csv");
  console.log("wrote: output/book_structure_master_full_stable_id_collisions.json");

  // 最終確認: 書き込み後も既存ファイルに変更がないこと（新規出力ファイルの追加のみであること）を再確認する
  const corpusRawFinal = readFileSync(corpusPath, "utf8");
  if (corpusRawFinal !== corpusRawAfter) {
    console.error("警告: output書き込み後にintermediate_full_scan.jsonが変化しています");
  }
}

main();
