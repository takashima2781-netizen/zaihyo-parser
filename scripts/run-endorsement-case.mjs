#!/usr/bin/env node
// CLIエントリポイント(Phase C・テーマ4-2 裏書譲渡・割引): 裏書時・裏書譲渡を
// 受けた場合・自己が支払義務を負う手形を受け取った場合の仕訳3件を確定
// Source+Knowledge候補として生成する。
//
// 「割引」の仕訳((借)現金預金×××(貸)受取手形×××の次行に「手形売却損×××」
// が続く)は、借方が2科目にまたがる複合仕訳であり、既存の検出器では正しく
// 全科目を捉えられないため対象外とする。
//
// 使い方: node scripts/run-endorsement-case.mjs

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runJournalTopicCase } from "../src/parser/runJournalTopicCase.mjs";
import { deriveJournalPatternKnowledgeCandidate } from "../src/knowledge/deriveJournalPatternKnowledgeCandidate.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const outputDir = path.join(rootDir, "output", "cases");

const KNOWLEDGE_CONFIG = {
  "note-endorsed-journal": {
    knowledgeId: "dk-journal-note-endorsed",
    scopeNote: "本書テーマ4-2(裏書譲渡・割引)の裏書時の仕訳でのみ確認",
  },
  "note-endorsement-received-journal": {
    knowledgeId: "dk-journal-note-endorsement-received",
    scopeNote: "本書テーマ4-2(裏書譲渡・割引)の裏書譲渡を受けた場合の仕訳でのみ確認",
  },
  "note-own-liability-received-journal": {
    knowledgeId: "dk-journal-note-own-liability-received",
    scopeNote: "本書テーマ4-2(裏書譲渡・割引)の自己が支払義務を負う手形を受け取った場合の仕訳でのみ確認",
  },
};

try {
  const { cases, outOfScopeDetections } = await runJournalTopicCase({
    pdfPath,
    outputDir,
    themePage: 76,
    topicHeadingPage: 79,
    topicPages: [{ page: 79, printedPageLabel: "50" }],
    expectedTopicNumber: "4-2",
    outOfScopeReason:
      "割引の仕訳。借方が2科目(現金預金/手形売却損)にまたがる複合仕訳であり、既存の" +
      "検出器では正しく全科目を捉えられないため対象外とした(原則4)",
    candidateDefinitions: [
      {
        match: (c) => (c.creditAccountRaw ?? "").replace(/\s/g, "") === "受取手形",
        caseName: "note-endorsed-journal",
        blockId: "block-note-endorsed",
        sequenceOnPage: 1,
      },
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "受取手形",
        caseName: "note-endorsement-received-journal",
        blockId: "block-note-endorsement-received",
        sequenceOnPage: 2,
      },
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "支払手形",
        caseName: "note-own-liability-received-journal",
        blockId: "block-note-own-liability-received",
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
