#!/usr/bin/env node
// CLIエントリポイント(Phase C・テーマ5-4 保証債務): 裏書時・割引時、決済時・
// 不渡時の仕訳2件を確定Source+Knowledge候補として生成する。
//
// 使い方: node scripts/run-guarantee-obligation-case.mjs

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runJournalTopicCase } from "../src/parser/runJournalTopicCase.mjs";
import { deriveJournalPatternKnowledgeCandidate } from "../src/knowledge/deriveJournalPatternKnowledgeCandidate.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const outputDir = path.join(rootDir, "output", "cases");

const KNOWLEDGE_CONFIG = {
  "guarantee-obligation-recognized-journal": {
    knowledgeId: "dk-journal-guarantee-obligation-recognized",
    scopeNote: "本書テーマ5-4(保証債務)の裏書時・割引時の仕訳でのみ確認",
  },
  "guarantee-obligation-settled-journal": {
    knowledgeId: "dk-journal-guarantee-obligation-settled",
    scopeNote: "本書テーマ5-4(保証債務)の決済時・不渡時の仕訳でのみ確認",
  },
};

try {
  const { cases } = await runJournalTopicCase({
    pdfPath,
    outputDir,
    themePage: 90,
    topicHeadingPage: 101,
    topicPages: [{ page: 101, printedPageLabel: "72" }],
    expectedTopicNumber: "5-4",
    outOfScopeReason: "本ケースの対象には含めなかった",
    candidateDefinitions: [
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "保証債務費用",
        caseName: "guarantee-obligation-recognized-journal",
        blockId: "block-guarantee-obligation-recognized",
        sequenceOnPage: 1,
      },
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "保証債務",
        caseName: "guarantee-obligation-settled-journal",
        blockId: "block-guarantee-obligation-settled",
        sequenceOnPage: 2,
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
