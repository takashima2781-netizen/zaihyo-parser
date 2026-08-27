#!/usr/bin/env node
// CLIエントリポイント: 按分計算(平均法)の確定Source(M1の出力)からDerived
// Knowledge候補を1件生成し、同じケースファイルへ追記する。
//
// `deriveKnowledgeCandidate.mjs`の汎用版(`deriveCalculationFormulaKnowledge
// Candidate`、第5ケースで追加)を使う(第5ケースと同じ経路、コード変更なし)。
//
// 使い方: node scripts/run-apportionment-case.mjs                (先に実行)
//         node scripts/run-apportionment-knowledge-candidate.mjs (このファイル)

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { deriveCalculationFormulaKnowledgeCandidate } from "../src/knowledge/deriveKnowledgeCandidate.mjs";
import { tokenizeAdditionFractionFormula } from "../src/knowledge/formulaTokenizer.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const casePath = path.join(rootDir, "output", "cases", "apportionment-average-definition.json");

try {
  const raw = await readFile(casePath, "utf8");
  const data = JSON.parse(raw);

  const derivedKnowledgeCandidate = deriveCalculationFormulaKnowledgeCandidate({
    block: data.block,
    structureContext: data.structureContext,
    knowledgeId: "dk-calc-formula-apportionment-average",
    scopeNote:
      "本書テーマ7-10(仕入諸掛)の按分計算のうち、平均法でのみ確認。同じ論点にある" +
      "先入先出法の式(当期仕入諸掛×（期末商品／当期仕入高）＝期末仕入諸掛、分母が単一項で" +
      "より単純な形状)は本ケースでは未収録",
    tokenize: tokenizeAdditionFractionFormula,
  });
  data.derivedKnowledgeCandidate = derivedKnowledgeCandidate;

  await writeFile(casePath, JSON.stringify(data, null, 2), "utf8");
  console.log(`OK: updated ${casePath} with derivedKnowledgeCandidate`);
  console.log(`reviewStatus: ${derivedKnowledgeCandidate.reviewStatus}`);
  console.log(`rawFormula:   ${derivedKnowledgeCandidate.knowledge.content.rawFormula}`);
} catch (err) {
  console.error("FAILED:", err.message);
  console.error(
    `output/cases/apportionment-average-definition.json が存在するか確認してください` +
      `(先に node scripts/run-apportionment-case.mjs を実行する必要があります)。`,
  );
  process.exitCode = 1;
}
