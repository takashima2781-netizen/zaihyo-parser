#!/usr/bin/env node
// CLIエントリポイント(Phase C・テーマ3-1 現金): 先日付小切手・他人振出の
// 当座小切手の取立(受取時/取立依頼時)の仕訳3件を確定Source+Knowledge候補
// として生成する。取立完了時は「仕訳なし」であり抽出対象外。
//
// 使い方: node scripts/run-cash-topic-case.mjs

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runJournalTopicCase } from "../src/parser/runJournalTopicCase.mjs";
import { deriveJournalPatternKnowledgeCandidate } from "../src/knowledge/deriveJournalPatternKnowledgeCandidate.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const outputDir = path.join(rootDir, "output", "cases");

const KNOWLEDGE_CONFIG = {
  "postdated-check-received-journal": {
    knowledgeId: "dk-journal-postdated-check-received",
    scopeNote: "本書テーマ3-1(現金)の先日付小切手受取時の仕訳でのみ確認",
  },
  "other-check-collection-received-journal": {
    knowledgeId: "dk-journal-other-check-collection-received",
    scopeNote: "本書テーマ3-1(現金)の他人振出当座小切手、受取時の仕訳でのみ確認",
  },
  "other-check-collection-requested-journal": {
    knowledgeId: "dk-journal-other-check-collection-requested",
    scopeNote:
      "本書テーマ3-1(現金)の他人振出当座小切手、取立依頼時の仕訳でのみ確認。" +
      "取立完了時は仕訳なしのため本ケースでは対象外",
  },
};

try {
  const { cases, outOfScopeDetections } = await runJournalTopicCase({
    pdfPath,
    outputDir,
    themePage: 58,
    topicHeadingPage: 59,
    topicPages: [
      { page: 59, printedPageLabel: "30" },
      { page: 60, printedPageLabel: "31" },
    ],
    expectedTopicNumber: "3-1",
    outOfScopeReason:
      "同じページの他の仕訳型または複合仕訳。本ケースの対象(3件)には含めなかった",
    candidateDefinitions: [
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "").includes("受取手形"),
        caseName: "postdated-check-received-journal",
        blockId: "block-postdated-check-received",
        sequenceOnPage: 1,
      },
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "現金",
        caseName: "other-check-collection-received-journal",
        blockId: "block-other-check-collection-received",
        sequenceOnPage: 2,
      },
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "").includes("当座預金"),
        caseName: "other-check-collection-requested-journal",
        blockId: "block-other-check-collection-requested",
        sequenceOnPage: 3,
      },
    ],
  });

  if (outOfScopeDetections.length > 0) {
    console.log(`対象外とした候補: ${outOfScopeDetections.length}件`);
    for (const d of outOfScopeDetections) {
      console.log(`  - ${d.precedingHeading ?? "(見出し不明)"}: ${d.reason}`);
    }
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
