#!/usr/bin/env node
// CLIエントリポイント: 定額法1ケースをPDFから確定Sourceまで通す。
//
// 使い方: node scripts/run-teigakuho-case.mjs

import path from "node:path";
import { fileURLToPath } from "node:url";

import { runTeigakuhoCase } from "../src/parser/runTeigakuhoCase.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");

const pdfPath = path.join(rootDir, "input", "book1.pdf");
const correctionPath = path.join(
  rootDir,
  "input",
  "corrections",
  "teigakuho-definition.json",
);
const outputPath = path.join(
  rootDir,
  "output",
  "cases",
  "teigakuho-definition.json",
);

try {
  const result = await runTeigakuhoCase({ pdfPath, correctionPath, outputPath });
  console.log(`OK: wrote ${outputPath}`);
  console.log(`sourceFaithful: ${result.block.sourceFaithful}`);
} catch (err) {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
}
