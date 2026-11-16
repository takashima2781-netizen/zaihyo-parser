#!/usr/bin/env node
// CLIエントリポイント(Phase C・テーマ9-1 自社利用のソフトウェア): 購入時・
// 制作途中(ソフトウェア仮勘定)・減価償却時・廃棄時・機器組込みソフトウェア
// (器具備品等へ算入)の仕訳5件を確定Source+Knowledge候補として生成する。
//
// 「(2) 制作完了」の仕訳(借方ソフトウェア×××(貸)ソフトウェア仮勘定×××
// +継続行の未払金×××)は貸方が2科目にまたがる複合仕訳であり、既存の単一行
// 検出器では正しく扱えないため対象外とする(CLAUDE.md原則5)。この複合仕訳の
// 1行目は、購入時の仕訳(借方に脚注記号※が付く「ソフトウェア※」)とは
// debitAccountRawが異なる(脚注記号の有無)ため、混同のリスクは無い。
//
// 使い方: node scripts/run-inhouse-software-case.mjs

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runJournalTopicCase } from "../src/parser/runJournalTopicCase.mjs";
import { deriveJournalPatternKnowledgeCandidate } from "../src/knowledge/deriveJournalPatternKnowledgeCandidate.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const outputDir = path.join(rootDir, "output", "cases");

const KNOWLEDGE_CONFIG = {
  "inhouse-software-purchase-journal": {
    knowledgeId: "dk-journal-inhouse-software-purchase",
    scopeNote: "本書テーマ9-1(自社利用のソフトウェア)の購入時の仕訳でのみ確認",
  },
  "inhouse-software-construction-journal": {
    knowledgeId: "dk-journal-inhouse-software-construction",
    scopeNote:
      "本書テーマ9-1(自社利用のソフトウェア)の制作途中(ソフトウェア仮勘定)の仕訳でのみ確認。" +
      "制作完了時の仕訳は複合仕訳のため本ケースでは未収録",
  },
  "inhouse-software-amortization-journal": {
    knowledgeId: "dk-journal-inhouse-software-amortization",
    scopeNote: "本書テーマ9-1(自社利用のソフトウェア)の決算時(減価償却)の仕訳でのみ確認",
  },
  "inhouse-software-disposal-journal": {
    knowledgeId: "dk-journal-inhouse-software-disposal",
    scopeNote: "本書テーマ9-1(自社利用のソフトウェア)の廃棄時の仕訳でのみ確認",
  },
  "inhouse-software-embedded-journal": {
    knowledgeId: "dk-journal-inhouse-software-embedded",
    scopeNote: "本書テーマ9-1(自社利用のソフトウェア)の機器組込みソフトウェアの仕訳でのみ確認",
  },
};

try {
  const { cases, outOfScopeDetections } = await runJournalTopicCase({
    pdfPath,
    outputDir,
    themePage: 190,
    topicHeadingPage: 191,
    topicPages: [
      { page: 191, printedPageLabel: "162" },
      { page: 192, printedPageLabel: "163" },
    ],
    expectedTopicNumber: "9-1",
    outOfScopeReason:
      "貸方が2科目以上にまたがる複合仕訳であり、既存の検出器では正しく全科目を捉えられないため" +
      "対象外とした(原則4)",
    candidateDefinitions: [
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "ソフトウェア※",
        caseName: "inhouse-software-purchase-journal",
        blockId: "block-inhouse-software-purchase",
        sequenceOnPage: 1,
      },
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "ソフトウェア仮勘定",
        caseName: "inhouse-software-construction-journal",
        blockId: "block-inhouse-software-construction",
        sequenceOnPage: 2,
      },
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "ソフトウェア償却※",
        caseName: "inhouse-software-amortization-journal",
        blockId: "block-inhouse-software-amortization",
        sequenceOnPage: 3,
      },
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "ソフトウェア廃棄損",
        caseName: "inhouse-software-disposal-journal",
        blockId: "block-inhouse-software-disposal",
        sequenceOnPage: 4,
      },
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "備品",
        caseName: "inhouse-software-embedded-journal",
        blockId: "block-inhouse-software-embedded",
        sequenceOnPage: 5,
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
