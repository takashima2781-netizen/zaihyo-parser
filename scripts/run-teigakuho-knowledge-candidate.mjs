#!/usr/bin/env node
// CLIエントリポイント: 定額法の確定Source(M1の出力)からDerived Knowledge
// 候補を1件生成し、同じケースファイルへ追記する。
//
// 使い方: node scripts/run-teigakuho-case.mjs         (M1、先に実行しておくこと)
//         node scripts/run-teigakuho-knowledge-candidate.mjs  (M2、このファイル)

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { deriveTeigakuhoKnowledgeCandidate } from "../src/knowledge/deriveKnowledgeCandidate.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const casePath = path.join(rootDir, "output", "cases", "teigakuho-definition.json");

try {
  const raw = await readFile(casePath, "utf8");
  const data = JSON.parse(raw);

  const derivedKnowledgeCandidate = deriveTeigakuhoKnowledgeCandidate(data);
  data.derivedKnowledgeCandidate = derivedKnowledgeCandidate;

  await writeFile(casePath, JSON.stringify(data, null, 2), "utf8");
  console.log(`OK: updated ${casePath} with derivedKnowledgeCandidate`);
  console.log(`reviewStatus: ${derivedKnowledgeCandidate.reviewStatus}`);
  console.log(`rawFormula:   ${derivedKnowledgeCandidate.knowledge.content.rawFormula}`);
} catch (err) {
  console.error("FAILED:", err.message);
  console.error(
    `output/cases/teigakuho-definition.json が存在するか確認してください` +
      `(先に node scripts/run-teigakuho-case.mjs を実行する必要があります)。`,
  );
  process.exitCode = 1;
}
