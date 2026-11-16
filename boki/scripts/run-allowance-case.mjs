#!/usr/bin/env node
// CLIエントリポイント(Phase C・テーマ5-1 貸倒引当金の設定手続): 差額補充法・
// 洗替法の仕訳2件を確定Source+Knowledge候補として生成する。
//
// 洗替法は2行の仕訳から成るが、2行目「(借)貸倒引当金繰入額×××(貸)貸倒
// 引当金×××」は差額補充法の仕訳と完全に同一の型であるため、別のKnowledge
// としては追加しない(`run-checking-account-case.mjs`と同じ判断、原則3)。
//
// 使い方: node scripts/run-allowance-case.mjs

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runJournalTopicCase } from "../src/parser/runJournalTopicCase.mjs";
import { deriveJournalPatternKnowledgeCandidate } from "../src/knowledge/deriveJournalPatternKnowledgeCandidate.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const outputDir = path.join(rootDir, "output", "cases");

const KNOWLEDGE_CONFIG = {
  "allowance-differential-method-journal": {
    knowledgeId: "dk-journal-allowance-differential-method",
    scopeNote: "本書テーマ5-1(貸倒引当金の設定手続)の差額補充法の仕訳でのみ確認",
  },
  "allowance-write-off-restore-journal": {
    knowledgeId: "dk-journal-allowance-write-off-restore",
    scopeNote: "本書テーマ5-1(貸倒引当金の設定手続)の洗替法、戻入時の仕訳でのみ確認",
  },
};

try {
  const { cases, outOfScopeDetections } = await runJournalTopicCase({
    pdfPath,
    outputDir,
    themePage: 90,
    topicHeadingPage: 91,
    topicPages: [{ page: 92, printedPageLabel: "63" }],
    expectedTopicNumber: "5-1",
    outOfScopeReason:
      "差額補充法の仕訳と完全に同一の型の重複出現(洗替法の2行目)であり、別のKnowledgeとしては" +
      "追加しなかった(原則3)",
    candidateDefinitions: [
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "貸倒引当金繰入額",
        caseName: "allowance-differential-method-journal",
        blockId: "block-allowance-differential-method",
        sequenceOnPage: 1,
      },
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "貸倒引当金",
        caseName: "allowance-write-off-restore-journal",
        blockId: "block-allowance-write-off-restore",
        sequenceOnPage: 2,
      },
    ],
  });

  if (outOfScopeDetections.length > 0) {
    console.log(`対象外(重複型)とした候補: ${outOfScopeDetections.length}件`);
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
