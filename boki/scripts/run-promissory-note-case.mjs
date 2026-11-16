#!/usr/bin/env node
// CLIエントリポイント(第4ケース): テーマ4-1(手形)の約束手形から仕訳
// パターン2件(振出人/名宛人)を確定Sourceとして生成し(M1相当)、続けて
// それぞれからDerived Knowledge候補を生成する(M2相当)。
//
// 使い方: node scripts/run-promissory-note-case.mjs

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runPromissoryNoteCase } from "../src/parser/runPromissoryNoteCase.mjs";
import { deriveJournalPatternKnowledgeCandidate } from "../src/knowledge/deriveJournalPatternKnowledgeCandidate.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const outputDir = path.join(rootDir, "output", "cases");

const KNOWLEDGE_CONFIG = {
  "promissory-note-drawer-journal": {
    knowledgeId: "dk-journal-promissory-note-drawer",
    scopeNote:
      "本書テーマ4-1(手形)の約束手形、振出人側の仕訳でのみ確認。為替手形(振出人/名宛人/" +
      "指図人の3者)への適用は本ケースでは未収録(振出人の行が借方・貸方とも" +
      "プレースホルダーで会計的解釈を要するため対象外とした)",
  },
  "promissory-note-payee-journal": {
    knowledgeId: "dk-journal-promissory-note-payee",
    scopeNote:
      "本書テーマ4-1(手形)の約束手形、名宛人側の仕訳でのみ確認。為替手形(振出人/名宛人/" +
      "指図人の3者)への適用は本ケースでは未収録",
  },
};

try {
  const { cases, outOfScopeDetections } = await runPromissoryNoteCase({ pdfPath, outputDir });

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
