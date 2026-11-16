#!/usr/bin/env node
// CLIエントリポイント(Phase C・テーマ2-1 債権・債務): 電子記録債権の取得時の
// 仕訳から確定Sourceを1件生成し(M1相当)、続けてDerived Knowledge候補を
// 生成する(M2相当)。
//
// 使い方: node scripts/run-receivables-case.mjs

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runReceivablesCase } from "../src/parser/runReceivablesCase.mjs";
import { deriveJournalPatternKnowledgeCandidate } from "../src/knowledge/deriveJournalPatternKnowledgeCandidate.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const outputDir = path.join(rootDir, "output", "cases");
const outputPath = path.join(outputDir, "electronic-receivable-acquisition-journal.json");

try {
  const caseData = await runReceivablesCase({ pdfPath, outputPath });

  if (caseData.outOfScopeDetections.length > 0) {
    console.log(`対象外とした候補: ${caseData.outOfScopeDetections.length}件`);
    for (const d of caseData.outOfScopeDetections) {
      console.log(`  - ${d.precedingHeading ?? "(見出し不明)"}: ${d.reason}`);
    }
  }

  const derivedKnowledgeCandidate = deriveJournalPatternKnowledgeCandidate({
    block: caseData.block,
    structureContext: caseData.structureContext,
    knowledgeId: "dk-journal-electronic-receivable-acquisition",
    scopeNote:
      "本書テーマ2-1(債権・債務)の電子記録債権、取得時の仕訳でのみ確認。譲渡時の仕訳は" +
      "借方が2科目にまたがる複合仕訳のため本ケースでは未収録",
  });

  const updated = { ...caseData, derivedKnowledgeCandidate };
  await writeFile(outputPath, JSON.stringify(updated, null, 2), "utf8");

  console.log(`OK: wrote ${outputPath}`);
  console.log(`  sourceFaithful: ${updated.block.sourceFaithful}`);
  console.log(`  knowledge.id:   ${derivedKnowledgeCandidate.knowledge.id}`);
} catch (err) {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
}
