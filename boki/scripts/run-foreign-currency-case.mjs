#!/usr/bin/env node
// CLIエントリポイント: テーマ11(外貨建取引等)、論点11-1の換算方法の定義式
// から確定Sourceを1件生成し、output/cases/foreign-currency-definition.json
// へ書き出す。
//
// 使い方: node scripts/run-foreign-currency-case.mjs

import path from "node:path";
import { fileURLToPath } from "node:url";

import { runForeignCurrencyCase } from "../src/parser/runForeignCurrencyCase.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const outputPath = path.join(rootDir, "output", "cases", "foreign-currency-definition.json");

try {
  const caseOutput = await runForeignCurrencyCase({ pdfPath, outputPath });
  console.log(`OK: wrote ${outputPath}`);
  console.log(`block.id:        ${caseOutput.block.id}`);
  console.log(`sourceFaithful:  ${caseOutput.block.sourceFaithful}`);
} catch (err) {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
}
