#!/usr/bin/env node
// CLIエントリポイント(第3ケース): テーマ8-11(無形固定資産)の会計処理から
// 仕訳パターン2件(支出時/決算時)を確定Sourceとして生成し(M1相当)、
// 続けてそれぞれからDerived Knowledge候補を生成する(M2相当)。
//
// 使い方: node scripts/run-intangible-journal-case.mjs
//         (先に node scripts/run-teigakuho-case.mjs でtheme-8を確定させて
//          おくこと)

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runIntangibleJournalCase } from "../src/parser/runIntangibleJournalCase.mjs";
import { deriveJournalPatternKnowledgeCandidate } from "../src/knowledge/deriveJournalPatternKnowledgeCandidate.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const definitionCasePath = path.join(rootDir, "output", "cases", "teigakuho-definition.json");
const outputDir = path.join(rootDir, "output", "cases");

const KNOWLEDGE_CONFIG = {
  "intangible-journal-acquisition": {
    knowledgeId: "dk-journal-intangible-acquisition",
    scopeNote:
      "本書テーマ8-11(無形固定資産)の支出時の仕訳でのみ確認。特許権・商標権等、" +
      "個別の無形固定資産科目ごとの適用例は本ケースでは未収録",
  },
  "intangible-journal-amortization": {
    knowledgeId: "dk-journal-intangible-amortization",
    scopeNote:
      "本書テーマ8-11(無形固定資産)の決算時(償却)の仕訳でのみ確認。特許権・商標権等、" +
      "個別の無形固定資産科目ごとの適用例は本ケースでは未収録",
  },
};

try {
  const cases = await runIntangibleJournalCase({ pdfPath, definitionCasePath, outputDir });

  for (const caseData of cases) {
    const config = KNOWLEDGE_CONFIG[caseData.case];
    if (!config) {
      throw new Error(`未知のケース名です(fail-closed): ${caseData.case}`);
    }

    const derivedKnowledgeCandidate = deriveJournalPatternKnowledgeCandidate({
      block: caseData.block,
      structureContext: caseData.structureContext,
      knowledgeId: config.knowledgeId,
      scopeNote: config.scopeNote,
    });

    const updated = { ...caseData, derivedKnowledgeCandidate };
    const casePath = path.join(outputDir, `${caseData.case}.json`);
    await writeFile(casePath, JSON.stringify(updated, null, 2), "utf8");

    console.log(`OK: wrote ${casePath}`);
    console.log(`  sourceFaithful: ${updated.block.sourceFaithful}`);
    console.log(`  knowledge.id:   ${derivedKnowledgeCandidate.knowledge.id}`);
    console.log(`  reviewStatus:   ${derivedKnowledgeCandidate.reviewStatus}`);
  }
} catch (err) {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
}
