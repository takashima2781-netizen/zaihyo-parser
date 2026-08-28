#!/usr/bin/env node
// CLIエントリポイント(Phase C・テーマ5-2 貸倒処理): 当期発生債権の貸倒処理・
// 償却債権取立益の仕訳2件を確定Source+Knowledge候補として生成する。
//
// 前期末債権の貸倒処理は、貸方が2科目(○○○/貸倒損失)にまたがる複合仕訳
// であり対象外とする。
//
// 使い方: node scripts/run-bad-debt-case.mjs

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runJournalTopicCase } from "../src/parser/runJournalTopicCase.mjs";
import { deriveJournalPatternKnowledgeCandidate } from "../src/knowledge/deriveJournalPatternKnowledgeCandidate.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const outputDir = path.join(rootDir, "output", "cases");

const KNOWLEDGE_CONFIG = {
  "bad-debt-current-period-journal": {
    knowledgeId: "dk-journal-bad-debt-current-period",
    scopeNote:
      "本書テーマ5-2(貸倒処理)の当期発生債権の貸倒処理の仕訳でのみ確認。前期末債権の" +
      "貸倒処理は貸方が2科目にまたがる複合仕訳のため本ケースでは未収録",
  },
  "bad-debt-recovery-journal": {
    knowledgeId: "dk-journal-bad-debt-recovery",
    scopeNote: "本書テーマ5-2(貸倒処理)の償却債権取立益の仕訳でのみ確認",
  },
};

try {
  const { cases, outOfScopeDetections } = await runJournalTopicCase({
    pdfPath,
    outputDir,
    themePage: 90,
    topicHeadingPage: 97,
    topicPages: [{ page: 97, printedPageLabel: "68" }],
    expectedTopicNumber: "5-2",
    outOfScopeReason:
      "貸方が2科目(○○○/貸倒損失)にまたがる複合仕訳であり、既存の検出器では正しく全科目を" +
      "捉えられないため対象外とした(原則4)",
    candidateDefinitions: [
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "貸倒損失",
        caseName: "bad-debt-current-period-journal",
        blockId: "block-bad-debt-current-period",
        sequenceOnPage: 1,
      },
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "現金預金",
        caseName: "bad-debt-recovery-journal",
        blockId: "block-bad-debt-recovery",
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
