#!/usr/bin/env node
// CLIエントリポイント(Phase C・テーマ8-9 資本的支出と収益的支出): 資本的
// 支出時・収益的支出時の仕訳2件を確定Source+Knowledge候補として生成する。
//
// このテーマには、資本的支出と収益的支出の内訳が不明な場合の区分計算式
// (「資本的支出＝支出した額×（延長年数／延長した残存耐用年数）」「資本的
// 支出＝支出後の時価－支出前の時価」)も存在するが、いずれも被定義項が
// 左辺に来る新しい形状であり、かつ本書内でこの1箇所にのみ登場する適用範囲の
// 狭い計算技法(内訳不明という限定的な場面専用)であるため、今回は仕訳2件
// のみを対象とし、区分計算式は保留とする
// (`planning/phase_c_topic_inventory.md`参照)。
//
// また、「資本的支出時」の仕訳(借方有形固定資産、貸方現金預金)は、テーマ
// 8-1(有形固定資産)の購入時の仕訳と、sourceFaithfulが完全に同一の型に
// なる(勘定科目名まで一致)。教材上の文脈(新規取得 vs 既存資産への改良)は
// 異なるが、ドリルとして反復練習する仕訳の型自体は区別できないため、
// 別のKnowledgeとしては追加しない(CLAUDE.md原則3、`checkDuplicate
// SourceFaithful`のfail-closed検証で機械的にも検出される)。
//
// 使い方: node scripts/run-capital-revenue-expenditure-case.mjs

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runJournalTopicCase } from "../src/parser/runJournalTopicCase.mjs";
import { deriveJournalPatternKnowledgeCandidate } from "../src/knowledge/deriveJournalPatternKnowledgeCandidate.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pdfPath = path.join(rootDir, "input", "book1.pdf");
const outputDir = path.join(rootDir, "output", "cases");

const KNOWLEDGE_CONFIG = {
  "revenue-expenditure-journal": {
    knowledgeId: "dk-journal-revenue-expenditure",
    scopeNote: "本書テーマ8-9(資本的支出と収益的支出)の収益的支出時の仕訳でのみ確認",
  },
};

try {
  const { cases, outOfScopeDetections } = await runJournalTopicCase({
    pdfPath,
    outputDir,
    themePage: 150,
    topicHeadingPage: 179,
    topicPages: [{ page: 179, printedPageLabel: "150" }],
    expectedTopicNumber: "8-9",
    outOfScopeReason:
      "テーマ8-1(有形固定資産)の購入時の仕訳とsourceFaithfulが完全に同一の型のため対象外とした(原則3)",
    candidateDefinitions: [
      {
        match: (c) => (c.debitAccountRaw ?? "").replace(/\s/g, "") === "修繕費",
        caseName: "revenue-expenditure-journal",
        blockId: "block-revenue-expenditure",
        sequenceOnPage: 2,
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
