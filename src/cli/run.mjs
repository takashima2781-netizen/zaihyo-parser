// CLIエントリポイント: PDF → 中間JSON → 既存CSV形式 を1見開き分だけ一気通貫で実行する。
// 対象スコープ（質問ページ・解答ページ）は今回固定値だが、parseDocumentはページ範囲を
// 受け取る汎用関数のため、複数見開きへ拡張する場合はfirstPage/lastPageを広げるだけでよい
// （実際にsrc/cli/run-full-scan.mjsが同じparseDocumentを全ページ範囲で呼び出している）。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { parseDocument, toIntermediateCorpus } from "../parser/index.mjs";
import { exportCsv3 } from "../exporter/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const PDF_PATH = path.join(ROOT, "input/pdf/【財表】ポイントチェック.pdf");
const DOC_ID = "src.pdf.pointcheck";
const QUESTION_PAGE = 8;
const ANSWER_PAGE = 9;

function main() {
  const { groups, unresolved } = parseDocument({
    pdfPath: PDF_PATH,
    firstPage: QUESTION_PAGE,
    lastPage: ANSWER_PAGE,
    documentId: DOC_ID,
  });

  const corpus = toIntermediateCorpus({
    groups,
    unresolved,
    pdfPath: "input/pdf/【財表】ポイントチェック.pdf",
    documentId: DOC_ID,
    firstPage: QUESTION_PAGE,
    lastPage: ANSWER_PAGE,
    scopeNote:
      "PDF → 中間JSON → 既存CSV(財表DB③形式) の一気通貫パイプラインをsrc/配下の汎用Parser/Exporterで実行して生成した。" +
      `対象はinput/pdf/【財表】ポイントチェック.pdf の p.${QUESTION_PAGE}-${ANSWER_PAGE}（テーマ1「1-1 財務会計」の1見開き）のみ。` +
      "マスターNo./No.はCSVとの突合を行っていないため、Exporterが割り当てた出力順の仮番号。",
  });

  const { rows, csvText } = exportCsv3(groups);

  const outDir = path.join(ROOT, "output");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "intermediate_p8_9.json"), JSON.stringify(corpus, null, 2), "utf8");
  writeFileSync(path.join(outDir, "generated_財表DB③形式_p8_9.csv"), csvText, "utf8");

  console.log(`unresolved: ${unresolved.length}件`);
  for (const u of unresolved) console.log(`  - [${u.locator}] ${u.reason}`);
  console.log(`rows exported: ${rows.length}`);
  console.log(`wrote: output/intermediate_p8_9.json`);
  console.log(`wrote: output/generated_財表DB③形式_p8_9.csv`);
}

main();
