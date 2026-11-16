#!/usr/bin/env node
// CLIエントリポイント(Phase C・テーマ7-8 棚卸資産の期末評価): 棚卸減耗費・
// 商品評価損の仕訳2件を確定Source+Knowledge候補として生成する。
//
// 商品評価損の仕訳は、教材上「(1) 物理的な劣化などに基づく収益性の低下」
// 「(2) 市場の需給変化などに基づく収益性の低下」の2箇所に、完全に同一の型
// (借方・貸方とも同一勘定科目)として出現する。別のKnowledgeとしては
// 追加せず、1件のみを採用する(CLAUDE.md原則3、`run-allowance-case.mjs`の
// 洗替法と同じ判断)。
//
// 使い方: node scripts/run-inventory-valuation-case.mjs

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runJournalTopicCase } from "../src/parser/runJournalTopicCase.mjs";
import { deriveJournalPatternKnowledgeCandidate } from "../src/knowledge/deriveJournalPatternKnowledgeCandidate.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const outputDir = path.join(rootDir, "output", "cases");

const KNOWLEDGE_CONFIG = {
  "inventory-shrinkage-journal": {
    knowledgeId: "dk-journal-inventory-shrinkage",
    scopeNote: "本書テーマ7-8(棚卸資産の期末評価)の棚卸減耗費の仕訳でのみ確認",
  },
  "inventory-writedown-journal": {
    knowledgeId: "dk-journal-inventory-writedown",
    scopeNote:
      "本書テーマ7-8(棚卸資産の期末評価)の商品評価損の仕訳でのみ確認。教材上、物理的な劣化に" +
      "基づく場合・市場の需給変化に基づく場合の2箇所に完全に同一の型で出現するため、1件のみ採用した",
  },
};

try {
  const { cases, outOfScopeDetections } = await runJournalTopicCase({
    pdfPath,
    outputDir,
    themePage: 112,
    topicHeadingPage: 143,
    topicPages: [{ page: 143, printedPageLabel: "114" }],
    expectedTopicNumber: "7-8",
    outOfScopeReason:
      "既に採用した仕訳型(商品評価損の1件目)と完全に同一の型で重複出現したため対象外とした(原則3)",
    candidateDefinitions: [
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "棚卸減耗費",
        caseName: "inventory-shrinkage-journal",
        blockId: "block-inventory-shrinkage",
        sequenceOnPage: 1,
      },
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "商品評価損",
        caseName: "inventory-writedown-journal",
        blockId: "block-inventory-writedown",
        sequenceOnPage: 2,
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
