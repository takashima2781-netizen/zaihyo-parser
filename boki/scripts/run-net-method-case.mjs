#!/usr/bin/env node
// CLIエントリポイント(Phase C・テーマ7-2 総記法): 仕入時・売上時・決算時の
// 仕訳3件を確定Source+Knowledge候補として生成する。
//
// このページには算定式(「売上高－（期首商品＋当期仕入高－期末商品）＝
// 商品販売益」)も存在するが、仕訳とは検出器・トークナイザーの系統が異なる
// ため、別スクリプト(`run-net-method-formula-case.mjs`)として分離した。
//
// 使い方: node scripts/run-net-method-case.mjs

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runJournalTopicCase } from "../src/parser/runJournalTopicCase.mjs";
import { deriveJournalPatternKnowledgeCandidate } from "../src/knowledge/deriveJournalPatternKnowledgeCandidate.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const outputDir = path.join(rootDir, "output", "cases");

const KNOWLEDGE_CONFIG = {
  "net-method-purchase-journal": {
    knowledgeId: "dk-journal-net-method-purchase",
    scopeNote: "本書テーマ7-2(総記法)の仕入時の仕訳でのみ確認",
  },
  "net-method-sale-journal": {
    knowledgeId: "dk-journal-net-method-sale",
    scopeNote: "本書テーマ7-2(総記法)の売上時の仕訳でのみ確認",
  },
  "net-method-settlement-journal": {
    knowledgeId: "dk-journal-net-method-settlement",
    scopeNote: "本書テーマ7-2(総記法)の決算時の仕訳でのみ確認",
  },
};

try {
  const { cases } = await runJournalTopicCase({
    pdfPath,
    outputDir,
    themePage: 112,
    topicHeadingPage: 123,
    topicPages: [{ page: 123, printedPageLabel: "94" }],
    expectedTopicNumber: "7-2",
    outOfScopeReason: "本ケースの対象には含めなかった",
    candidateDefinitions: [
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "商品" && (c.precedingHeading ?? "").includes("仕入時"),
        caseName: "net-method-purchase-journal",
        blockId: "block-net-method-purchase",
        sequenceOnPage: 1,
      },
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "売掛金",
        caseName: "net-method-sale-journal",
        blockId: "block-net-method-sale",
        sequenceOnPage: 2,
      },
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "商品" && (c.precedingHeading ?? "").includes("決算時"),
        caseName: "net-method-settlement-journal",
        blockId: "block-net-method-settlement",
        sequenceOnPage: 3,
      },
    ],
  });

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
