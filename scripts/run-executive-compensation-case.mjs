#!/usr/bin/env node
// CLIエントリポイント(Phase C・テーマ6-2 役員報酬・賞与等): 役員報酬支払時・
// 役員賞与(決算時/支払時)・役員退職慰労金(決算時/支払時)の仕訳5件を確定
// Source+Knowledge候補として生成する。
//
// 使い方: node scripts/run-executive-compensation-case.mjs

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runJournalTopicCase } from "../src/parser/runJournalTopicCase.mjs";
import { deriveJournalPatternKnowledgeCandidate } from "../src/knowledge/deriveJournalPatternKnowledgeCandidate.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const outputDir = path.join(rootDir, "output", "cases");

const KNOWLEDGE_CONFIG = {
  "executive-compensation-payment-journal": {
    knowledgeId: "dk-journal-executive-compensation-payment",
    scopeNote: "本書テーマ6-2(役員報酬・賞与等)の役員報酬支払時の仕訳でのみ確認",
  },
  "executive-bonus-provision-accrual-journal": {
    knowledgeId: "dk-journal-executive-bonus-provision-accrual",
    scopeNote: "本書テーマ6-2(役員報酬・賞与等)の役員賞与、決算時の仕訳でのみ確認",
  },
  "executive-bonus-payment-journal": {
    knowledgeId: "dk-journal-executive-bonus-payment",
    scopeNote: "本書テーマ6-2(役員報酬・賞与等)の役員賞与支払時の仕訳でのみ確認",
  },
  "executive-retirement-provision-accrual-journal": {
    knowledgeId: "dk-journal-executive-retirement-provision-accrual",
    scopeNote: "本書テーマ6-2(役員報酬・賞与等)の役員退職慰労金、決算時の仕訳でのみ確認",
  },
  "executive-retirement-payment-journal": {
    knowledgeId: "dk-journal-executive-retirement-payment",
    scopeNote: "本書テーマ6-2(役員報酬・賞与等)の退職慰労金支払時の仕訳でのみ確認",
  },
};

try {
  const { cases } = await runJournalTopicCase({
    pdfPath,
    outputDir,
    themePage: 104,
    topicHeadingPage: 109,
    topicPages: [{ page: 109, printedPageLabel: "80" }],
    expectedTopicNumber: "6-2",
    outOfScopeReason: "本ケースの対象には含めなかった",
    candidateDefinitions: [
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "役員報酬",
        caseName: "executive-compensation-payment-journal",
        blockId: "block-executive-compensation-payment",
        sequenceOnPage: 1,
      },
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "役員賞与引当金繰入額",
        caseName: "executive-bonus-provision-accrual-journal",
        blockId: "block-executive-bonus-provision-accrual",
        sequenceOnPage: 2,
      },
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "役員賞与引当金",
        caseName: "executive-bonus-payment-journal",
        blockId: "block-executive-bonus-payment",
        sequenceOnPage: 3,
      },
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "役員退職慰労引当金繰入額",
        caseName: "executive-retirement-provision-accrual-journal",
        blockId: "block-executive-retirement-provision-accrual",
        sequenceOnPage: 4,
      },
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "役員退職慰労引当金",
        caseName: "executive-retirement-payment-journal",
        blockId: "block-executive-retirement-payment",
        sequenceOnPage: 5,
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
