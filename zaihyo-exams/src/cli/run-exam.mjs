// 答練1回分（問題・答案用紙・解答）を抽出して教材構造を作り、output/ に書き出す。
//
// 使い方: node src/cli/run-exam.mjs <setId>   （例: node src/cli/run-exam.mjs jitsuryoku-1）
//   input/pdf/<setId>-problem.pdf, -sheet.pdf, -answer.pdf を読む。回の一覧は src/sets.mjs。
// 教材PDFと出力は git 対象外（zaihyo-exams/.gitignore）。

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractDocument } from "../extract/extract.mjs";
import { buildExam } from "../exam/buildExam.mjs";
import { summarizeExam } from "../exam/summary.mjs";
import { runStructureChecks } from "../gateChecks/gateChecks.mjs";
import { getSet } from "../sets.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const setId = process.argv[2];
const set = setId ? getSet(setId) : null;
if (!set) {
  console.error("使い方: node src/cli/run-exam.mjs <setId>（src/sets.mjs にある回の id。例: jitsuryoku-1）");
  process.exit(2);
}
const pdf = (role) => path.join(root, "input", "pdf", `${setId}-${role}.pdf`);
for (const role of ["problem", "sheet", "answer"]) {
  if (!existsSync(pdf(role))) {
    console.error(`見つかりません: ${pdf(role)}`);
    process.exit(1);
  }
}

const problemDoc = await extractDocument(pdf("problem"), "all", `${setId}-problem`);
const sheetDoc = await extractDocument(pdf("sheet"), "all", `${setId}-sheet`);
const answerDoc = await extractDocument(pdf("answer"), "all", `${setId}-answer`);

const structure = buildExam({ set, problemDoc, sheetDoc, answerDoc });
const gate = runStructureChecks(structure);
if (!gate.ok) {
  console.error("検査に失敗したため書き出しません:");
  for (const v of gate.violations) console.error(" -", v);
  process.exit(1);
}
const summary = summarizeExam(structure);
const outDir = path.join(root, "output");
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, `${setId}.structure.json`), JSON.stringify(structure, null, 2));
writeFileSync(path.join(outDir, `${setId}.summary.json`), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, questions: undefined }, null, 2));
