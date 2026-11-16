#!/usr/bin/env node
// CLIエントリポイント(Phase C・テーマ8-1 有形固定資産): 購入時・工事代金
// 前払時(建設仮勘定)・完成引渡時の仕訳3件を確定Source+Knowledge候補として
// 生成する。
//
// 購入時の仕訳に脚注として付く取得原価の算定式(「購入代価（本体価額＋
// 付属品価額－値引額）＋付随費用＝取得原価」)は、項の直後に説明的な括弧
// (購入代価の内訳を並置的に示す注記であり、乗算や単純な減算グループとは
// 異なる)が続く形状で、既存の5トークン語彙(term/operator/fraction/group/
// power)へ機械的に当てはめると、括弧の意味(並置的な内訳説明であり演算の
// グループ化ではない)を推測することになりかねない。無理に構造化せず保留
// とする(CLAUDE.md原則4)。仕訳3件のみを対象とする。
//
// 使い方: node scripts/run-tangible-fixed-asset-case.mjs

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runJournalTopicCase } from "../src/parser/runJournalTopicCase.mjs";
import { deriveJournalPatternKnowledgeCandidate } from "../src/knowledge/deriveJournalPatternKnowledgeCandidate.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const outputDir = path.join(rootDir, "output", "cases");

const KNOWLEDGE_CONFIG = {
  "tangible-asset-purchase-journal": {
    knowledgeId: "dk-journal-tangible-asset-purchase",
    scopeNote: "本書テーマ8-1(有形固定資産)の購入時の仕訳でのみ確認",
  },
  "tangible-asset-construction-advance-journal": {
    knowledgeId: "dk-journal-tangible-asset-construction-advance",
    scopeNote: "本書テーマ8-1(有形固定資産)の工事代金前払時(建設仮勘定)の仕訳でのみ確認",
  },
  "tangible-asset-construction-completion-journal": {
    knowledgeId: "dk-journal-tangible-asset-construction-completion",
    scopeNote: "本書テーマ8-1(有形固定資産)の完成引渡時の仕訳でのみ確認",
  },
};

try {
  const { cases } = await runJournalTopicCase({
    pdfPath,
    outputDir,
    themePage: 150,
    topicHeadingPage: 151,
    topicPages: [{ page: 151, printedPageLabel: "122" }],
    expectedTopicNumber: "8-1",
    outOfScopeReason: "本ケースの対象には含めなかった",
    candidateDefinitions: [
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "有形固定資産※",
        caseName: "tangible-asset-purchase-journal",
        blockId: "block-tangible-asset-purchase",
        sequenceOnPage: 1,
      },
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "建設仮勘定",
        caseName: "tangible-asset-construction-advance-journal",
        blockId: "block-tangible-asset-construction-advance",
        sequenceOnPage: 2,
      },
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "建物",
        caseName: "tangible-asset-construction-completion-journal",
        blockId: "block-tangible-asset-construction-completion",
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
