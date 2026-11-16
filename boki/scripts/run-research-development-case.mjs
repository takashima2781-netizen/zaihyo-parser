#!/usr/bin/env node
// CLIエントリポイント(Phase C・テーマ10-1 研究開発費): 研究開発費として
// 処理する仕訳1件を確定Source+Knowledge候補として生成する。
//
// 教材上、この仕訳の型(借方研究開発費、貸方○○○のプレースホルダー)は
// 「一般的な研究開発費の発生時」「特定の研究開発目的にのみ使用される
// 機械装置等の取得時」の2箇所に完全に同一の型で出現する。別のKnowledgeとして
// は追加せず、1件のみを採用する(CLAUDE.md原則3)。
//
// 使い方: node scripts/run-research-development-case.mjs

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runJournalTopicCase } from "../src/parser/runJournalTopicCase.mjs";
import { deriveJournalPatternKnowledgeCandidate } from "../src/knowledge/deriveJournalPatternKnowledgeCandidate.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const outputDir = path.join(rootDir, "output", "cases");

const KNOWLEDGE_CONFIG = {
  "research-development-cost-journal": {
    knowledgeId: "dk-journal-research-development-cost",
    scopeNote:
      "本書テーマ10-1(研究開発費)の研究開発費として処理する仕訳でのみ確認。教材上、" +
      "一般的な発生時・特定目的の機械装置等取得時の2箇所に完全に同一の型で出現するため、" +
      "1件のみ採用した",
  },
};

try {
  const { cases, outOfScopeDetections } = await runJournalTopicCase({
    pdfPath,
    outputDir,
    themePage: 196,
    topicHeadingPage: 197,
    topicPages: [{ page: 197, printedPageLabel: "168" }],
    expectedTopicNumber: "10-1",
    outOfScopeReason:
      "既に採用した仕訳型(1件目)と完全に同一の型で重複出現したため対象外とした(原則3)",
    candidateDefinitions: [
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "研究開発費",
        caseName: "research-development-cost-journal",
        blockId: "block-research-development-cost",
        sequenceOnPage: 1,
      },
    ],
  });

  if (outOfScopeDetections.length > 0) {
    console.log(`対象外とした候補: ${outOfScopeDetections.length}件`);
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
