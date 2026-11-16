#!/usr/bin/env node
// CLIエントリポイント(Phase C・テーマ6-1 従業員給料・賞与): 所得税等納付時・
// 賞与引当金の決算時・冬期賞与支払時の仕訳3件を確定Source+Knowledge候補
// として生成する。
//
// 従業員給料支払時・従業員賞与支払時・社会保険料納付時・夏期賞与支払時の
// 仕訳は、いずれも貸方または借方が2科目以上にまたがる複合仕訳であり
// 対象外とする。
//
// 使い方: node scripts/run-employee-compensation-case.mjs

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runJournalTopicCase } from "../src/parser/runJournalTopicCase.mjs";
import { deriveJournalPatternKnowledgeCandidate } from "../src/knowledge/deriveJournalPatternKnowledgeCandidate.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const outputDir = path.join(rootDir, "output", "cases");

const KNOWLEDGE_CONFIG = {
  "income-tax-payment-journal": {
    knowledgeId: "dk-journal-income-tax-payment",
    scopeNote:
      "本書テーマ6-1(従業員給料・賞与)の所得税等納付時の仕訳でのみ確認。給料/賞与支払時・" +
      "社会保険料納付時は複合仕訳のため本ケースでは未収録",
  },
  "bonus-provision-accrual-journal": {
    knowledgeId: "dk-journal-bonus-provision-accrual",
    scopeNote: "本書テーマ6-1(従業員給料・賞与)の賞与引当金、決算時の仕訳でのみ確認",
  },
  "bonus-winter-payment-journal": {
    knowledgeId: "dk-journal-bonus-winter-payment",
    scopeNote:
      "本書テーマ6-1(従業員給料・賞与)の冬期賞与支払時の仕訳でのみ確認。夏期賞与支払時は" +
      "複合仕訳のため本ケースでは未収録",
  },
};

try {
  const { cases, outOfScopeDetections } = await runJournalTopicCase({
    pdfPath,
    outputDir,
    themePage: 104,
    topicHeadingPage: 105,
    topicPages: [
      { page: 105, printedPageLabel: "76" },
      { page: 107, printedPageLabel: "78" },
    ],
    expectedTopicNumber: "6-1",
    outOfScopeReason:
      "借方または貸方が2科目以上にまたがる複合仕訳であり、既存の検出器では正しく全科目を" +
      "捉えられないため対象外とした(原則4)",
    candidateDefinitions: [
      {
        // 「(3) 社会保険料納付時」も借方・貸方が同一の値(預り金/現金預金)を
        // 持つが、複合仕訳(次行に法定福利費が続く)であるため、
        // precedingHeadingで「(4) 所得税等納付時」の方を明示的に指定する
        // (debit/creditの値だけでは2つの候補を区別できない)。
        match: (c) => {
          const debit = (c.debitAccountRaw ?? "").replace(/\s/g, "");
          const credit = (c.creditAccountRaw ?? "").replace(/\s/g, "");
          return debit === "預り金" && credit === "現金預金" && (c.precedingHeading ?? "").includes("所得税等納付時");
        },
        caseName: "income-tax-payment-journal",
        blockId: "block-income-tax-payment",
        sequenceOnPage: 1,
      },
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "賞与引当金繰入額",
        caseName: "bonus-provision-accrual-journal",
        blockId: "block-bonus-provision-accrual",
        sequenceOnPage: 2,
      },
      {
        // 「(2) 従業員賞与支払時」も借方が同じ値(賞与手当)を持つが、複合
        // 仕訳(次行に現金預金が続く)であるため、precedingHeadingで
        // 「(3) 冬期賞与支払時」の方を明示的に指定する。
        match: (c) =>
          (c.debitAccountRaw ?? "").replace(/\s/g, "") === "賞与手当" &&
          (c.precedingHeading ?? "").includes("冬期賞与支払時"),
        caseName: "bonus-winter-payment-journal",
        blockId: "block-bonus-winter-payment",
        sequenceOnPage: 3,
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
