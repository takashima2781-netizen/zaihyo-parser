// 「豊かな確認用CSV」（knowledge_master_full.csv）を生成するCLI。
// Knowledge Master v0.6 ＋ Intermediate JSON を itemId で結合する。既存HTMLアプリへは読み込ませない、
// 人間による内容確認専用のCSV。
// Parser・Knowledge Master・CSV Bridge・HTMLアプリのいずれも変更しない（読み取り専用）。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { buildFullCsvRows, FULL_CSV_COLUMNS } from "../confirmCsv/buildFullCsvRows.mjs";
import { toCsvText } from "../confirmCsv/csvWriter.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const INTERNAL_NOTE_MARKERS = ["no-marker fallback", "候補2フォールバック", "positional-pairing", "fallback"];

function main() {
  const corpus = JSON.parse(readFileSync(path.join(ROOT, "output/intermediate_full_scan.json"), "utf8"));
  const km = JSON.parse(readFileSync(path.join(ROOT, "output/knowledge_master_full_scan.json"), "utf8"));
  const groups = corpus.books[0].groups;

  const rows = buildFullCsvRows({ groups, km });

  // --- 検証 ---
  const totalRows = rows.length;
  const itemIds = rows.map((r) => r.key_item_id);
  const itemIdSet = new Set(itemIds);
  const duplicateItemIdCount = itemIds.length - itemIdSet.size;
  const emptyItemIdCount = itemIds.filter((id) => !id).length;

  const resolvedRows = rows.filter((r) => r.diag_km_resolved === "true");
  const unresolvedRows = rows.filter((r) => r.diag_km_resolved === "false");
  const unresolvedWithoutReason = unresolvedRows.filter((r) => !r.diag_unresolved_reason);

  // 教材由来情報とdiag_列の混在チェック: content_*にParser内部注記の文言が紛れ込んでいないか
  const contentColumns = ["content_question", "content_answer", "content_explanation"];
  const contaminatedRows = rows.filter((r) =>
    contentColumns.some((col) => INTERNAL_NOTE_MARKERS.some((marker) => (r[col] || "").includes(marker)))
  );

  // KMとIJの結合不能チェック: 解決済み行のprovenance evidence idがkm.evidence/answerUnitsに実在するか
  const evidenceIdSet = new Set(km.evidence.map((e) => e.id));
  let danglingEvidenceRefs = 0;
  for (const r of resolvedRows) {
    const ids = [
      ...(r.provenance_question_evidence_id ? r.provenance_question_evidence_id.split(" ｜ ") : []),
      ...(r.provenance_answer_evidence_id ? r.provenance_answer_evidence_id.split(" ｜ ") : []),
    ];
    for (const id of ids) {
      if (!evidenceIdSet.has(id)) danglingEvidenceRefs++;
    }
  }

  // 説明不能な差分チェック: KM側unresolved件数と本CSVのunresolved行数が一致するか
  const kmUnresolvedCount = km.meta.unresolved.length;
  const unexplainedDiff = unresolvedRows.length - kmUnresolvedCount;

  const validation = {
    totalRows,
    expectedTotalRows: 1121,
    duplicateItemIdCount,
    emptyItemIdCount,
    resolvedCount: resolvedRows.length,
    expectedResolvedCount: 1092,
    unresolvedCount: unresolvedRows.length,
    expectedUnresolvedCount: 29,
    unresolvedWithoutReasonCount: unresolvedWithoutReason.length,
    contentDiagContaminationCount: contaminatedRows.length,
    danglingEvidenceRefs,
    unexplainedResolutionCountDiff: unexplainedDiff,
    sourceFilesModified: false,
  };
  console.log("=== 検証結果 ===");
  console.log(JSON.stringify(validation, null, 2));

  const outDir = path.join(ROOT, "output");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "knowledge_master_full.csv"), toCsvText(FULL_CSV_COLUMNS, rows), "utf8");
  writeFileSync(
    path.join(outDir, "knowledge_master_full_validation.json"),
    JSON.stringify({ validation, columns: FULL_CSV_COLUMNS }, null, 2),
    "utf8"
  );
  console.log("wrote: output/knowledge_master_full.csv");
  console.log("wrote: output/knowledge_master_full_validation.json");
}

main();
