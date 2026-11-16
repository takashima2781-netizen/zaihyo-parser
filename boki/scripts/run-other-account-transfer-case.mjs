#!/usr/bin/env node
// CLIエントリポイント(Phase C・テーマ7-6 他勘定振替): 火災などの災害・見本品
// 提供・自家消費による商品減少の仕訳3件を確定Source+Knowledge候補として
// 生成する。
//
// 使い方: node scripts/run-other-account-transfer-case.mjs

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runJournalTopicCase } from "../src/parser/runJournalTopicCase.mjs";
import { deriveJournalPatternKnowledgeCandidate } from "../src/knowledge/deriveJournalPatternKnowledgeCandidate.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const outputDir = path.join(rootDir, "output", "cases");

const KNOWLEDGE_CONFIG = {
  "other-account-transfer-disaster-journal": {
    knowledgeId: "dk-journal-other-account-transfer-disaster",
    scopeNote: "本書テーマ7-6(他勘定振替)の火災などの災害による商品減少の仕訳でのみ確認",
  },
  "other-account-transfer-sample-journal": {
    knowledgeId: "dk-journal-other-account-transfer-sample",
    scopeNote: "本書テーマ7-6(他勘定振替)の見本品提供による商品減少の仕訳でのみ確認",
  },
  "other-account-transfer-self-consumption-journal": {
    knowledgeId: "dk-journal-other-account-transfer-self-consumption",
    scopeNote: "本書テーマ7-6(他勘定振替)の備品などとしての自家消費による商品減少の仕訳でのみ確認",
  },
};

try {
  const { cases } = await runJournalTopicCase({
    pdfPath,
    outputDir,
    themePage: 112,
    topicHeadingPage: 135,
    topicPages: [{ page: 135, printedPageLabel: "106" }],
    expectedTopicNumber: "7-6",
    outOfScopeReason: "本ケースの対象には含めなかった",
    candidateDefinitions: [
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "火災損失",
        caseName: "other-account-transfer-disaster-journal",
        blockId: "block-other-account-transfer-disaster",
        sequenceOnPage: 1,
      },
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "見本品費",
        caseName: "other-account-transfer-sample-journal",
        blockId: "block-other-account-transfer-sample",
        sequenceOnPage: 2,
      },
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "備品",
        caseName: "other-account-transfer-self-consumption-journal",
        blockId: "block-other-account-transfer-self-consumption",
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
