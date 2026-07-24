// CSV Bridge 回帰検証CLI（テスト専用）。
// src/csvBridge/buildRows.mjs（本番用、既存Exporterに依存しない）の出力を、
// 既存Exporter（src/exporter/、未変更）の出力と突き合わせる。
// 既存ExporterはItem.subLabelRaw===nullの57件で例外停止する既知の制約（Track B、別タスク）があるため、
// 該当57件を比較対象から除外し、残り1,064件で全11列の一致率を確認する。
// このスクリプト自体は検証専用であり、src/csvBridge/（本番コード）は既存Exporterをimportしない。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { toRows } from "../exporter/toRows.mjs"; // 比較専用。csvBridge本体はこれに依存しない
import { buildRows, CSV3_COLUMNS } from "../csvBridge/buildRows.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

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
  return { filtered: groups.map(filterGroup), excludedItemIds };
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
        mismatchedColumns.push({ column: col, baseline: baseline[col], bridge: variant[col] });
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

  console.log("=== Step A: subLabelRaw===null（57件、Track B対象）を比較対象から除外 ===");
  const { filtered, excludedItemIds } = excludeNullSubLabelItems(groups);
  console.log(`除外Item数: ${excludedItemIds.length}`);

  console.log("=== Step B: 既存Exporter出力（比較の正）とCSV Bridge出力を生成 ===");
  const baselineRows = toRows(filtered);
  const { rows: bridgeRows, fallbackItemIds } = buildRows({ groups: filtered, km });

  console.log("=== Step C: 差分計算 ===");
  const diff = diffAgainstBaseline(baselineRows, bridgeRows);

  const report = {
    excludedFromComparison: { count: excludedItemIds.length, itemIds: excludedItemIds },
    comparedItemCount: baselineRows.length,
    kmFallbackCount: fallbackItemIds.length,
    result: diff,
  };

  console.log(
    JSON.stringify(
      {
        excludedFromComparison: { count: report.excludedFromComparison.count },
        comparedItemCount: report.comparedItemCount,
        kmFallbackCount: report.kmFallbackCount,
        overallMatchRate: diff.overallMatchRate,
        perColumnMatchRate: diff.perColumnMatchRate,
        mismatchCount: diff.mismatchCount,
      },
      null,
      2
    )
  );

  const outDir = path.join(ROOT, "output");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "csv_bridge_regression_diff.json"), JSON.stringify(report, null, 2), "utf8");
  console.log("wrote: output/csv_bridge_regression_diff.json");
}

main();
