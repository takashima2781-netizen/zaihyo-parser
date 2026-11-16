#!/usr/bin/env node
// CLIエントリポイント: 外貨建取引の確定Source(M1の出力)からDerived
// Knowledge候補を1件生成し、同じケースファイルへ追記する。
//
// `deriveKnowledgeCandidate.mjs`の汎用版(`deriveCalculationFormulaKnowledge
// Candidate`、第5ケースで追加)を使う。定額法専用の`deriveTeigakuho
// KnowledgeCandidate`とは別経路(第5ケースで2件目のcalculation_formula
// Knowledgeを生成する必要が生じたため)。
//
// 使い方: node scripts/run-foreign-currency-case.mjs        (先に実行)
//         node scripts/run-foreign-currency-knowledge-candidate.mjs (このファイル)

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { deriveCalculationFormulaKnowledgeCandidate } from "../src/knowledge/deriveKnowledgeCandidate.mjs";
import { tokenizePlainTermFormula } from "../src/knowledge/formulaTokenizer.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const casePath = path.join(rootDir, "output", "cases", "foreign-currency-definition.json");

try {
  const raw = await readFile(casePath, "utf8");
  const data = JSON.parse(raw);

  const derivedKnowledgeCandidate = deriveCalculationFormulaKnowledgeCandidate({
    block: data.block,
    structureContext: data.structureContext,
    knowledgeId: "dk-calc-formula-foreign-currency",
    scopeNote:
      "本書テーマ11(外貨建取引等)論点11-1で確認。円換算額の算定という" +
      "本質は変わらないが、直物レート(取引発生時)・決算時レートいずれの" +
      "適用でも同じ式が使われることを論点11-1/11-2双方の適用例で確認済み",
    tokenize: tokenizePlainTermFormula,
  });
  data.derivedKnowledgeCandidate = derivedKnowledgeCandidate;

  await writeFile(casePath, JSON.stringify(data, null, 2), "utf8");
  console.log(`OK: updated ${casePath} with derivedKnowledgeCandidate`);
  console.log(`reviewStatus: ${derivedKnowledgeCandidate.reviewStatus}`);
  console.log(`rawFormula:   ${derivedKnowledgeCandidate.knowledge.content.rawFormula}`);
} catch (err) {
  console.error("FAILED:", err.message);
  console.error(
    `output/cases/foreign-currency-definition.json が存在するか確認してください` +
      `(先に node scripts/run-foreign-currency-case.mjs を実行する必要があります)。`,
  );
  process.exitCode = 1;
}
