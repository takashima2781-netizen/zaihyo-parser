#!/usr/bin/env node
// CLIエントリポイント(Phase E): journal_pattern Knowledge候補6件を、
// ユーザーの承認判断(2026-08-28、チャットでの明示的な指示)にもとづき
// 一括で承認する。開発用確認UI(dev-viewer)の「承認する」ボタンを押すのと
// 同じ操作(`src/knowledge/reviewActions.mjs`のapproveCandidate)を、
// 6件についてCLIから実行するだけで、承認ロジック自体は変更しない。
//
// ユーザーの明示的な指示: #3(約束手形の振出人)・#5(為替手形の名宛人)、
// および#4(約束手形の名宛人)・#6(為替手形の指図人)は、仕訳の型(勘定科目・
// 構造)が同一であっても、学習対象となる状況・当事者の立場が異なるため
// 統合せず、6件とも別のKnowledgeとして承認する
// (CLAUDE.md「Knowledgeの同一性判断」節参照)。
//
// 使い方: node scripts/approve-journal-pattern-candidates.mjs

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { approveCandidate } from "../src/knowledge/reviewActions.mjs";
import { rebuildApprovedKnowledge } from "../src/knowledge/approvedKnowledgeStore.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const casesDir = path.join(rootDir, "output", "cases");

const CASE_NAMES = [
  "intangible-journal-acquisition",
  "intangible-journal-amortization",
  "promissory-note-drawer-journal",
  "promissory-note-payee-journal",
  "exchange-bill-payee-journal",
  "exchange-bill-remittee-journal",
];

const APPROVE_NOTE =
  "ユーザー承認(2026-08-28)。#3・#5、#4・#6は仕訳の型が同一だが、学習対象となる" +
  "状況・当事者の立場が異なるため統合せず別Knowledgeとして承認。";

try {
  for (const caseName of CASE_NAMES) {
    const casePath = path.join(casesDir, `${caseName}.json`);
    const current = JSON.parse(await readFile(casePath, "utf8"));
    const updated = approveCandidate(current, { note: APPROVE_NOTE });
    if (updated.case !== caseName) {
      throw new Error(`書き込み先("${caseName}")とデータ自身のcaseフィールドが一致しない(fail-closed)`);
    }
    await writeFile(casePath, JSON.stringify(updated, null, 2), "utf8");
    console.log(`OK: approved ${caseName} (knowledgeId: ${updated.derivedKnowledgeCandidate.knowledge.id})`);
  }

  const result = await rebuildApprovedKnowledge(rootDir);
  console.log(`OK: rebuilt approved-knowledge.json (approved count: ${result.knowledge.length})`);
} catch (err) {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
}
