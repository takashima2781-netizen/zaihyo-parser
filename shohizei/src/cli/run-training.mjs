// トレーニング1冊分（問題・解答・シート）を抽出して教材構造を作り、output/ に書き出す。
//
// 使い方: node src/cli/run-training.mjs <bookId>
//   input/pdf/<bookId>-problem.pdf, <bookId>-answer.pdf, （あれば）<bookId>-sheet.pdf を読む。
//   例: node src/cli/run-training.mjs training-basic-1
// 教材PDFと出力は git 対象外（shohizei/.gitignore）。

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractDocument } from "../extract/extract.mjs";
import { buildTraining } from "../training/buildTraining.mjs";
import { runGateChecks } from "../gateChecks/gateChecks.mjs";
import { summarizeTraining } from "../training/summary.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const bookId = process.argv[2];
if (!bookId) {
  console.error("使い方: node src/cli/run-training.mjs <bookId>（例: training-basic-1）");
  process.exit(2);
}
const pdf = (role) => path.join(root, "input", "pdf", `${bookId}-${role}.pdf`);

for (const role of ["problem", "answer"]) {
  if (!existsSync(pdf(role))) {
    console.error(`見つかりません: ${pdf(role)}`);
    process.exit(1);
  }
}

const problemDoc = await extractDocument(pdf("problem"), "all", `${bookId}-problem`);
const answerDoc = await extractDocument(pdf("answer"), "all", `${bookId}-answer`);
let sheetDoc = null;
if (existsSync(pdf("sheet"))) {
  sheetDoc = await extractDocument(pdf("sheet"), "all", `${bookId}-sheet`);
  sheetDoc.textAvailable = sheetDoc.pages.some((p) => p.lines.some((l) => l.spans.some((s) => s.text.trim())));
}

const structure = buildTraining({ bookId, problemDoc, answerDoc, sheetDoc });
const gate = runGateChecks(structure);
const summary = summarizeTraining(structure);

const outDir = path.join(root, "output");
mkdirSync(outDir, { recursive: true });
if (!gate.ok) {
  console.error("検査に失敗したため書き出しません:");
  for (const v of gate.violations) console.error(" -", v);
  process.exit(1);
}
writeFileSync(path.join(outDir, `${bookId}.structure.json`), JSON.stringify(structure, null, 2));
writeFileSync(path.join(outDir, `${bookId}.summary.json`), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
