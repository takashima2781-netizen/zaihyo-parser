// 「実使用／Learning用」CSVを生成するCLI。既存HTMLアプリの「〇×」「4択」ボタンにそれぞれ直接
// インポートできる、分割済みの2ファイルを出力する。
//
// 備考列は「実使用／Learning用」ロジック（src/csvBridge/buildRowsLearning.mjs）を使う。
// CSV Bridge v1.0の互換モード（src/csvBridge/buildRows.mjs）は一切変更していない
// （互換モードの統合CSVは output/csv_bridge_財表DB③形式.csv として、別途 run-csv-bridge-export.mjs
// が生成したものをそのまま維持する。両者は明確に別ファイル・別ロジックである）。
//
// フィルタ条件（どの行が○×用／4択用になるか）は reference/current_app/index.html の processCSV
// 関数（変更しない）が実際に使っている条件をそのまま複製している。これにより、分割済みCSVを
// それぞれのボタンでインポートした結果が、統合CSVを2回に分けてインポートした場合と一致することを保証する。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { buildLearningRows, CSV3_COLUMNS } from "../csvBridge/buildRowsLearning.mjs";
import { toCsvText } from "../csvBridge/csvWriter.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// reference/current_app/index.html の processCSV 内の判定条件と同一（該当箇所は変更していない）。
function isOxAnswer(ans) {
  return ans.includes("○") || ans.includes("×") || ans.includes("〇");
}
function isFourChoiceAnswer(ans) {
  return ans.length > 0 && ans !== "○" && ans !== "×" && ans !== "〇";
}

function main() {
  const corpus = JSON.parse(readFileSync(path.join(ROOT, "output/intermediate_full_scan.json"), "utf8"));
  const km = JSON.parse(readFileSync(path.join(ROOT, "output/knowledge_master_full_scan.json"), "utf8"));
  const groups = corpus.books[0].groups;

  const { rows } = buildLearningRows({ groups, km });

  const oxRows = [];
  const fourChoiceRows = [];
  const excludedRows = [];
  for (const r of rows) {
    const ans = (r.row["解答"] || "").trim();
    const inOx = isOxAnswer(ans);
    const inFourChoice = isFourChoiceAnswer(ans);
    if (inOx) oxRows.push(r.row);
    if (inFourChoice) fourChoiceRows.push(r.row);
    if (!inOx && !inFourChoice) excludedRows.push(r.itemId);
  }

  // 検証用集計: ○×の教材解説有無、学習用CSV内のParser内部注記混入チェック（0件を期待）
  const oxWithExplanation = oxRows.filter((r) => r["備考"] && r["備考"].length > 0).length;
  const oxWithoutExplanation = oxRows.length - oxWithExplanation;
  const knownInternalNoteMarkers = ["no-marker fallback", "候補2フォールバック", "positional-pairing", "fallback"];
  const suspiciousNoteRows = [...oxRows, ...fourChoiceRows].filter(
    (r) => r["備考"] && knownInternalNoteMarkers.some((marker) => r["備考"].includes(marker))
  ).length;
  const fourChoiceNonEmptyNotes = fourChoiceRows.filter((r) => r["備考"] && r["備考"].length > 0).length;

  const summary = {
    totalRows: rows.length,
    oxCount: oxRows.length,
    fourChoiceCount: fourChoiceRows.length,
    excludedCount: excludedRows.length,
    excludedItemIds: excludedRows,
    oxWithExplanation,
    oxWithoutExplanation,
    fourChoiceNonEmptyNotesCount: fourChoiceNonEmptyNotes, // 期待値: 0
    suspiciousInternalNoteRowsInLearningCsv: suspiciousNoteRows, // 期待値: 0
  };
  console.log(JSON.stringify(summary, null, 2));

  const outDir = path.join(ROOT, "output");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "csv_bridge_○×用.csv"), toCsvText(CSV3_COLUMNS, oxRows), "utf8");
  writeFileSync(path.join(outDir, "csv_bridge_4択用.csv"), toCsvText(CSV3_COLUMNS, fourChoiceRows), "utf8");
  writeFileSync(path.join(outDir, "csv_bridge_split_summary.json"), JSON.stringify(summary, null, 2), "utf8");
  console.log("wrote: output/csv_bridge_○×用.csv");
  console.log("wrote: output/csv_bridge_4択用.csv");
  console.log("wrote: output/csv_bridge_split_summary.json");
}

main();
