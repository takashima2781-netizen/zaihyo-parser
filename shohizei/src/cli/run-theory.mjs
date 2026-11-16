// 理論マスターの1テーマ分を抽出して教材構造を作り、output/ に書き出す。
//
// 使い方: node src/cli/run-theory.mjs <themeNo>   （input/pdf/theory-master.pdf を読む）
// 教材PDFと出力は git 対象外（shohizei/.gitignore）。

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractDocument } from "../extract/extract.mjs";
import { buildTheory } from "../theory/buildTheory.mjs";
import { summarizeTheory } from "../theory/summary.mjs";
import { runGateChecks } from "../gateChecks/gateChecks.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const themeNo = process.argv[2];
if (!themeNo) {
  console.error("使い方: node src/cli/run-theory.mjs <themeNo>（例: 1）");
  process.exit(2);
}
const bookId = "theory-master";
const pdf = path.join(root, "input", "pdf", `${bookId}.pdf`);
if (!existsSync(pdf)) {
  console.error(`見つかりません: ${pdf}`);
  process.exit(1);
}

const doc = await extractDocument(pdf, "all", bookId);
const structure = buildTheory({ bookId, doc, themeNo });
const gate = runGateChecks(structure);
const summary = summarizeTheory(structure);
if (!gate.ok) {
  console.error("検査に失敗したため書き出しません:");
  for (const v of gate.violations) console.error(" -", v);
  process.exit(1);
}
const outDir = path.join(root, "output");
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, `${bookId}-theme${themeNo}.structure.json`), JSON.stringify(structure, null, 2));
writeFileSync(path.join(outDir, `${bookId}-theme${themeNo}.summary.json`), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
