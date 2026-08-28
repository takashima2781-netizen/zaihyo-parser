#!/usr/bin/env node
// CLIエントリポイント(Phase C・テーマ3-4 当座借越): 一勘定制の借越時・
// 返済時の仕訳2件を確定Source+Knowledge候補として生成する。
//
// 二勘定制の借越時・返済時の仕訳は、いずれも借方または貸方が2科目に
// またがる複合仕訳(例: 借越時「(借)○○○×××(貸)当座預金×××」の次行に
// 「当座借越×××」が続く)であり、既存の検出器では正しく全科目を捉え
// られないため対象外とする(`runReceivablesCase.mjs`と同じ判断)。
//
// 使い方: node scripts/run-overdraft-case.mjs

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runJournalTopicCase } from "../src/parser/runJournalTopicCase.mjs";
import { deriveJournalPatternKnowledgeCandidate } from "../src/knowledge/deriveJournalPatternKnowledgeCandidate.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const outputDir = path.join(rootDir, "output", "cases");

const KNOWLEDGE_CONFIG = {
  "overdraft-single-account-incurred-journal": {
    knowledgeId: "dk-journal-overdraft-single-account-incurred",
    scopeNote:
      "本書テーマ3-4(当座借越)の一勘定制、借越時の仕訳でのみ確認。二勘定制は借方または" +
      "貸方が2科目にまたがる複合仕訳のため本ケースでは未収録",
  },
  "overdraft-single-account-repaid-journal": {
    knowledgeId: "dk-journal-overdraft-single-account-repaid",
    scopeNote:
      "本書テーマ3-4(当座借越)の一勘定制、返済時の仕訳でのみ確認。二勘定制は本ケースでは未収録",
  },
};

try {
  const { cases, outOfScopeDetections } = await runJournalTopicCase({
    pdfPath,
    outputDir,
    themePage: 58,
    topicHeadingPage: 69,
    topicPages: [{ page: 69, printedPageLabel: "40" }],
    expectedTopicNumber: "3-4",
    outOfScopeReason:
      "二勘定制の仕訳。借方または貸方が2科目にまたがる複合仕訳であり、既存の検出器では" +
      "正しく全科目を捉えられないため対象外とした(新しい検出器が必要、原則4)",
    candidateDefinitions: [
      {
        match: (c) => (c.creditAccountRaw ?? "").replace(/\s/g, "") === "当座",
        caseName: "overdraft-single-account-incurred-journal",
        blockId: "block-overdraft-single-account-incurred",
        sequenceOnPage: 1,
      },
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "当座",
        caseName: "overdraft-single-account-repaid-journal",
        blockId: "block-overdraft-single-account-repaid",
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
