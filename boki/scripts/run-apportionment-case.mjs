#!/usr/bin/env node
// CLIエントリポイント: テーマ7-10(仕入諸掛)、按分計算(平均法)の定義式から
// 確定Sourceを1件生成し、output/cases/apportionment-average-definition.json
// へ書き出す。
//
// 使い方: node scripts/run-apportionment-case.mjs

import path from "node:path";
import { fileURLToPath } from "node:url";

import { runApportionmentCase } from "../src/parser/runApportionmentCase.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const correctionPath = path.join(rootDir, "input", "corrections", "apportionment-average-definition.json");
const outputPath = path.join(rootDir, "output", "cases", "apportionment-average-definition.json");

try {
  const caseOutput = await runApportionmentCase({ pdfPath, correctionPath, outputPath });
  console.log(`OK: wrote ${outputPath}`);
  console.log(`block.id:        ${caseOutput.block.id}`);
  console.log(`sourceFaithful:  ${caseOutput.block.sourceFaithful}`);
} catch (err) {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
}
