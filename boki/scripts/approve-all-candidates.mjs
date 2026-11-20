#!/usr/bin/env node
// CLIエントリポイント: 未承認のKnowledge候補（reviewStatus: "candidate"）をすべて承認する。
//
// ユーザーの指示（2026-11-20、チャット）:「簿記論の承認は、他の教材が不要としているなら不要で構いません」。
// 財表（答練・テキスト）・消費税の変換は、問題ごとの人の承認を挟まずに問題データを作っている。
// それに合わせ、簿記論も候補を1件ずつ承認する手間を省く。承認の操作は dev-viewer の「承認する」と同じ
// （`src/knowledge/reviewActions.mjs` の approveCandidate）で、承認のロジック自体は変えない。
// 同じ仕訳の型の候補が2つ以上ある（同一性の判断が要る）ものと、承認の操作が受け付けないもの
// （複数のケースの原文をまとめた Knowledge。今の approveCandidate は自分のケースの原文だけを認める）は承認しない。
//
// 使い方: node scripts/approve-all-candidates.mjs

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { approveCandidate } from "../src/knowledge/reviewActions.mjs";
import { rebuildApprovedKnowledge } from "../src/knowledge/approvedKnowledgeStore.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const casesDir = path.join(rootDir, "output", "cases");
const NOTE = "ユーザー指示(2026-11-20)により一括承認。他の教材と同じく、候補ごとの人の承認は不要とする。";

const formulaOf = (c) => (c.derivedKnowledgeCandidate?.knowledge?.content?.rawFormula ?? "").replace(/\s+/g, "");

try {
  const files = (await readdir(casesDir)).filter((f) => f.endsWith(".json"));
  const cases = [];
  for (const f of files) cases.push({ f, data: JSON.parse(await readFile(path.join(casesDir, f), "utf8")) });
  const withKnowledge = cases.filter((c) => c.data.derivedKnowledgeCandidate);
  const count = new Map();
  for (const c of withKnowledge) count.set(formulaOf(c.data), (count.get(formulaOf(c.data)) ?? 0) + 1);

  let approved = 0;
  const skipped = [];
  for (const c of withKnowledge) {
    if (c.data.derivedKnowledgeCandidate.reviewStatus !== "candidate") continue;
    if (count.get(formulaOf(c.data)) > 1) {
      skipped.push(`${c.data.case}（同じ仕訳の型の候補が2つ以上）`);
      continue;
    }
    let updated;
    try {
      updated = approveCandidate(c.data, { note: NOTE });
    } catch (err) {
      // 承認の操作が受け付けないもの（複数のケースの原文をまとめた Knowledge など）は承認しない
      skipped.push(`${c.data.case}（${err.message}）`);
      continue;
    }
    if (updated.case !== c.f.replace(/\.json$/, "")) throw new Error(`ファイル名("${c.f}")とデータのcase("${updated.case}")が一致しない(fail-closed)`);
    await writeFile(path.join(casesDir, c.f), JSON.stringify(updated, null, 2), "utf8");
    approved += 1;
  }
  console.log(`OK: approved ${approved} candidates`);
  if (skipped.length) console.log(`承認しなかった: ${skipped.join(", ")}`);
  const result = await rebuildApprovedKnowledge(rootDir);
  console.log(`OK: rebuilt approved-knowledge.json (approved count: ${result.knowledge.length})`);
} catch (err) {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
}
