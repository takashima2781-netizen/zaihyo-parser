// Knowledge Master v0.6（全328ページ）から既存の財表DB③形式CSVを生成できるかを検証するCLI。
// 既存Exporter（src/exporter/）の出力を比較の正とし、新Exporter（src/knowledgeMasterExporter/）の
// 出力と列単位・行単位で突き合わせる。
// Parser・既存Exporter・HTMLアプリ・Knowledge Masterのconverter/validator/schemaは一切変更しない。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { CSV3_COLUMNS } from "../exporter/csvSchema.mjs";
import { toCsvText } from "../exporter/csvWriter.mjs";
import { buildComparisonRows } from "../knowledgeMasterExporter/convert.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// 既存Exporter（src/exporter/toRows.mjs）は、Item.subLabelRawがnull（本文からマーカーを検出できず
// Parserが単一Itemとして暫定保持したケース。57件）の場合に例外で停止する既知の制約を持つ
// （p8-9の小規模プロトタイプでしか実行されたことがなく、全件実行は今回が初めてだったため未発見だった）。
// 既存Exporter自体の修正は別タスクとして扱い、本比較では該当57件を比較対象から事前に除外する。
function excludeNullSubLabelItems(groups) {
  const excludedItemIds = [];
  function filterGroup(g) {
    return {
      ...g,
      checkBlocks: g.checkBlocks.map((cb) => ({
        ...cb,
        questions: cb.questions.map((q) => ({
          ...q,
          items: q.items.filter((it) => {
            if (it.subLabelRaw === null) {
              excludedItemIds.push(it.id);
              return false;
            }
            return true;
          }),
        })),
      })),
      children: g.children.map(filterGroup),
    };
  }
  const filtered = groups.map(filterGroup);
  return { filtered, excludedItemIds };
}

function diffAgainstBaseline(baselineRows, variantRows) {
  const perColumn = {};
  for (const col of CSV3_COLUMNS) perColumn[col] = { match: 0, mismatch: 0 };
  const mismatchByItemId = [];

  for (let i = 0; i < baselineRows.length; i++) {
    const baseline = baselineRows[i];
    const variant = variantRows[i].row;
    const mismatchedColumns = [];
    for (const col of CSV3_COLUMNS) {
      if (String(baseline[col] ?? "") === String(variant[col] ?? "")) {
        perColumn[col].match++;
      } else {
        perColumn[col].mismatch++;
        mismatchedColumns.push(col);
      }
    }
    if (mismatchedColumns.length > 0) {
      mismatchByItemId.push({ itemId: variantRows[i].itemId, mismatchedColumns });
    }
  }

  const totalCells = baselineRows.length * CSV3_COLUMNS.length;
  const totalMatch = Object.values(perColumn).reduce((s, c) => s + c.match, 0);

  return {
    totalRows: baselineRows.length,
    totalCells,
    totalMatch,
    overallMatchRate: totalMatch / totalCells,
    perColumnMatchRate: Object.fromEntries(CSV3_COLUMNS.map((col) => [col, perColumn[col].match / baselineRows.length])),
    mismatchCount: mismatchByItemId.length,
    mismatchSamples: mismatchByItemId.slice(0, 30),
  };
}

