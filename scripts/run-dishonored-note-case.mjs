#!/usr/bin/env node
// CLIエントリポイント(Phase C・テーマ5-3 不渡手形): 自己所有の手形が不渡と
// なった場合・裏書譲渡または割引した手形が不渡となった場合の仕訳2件を
// 確定Source+Knowledge候補として生成する。
//
// 使い方: node scripts/run-dishonored-note-case.mjs

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runJournalTopicCase } from "../src/parser/runJournalTopicCase.mjs";
import { deriveJournalPatternKnowledgeCandidate } from "../src/knowledge/deriveJournalPatternKnowledgeCandidate.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const outputDir = path.join(rootDir, "output", "cases");

const KNOWLEDGE_CONFIG = {
  "dishonored-note-own-journal": {
    knowledgeId: "dk-journal-dishonored-note-own",
    scopeNote: "本書テーマ5-3(不渡手形)の自己所有の手形が不渡となった場合の仕訳でのみ確認",
  },
  "dishonored-note-endorsed-journal": {
    knowledgeId: "dk-journal-dishonored-note-endorsed",
    scopeNote: "本書テーマ5-3(不渡手形)の裏書譲渡または割引した手形が不渡となった場合の仕訳でのみ確認",
  },
};

try {
  const { cases } = await runJournalTopicCase({
    pdfPath,
    outputDir,
    themePage: 90,
    topicHeadingPage: 99,
    topicPages: [{ page: 99, printedPageLabel: "70" }],
    expectedTopicNumber: "5-3",
    outOfScopeReason: "本ケースの対象には含めなかった",
    candidateDefinitions: [
      {
        match: (c) => (c.creditAccountRaw ?? "").replace(/\s/g, "") === "受取手形",
        caseName: "dishonored-note-own-journal",
        blockId: "block-dishonored-note-own",
        sequenceOnPage: 1,
      },
      {
        match: (c) => (c.creditAccountRaw ?? "").replace(/\s/g, "") === "現金預金",
        caseName: "dishonored-note-endorsed-journal",
        blockId: "block-dishonored-note-endorsed",
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
