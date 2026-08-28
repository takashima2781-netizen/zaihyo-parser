#!/usr/bin/env node
// CLIエントリポイント(Phase C・テーマ3-2 当座預金): 入金時・出金時/小切手
// 振出時の仕訳2件を確定Source+Knowledge候補として生成する。
//
// 「自己振出小切手受取時」の仕訳(借方当座預金/貸方○○○)は、「入金時」の
// 仕訳と借方・貸方の型が完全に同一(sourceFaithfulが一致する)であるため、
// 別のKnowledgeとしては追加しない(同じ型の繰り返しであり、新しい型ではない、
// CLAUDE.md原則3「根拠のない知識を作らない」)。
//
// 使い方: node scripts/run-checking-account-case.mjs

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runJournalTopicCase } from "../src/parser/runJournalTopicCase.mjs";
import { deriveJournalPatternKnowledgeCandidate } from "../src/knowledge/deriveJournalPatternKnowledgeCandidate.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const outputDir = path.join(rootDir, "output", "cases");

const KNOWLEDGE_CONFIG = {
  "checking-account-deposit-journal": {
    knowledgeId: "dk-journal-checking-account-deposit",
    scopeNote: "本書テーマ3-2(当座預金)の入金時の仕訳でのみ確認",
  },
  "checking-account-withdrawal-journal": {
    knowledgeId: "dk-journal-checking-account-withdrawal",
    scopeNote: "本書テーマ3-2(当座預金)の出金時・小切手振出時の仕訳でのみ確認",
  },
};

try {
  const { cases, outOfScopeDetections } = await runJournalTopicCase({
    pdfPath,
    outputDir,
    themePage: 58,
    topicHeadingPage: 65,
    topicPages: [{ page: 65, printedPageLabel: "36" }],
    expectedTopicNumber: "3-2",
    outOfScopeReason: "同じページの他の仕訳型または複合仕訳。本ケースの対象には含めなかった",
    candidateDefinitions: [
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "").includes("当座預金"),
        caseName: "checking-account-deposit-journal",
        blockId: "block-checking-account-deposit",
        sequenceOnPage: 1,
      },
      {
        match: (c) => (c.creditAccountRaw ?? "").replace(/\s/g, "").includes("当座預金"),
        caseName: "checking-account-withdrawal-journal",
        blockId: "block-checking-account-withdrawal",
        sequenceOnPage: 2,
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
