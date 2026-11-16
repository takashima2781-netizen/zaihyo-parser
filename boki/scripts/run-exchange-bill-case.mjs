#!/usr/bin/env node
// CLIエントリポイント(第4ケースの追加分): テーマ4-1(手形)の為替手形から
// 仕訳パターン2件(名宛人/指図人)を確定Sourceとして生成し(M1相当)、続けて
// それぞれからDerived Knowledge候補を生成する(M2相当)。振出人は対象外
// (`src/parser/runExchangeBillCase.mjs`のコメント参照)。
//
// 使い方: node scripts/run-exchange-bill-case.mjs
//         (先に scripts/run-promissory-note-case.mjs を実行しておくこと。
//          テーマ4-1のstructureContextは既に確定済みのものを前提とする)

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runExchangeBillCase } from "../src/parser/runExchangeBillCase.mjs";
import { deriveJournalPatternKnowledgeCandidate } from "../src/knowledge/deriveJournalPatternKnowledgeCandidate.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const outputDir = path.join(rootDir, "output", "cases");

const KNOWLEDGE_CONFIG = {
  "exchange-bill-payee-journal": {
    knowledgeId: "dk-journal-exchange-bill-payee",
    scopeNote:
      "本書テーマ4-1(手形)の為替手形、名宛人側の仕訳でのみ確認。約束手形の名宛人と" +
      "同型(片側が支払手形で固定、片側がプレースホルダー)であることを確認済み",
  },
  "exchange-bill-remittee-journal": {
    knowledgeId: "dk-journal-exchange-bill-remittee",
    scopeNote:
      "本書テーマ4-1(手形)の為替手形、指図人側の仕訳でのみ確認。約束手形の名宛人と" +
      "同型(片側が受取手形で固定、片側がプレースホルダー)であることを確認済み",
  },
};

try {
  const { cases, outOfScopeDetections } = await runExchangeBillCase({ pdfPath, outputDir });

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
    console.log(`  knowledge.id:   ${derivedKnowledgeCandidate.knowledge.id}`);
    console.log(`  reviewStatus:   ${derivedKnowledgeCandidate.reviewStatus}`);
  }
} catch (err) {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
}