function main() {
  const corpus = JSON.parse(readFileSync(path.join(ROOT, "output/intermediate_full_scan.json"), "utf8"));
  const km = JSON.parse(readFileSync(path.join(ROOT, "output/knowledge_master_full_scan.json"), "utf8"));
  const groups = corpus.books[0].groups;

  console.log("=== Step A-0: 既存Exporterの既知制約（subLabelRaw===null、57件）を比較対象から除外 ===");
  const { filtered: filteredGroups, excludedItemIds } = excludeNullSubLabelItems(groups);
  console.log(`除外Item数: ${excludedItemIds.length}`);

  console.log("=== Step A: 既存Exporter出力（比較の正）＋ 新Exporter出力（KM経由）を生成 ===");
  const { rowsA, rowsB, fallbackItemIds, baselineRows } = buildComparisonRows({ groups: filteredGroups, km });

  const baselineCsv = toCsvText(CSV3_COLUMNS, baselineRows);
  const csvA = toCsvText(CSV3_COLUMNS, rowsA.map((r) => r.row));
  const csvB = toCsvText(CSV3_COLUMNS, rowsB.map((r) => r.row));

  console.log("=== Step B: 差分計算 ===");
  const diffA = diffAgainstBaseline(baselineRows, rowsA);
  const diffB = diffAgainstBaseline(baselineRows, rowsB);

  const notesAvsB = [];
  for (let i = 0; i < rowsA.length; i++) {
    const a = rowsA[i].row["備考"];
    const b = rowsB[i].row["備考"];
    if (a !== b) notesAvsB.push({ itemId: rowsA[i].itemId, compat: a, sourceText: b });
  }

  const kmResolvedCount = rowsA.length - fallbackItemIds.length;

  const report = {
    excludedFromComparison: {
      count: excludedItemIds.length,
      reason:
        "既存Exporter（src/exporter/toRows.mjs）がItem.subLabelRaw===null（本文からマーカーを検出できず" +
        "Parserが単一Itemとして暫定保持したケース）で例外停止する既知の制約があるため、比較対象から事前に除外した。" +
        "既存Exporter自体の修正は別タスクとして扱い、本比較の対象外とした。",
      itemIds: excludedItemIds,
    },
    totals: {
      totalItems: baselineRows.length,
      kmResolvedCount,
      kmFallbackCount: fallbackItemIds.length,
      kmCoverageRate: kmResolvedCount / baselineRows.length,
    },
    fallbackItemIds,
    variantA_compat: {
      description: "備考=Intermediate JSONのparsed.notes（Parserの解析時内部注記。既存Exporterと同じ挙動）",
      ...diffA,
    },
    variantB_sourceText: {
      description:
        "備考=Knowledge MasterのEvidence(kind:\"explanation\")（教材原文の解説。既存Exporterとは意味が異なる）",
      ...diffB,
    },
    notesCompatVsSourceTextDiff: {
      count: notesAvsB.length,
      note:
        "parsed.notesはParserの解析時内部注記（例: フォールバック適用の記録）であり、" +
        "Evidence(explanation)は教材原文の解説（Item.raw.explanation由来）である。両者は意味が異なるため、" +
        "この差分は不具合ではなく意図的な差である。",
      samples: notesAvsB.slice(0, 30),
    },
  };

  console.log(
    JSON.stringify(
      {
        excludedFromComparison: { count: report.excludedFromComparison.count },
        totals: report.totals,
        variantA_compat: { ...report.variantA_compat, mismatchSamples: `${diffA.mismatchCount}件（詳細はJSON参照）` },
        variantB_sourceText: { ...report.variantB_sourceText, mismatchSamples: `${diffB.mismatchCount}件（詳細はJSON参照）` },
        notesCompatVsSourceTextDiff: { count: report.notesCompatVsSourceTextDiff.count, note: report.notesCompatVsSourceTextDiff.note },
      },
      null,
      2
    )
  );

  const outDir = path.join(ROOT, "output");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "generated_財表DB③形式_full_scan.csv"), baselineCsv, "utf8");
  writeFileSync(path.join(outDir, "knowledge_master_generated_財表DB③形式_A_compat.csv"), csvA, "utf8");
  writeFileSync(path.join(outDir, "knowledge_master_generated_財表DB③形式_B_sourcetext.csv"), csvB, "utf8");
  writeFileSync(path.join(outDir, "knowledge_master_csv_export_diff.json"), JSON.stringify(report, null, 2), "utf8");
  console.log("wrote: output/generated_財表DB③形式_full_scan.csv");
  console.log("wrote: output/knowledge_master_generated_財表DB③形式_A_compat.csv");
  console.log("wrote: output/knowledge_master_generated_財表DB③形式_B_sourcetext.csv");
  console.log("wrote: output/knowledge_master_csv_export_diff.json");
}

main();
