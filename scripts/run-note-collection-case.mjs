#!/usr/bin/env node
// CLIエントリポイント(Phase C・テーマ4-3 小切手の取立と手形の取立): 小切手/
// 手形取立の仕訳4件、および研究「手形の更改」(利息を金銭で直接授受する
// 場合)の仕訳4件、計8件を確定Source+Knowledge候補として生成する。
//
// 「利息を新手形の額面金額に含める場合」の仕訳は、貸方が2科目(旧手形消滅+
// 支払利息/受取利息)にまたがる複合仕訳であり、既存の検出器では正しく全
// 科目を捉えられないため対象外とする。
//
// 使い方: node scripts/run-note-collection-case.mjs

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runJournalTopicCase } from "../src/parser/runJournalTopicCase.mjs";
import { deriveJournalPatternKnowledgeCandidate } from "../src/knowledge/deriveJournalPatternKnowledgeCandidate.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const outputDir = path.join(rootDir, "output", "cases");

const KNOWLEDGE_CONFIG = {
  "check-collection-received-journal-2": {
    knowledgeId: "dk-journal-check-collection-received-2",
    scopeNote: "本書テーマ4-3(小切手の取立と手形の取立)の他人振出当座小切手、受取時の仕訳でのみ確認",
  },
  "check-collection-requested-journal-2": {
    knowledgeId: "dk-journal-check-collection-requested-2",
    scopeNote: "本書テーマ4-3(小切手の取立と手形の取立)の他人振出当座小切手、取立依頼時の仕訳でのみ確認",
  },
  "note-collection-received-journal": {
    knowledgeId: "dk-journal-note-collection-received",
    scopeNote: "本書テーマ4-3(小切手の取立と手形の取立)の手形取立、受取時の仕訳でのみ確認",
  },
  "note-collection-completed-journal": {
    knowledgeId: "dk-journal-note-collection-completed",
    scopeNote: "本書テーマ4-3(小切手の取立と手形の取立)の手形取立、取立完了時の仕訳でのみ確認",
  },
  "note-renewal-payer-old-note-journal": {
    knowledgeId: "dk-journal-note-renewal-payer-old-note",
    scopeNote:
      "本書テーマ4-3(小切手の取立と手形の取立)、研究「手形の更改」の手形債務者・旧手形消滅の" +
      "仕訳でのみ確認(利息を金銭で直接授受する場合)",
  },
  "note-renewal-payer-interest-journal": {
    knowledgeId: "dk-journal-note-renewal-payer-interest",
    scopeNote:
      "本書テーマ4-3(小切手の取立と手形の取立)、研究「手形の更改」の手形債務者・利息支払の" +
      "仕訳でのみ確認(利息を金銭で直接授受する場合)",
  },
  "note-renewal-payee-old-note-journal": {
    knowledgeId: "dk-journal-note-renewal-payee-old-note",
    scopeNote:
      "本書テーマ4-3(小切手の取立と手形の取立)、研究「手形の更改」の手形債権者・旧手形消滅の" +
      "仕訳でのみ確認(利息を金銭で直接授受する場合)",
  },
  "note-renewal-payee-interest-journal": {
    knowledgeId: "dk-journal-note-renewal-payee-interest",
    scopeNote:
      "本書テーマ4-3(小切手の取立と手形の取立)、研究「手形の更改」の手形債権者・利息受取の" +
      "仕訳でのみ確認(利息を金銭で直接授受する場合)",
  },
};

try {
  const { cases, outOfScopeDetections } = await runJournalTopicCase({
    pdfPath,
    outputDir,
    themePage: 76,
    topicHeadingPage: 81,
    topicPages: [
      { page: 81, printedPageLabel: "52" },
      { page: 82, printedPageLabel: "53" },
      { page: 85, printedPageLabel: "56" },
    ],
    expectedTopicNumber: "4-3",
    outOfScopeReason:
      "貸方が2科目(旧手形消滅/利息)にまたがる複合仕訳であり、既存の検出器では正しく全科目を" +
      "捉えられないため対象外とした(原則4)",
    candidateDefinitions: [
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "現金",
        caseName: "check-collection-received-journal-2",
        blockId: "block-check-collection-received-2",
        sequenceOnPage: 1,
      },
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "当座預金",
        caseName: "check-collection-requested-journal-2",
        blockId: "block-check-collection-requested-2",
        sequenceOnPage: 2,
      },
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "受取手形",
        caseName: "note-collection-received-journal",
        blockId: "block-note-collection-received",
        sequenceOnPage: 3,
      },
      {
        match: (c) => (c.creditAccountRaw ?? "").replace(/\s/g, "") === "受取手形",
        caseName: "note-collection-completed-journal",
        blockId: "block-note-collection-completed",
        sequenceOnPage: 4,
      },
      {
        match: (c) => {
          const debit = (c.debitAccountRaw ?? "").replace(/\s/g, "");
          const credit = (c.creditAccountRaw ?? "").replace(/\s/g, "");
          return debit === "支払手形" && credit === "支払手形";
        },
        caseName: "note-renewal-payer-old-note-journal",
        blockId: "block-note-renewal-payer-old-note",
        sequenceOnPage: 5,
      },
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "支払利息",
        caseName: "note-renewal-payer-interest-journal",
        blockId: "block-note-renewal-payer-interest",
        sequenceOnPage: 6,
      },
      {
        match: (c) => {
          const debit = (c.debitAccountRaw ?? "").replace(/\s/g, "");
          const credit = (c.creditAccountRaw ?? "").replace(/\s/g, "");
          return debit === "受取手形" && credit === "受取手形";
        },
        caseName: "note-renewal-payee-old-note-journal",
        blockId: "block-note-renewal-payee-old-note",
        sequenceOnPage: 7,
      },
      {
        match: (c) => (c.creditAccountRaw ?? "").replace(/\s/g, "") === "受取利息",
        caseName: "note-renewal-payee-interest-journal",
        blockId: "block-note-renewal-payee-interest",
        sequenceOnPage: 8,
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
