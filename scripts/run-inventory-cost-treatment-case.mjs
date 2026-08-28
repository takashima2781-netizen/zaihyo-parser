#!/usr/bin/env node
// CLIエントリポイント(Phase C・テーマ7-9 棚卸減耗費及び商品評価損の原価処理):
// 棚卸減耗費・商品評価損を売上原価に含める原価処理の仕訳1件を確定
// Source+Knowledge候補として生成する。
//
// 教材の「＜仕訳の考え方＞」欄にある2つの補足仕訳((1)棚卸減耗及び期末評価
// (借方2科目)・(2)原価処理(貸方2科目))は、いずれも借方または貸方が2科目に
// またがる複合仕訳であり、既存の単一行検出器では正しく扱えないため対象外
// とする(CLAUDE.md原則5)。
//
// 使い方: node scripts/run-inventory-cost-treatment-case.mjs

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runJournalTopicCase } from "../src/parser/runJournalTopicCase.mjs";
import { deriveJournalPatternKnowledgeCandidate } from "../src/knowledge/deriveJournalPatternKnowledgeCandidate.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const outputDir = path.join(rootDir, "output", "cases");

const KNOWLEDGE_CONFIG = {
  "inventory-cost-treatment-journal": {
    knowledgeId: "dk-journal-inventory-cost-treatment",
    scopeNote:
      "本書テーマ7-9(棚卸減耗費及び商品評価損の原価処理)の原価処理の仕訳でのみ確認。" +
      "＜仕訳の考え方＞欄の2つの補足仕訳は複合仕訳のため未収録",
  },
};

try {
  const { cases, outOfScopeDetections } = await runJournalTopicCase({
    pdfPath,
    outputDir,
    themePage: 112,
    topicHeadingPage: 145,
    topicPages: [{ page: 145, printedPageLabel: "116" }],
    expectedTopicNumber: "7-9",
    outOfScopeReason:
      "借方または貸方が2科目以上にまたがる複合仕訳であり、既存の検出器では正しく全科目を" +
      "捉えられないため対象外とした(原則4)",
    candidateDefinitions: [
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "仕入",
        caseName: "inventory-cost-treatment-journal",
        blockId: "block-inventory-cost-treatment",
        sequenceOnPage: 1,
      },
    ],
  });

  if (outOfScopeDetections.length > 0) {
    console.log(`対象外とした候補: ${outOfScopeDetections.length}件`);
  }

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
  }
} catch (err) {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
}
