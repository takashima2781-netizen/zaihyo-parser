// CSV Bridge 本番実行CLI。Knowledge Master + Intermediate JSON → 既存互換CSV（財表DB③形式）。
// src/exporter/（既存Exporter）には一切依存しない（src/csvBridge/buildRows.mjs参照）。
// Parser・Knowledge Masterのconverter/validator/schema・HTMLアプリは変更しない。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { buildRows, CSV3_COLUMNS } from "../csvBridge/buildRows.mjs";
import { toCsvText } from "../csvBridge/csvWriter.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

function main() {
  const corpus = JSON.parse(readFileSync(path.join(ROOT, "output/intermediate_full_scan.json"), "utf8"));
  const km = JSON.parse(readFileSync(path.join(ROOT, "output/knowledge_master_full_scan.json"), "utf8"));
  const groups = corpus.books[0].groups;

  console.log("=== CSV Bridge: Knowledge Master + Intermediate JSON → 財表DB③形式CSV ===");
  const { rows, fallbackItemIds } = buildRows({ groups, km });
  const csvText = toCsvText(CSV3_COLUMNS, rows.map((r) => r.row));

  const summary = {
    totalRows: rows.length,
    kmResolvedCount: rows.length - fallbackItemIds.length,
    kmFallbackCount: fallbackItemIds.length,
    kmCoverageRate: (rows.length - fallbackItemIds.length) / rows.length,
  };
  console.log(JSON.stringify(summary, null, 2));

  const outDir = path.join(ROOT, "output");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "csv_bridge_財表DB③形式.csv"), csvText, "utf8");
  writeFileSync(
    path.join(outDir, "csv_bridge_summary.json"),
    JSON.stringify({ ...summary, fallbackItemIds }, null, 2),
    "utf8"
  );
  console.log("wrote: output/csv_bridge_財表DB③形式.csv");
  console.log("wrote: output/csv_bridge_summary.json");
}

main();
