#!/usr/bin/env node
// CLIエントリポイント: 承認済みKnowledge全件(M4の出力)から、対応する
// Exercise generatorが登録されているものだけExerciseを生成する。
//
// 対応するgeneratorが無いKnowledgeは正常な「未対応」として扱い、
// エラーにはしない。一方、supportsが対応可能と判定したのに実際の生成に
// 失敗したKnowledgeが1件でもあれば、fail-closedでexercises.jsonを
// 書き換えずに終了する(CLAUDE.mdのgateChecks方針と同じ考え方)。
//
// 入力は output/knowledge/approved-knowledge.json のみ(M5設計2節のとおり、
// output/cases/ には一切触れない)。診断情報(確認件数・生成件数・未対応/
// 失敗の内訳)はexercises.json本体には書き込まず、標準出力にのみ表示する。
//
// 使い方: node scripts/run-teigakuho-exercise.mjs
//         (先に node scripts/run-teigakuho-knowledge-candidate.mjs で承認まで
//          済ませておく必要がある)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildExercisesFromApprovedKnowledge } from "../src/exercise/buildExercisesFromApprovedKnowledge.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const approvedKnowledgePath = path.join(
  rootDir,
  "output",
  "knowledge",
  "approved-knowledge.json",
);
const exercisesPath = path.join(rootDir, "output", "exercises", "exercises.json");

try {
  const approved = JSON.parse(await readFile(approvedKnowledgePath, "utf8"));
  const { exercises, diagnostics } = buildExercisesFromApprovedKnowledge(approved);

  console.log(`確認したapproved Knowledge: ${diagnostics.checkedCount}件`);
  console.log(`Exercise生成: ${diagnostics.generatedCount}件`);
  for (const g of diagnostics.generated) {
    console.log(`  - ${g.knowledgeId} -> ${g.exerciseId}(exerciseKind: ${g.exerciseKind})`);
  }
  console.log(`未対応(対応するgeneratorが無い): ${diagnostics.unsupportedCount}件`);
  for (const u of diagnostics.unsupported) {
    console.log(`  - ${u.knowledgeId}(knowledgeKind: ${u.knowledgeKind}): ${u.reason}`);
  }
  console.log(`生成失敗: ${diagnostics.failedCount}件`);
  for (const f of diagnostics.failed) {
    console.log(`  - ${f.knowledgeId}(exerciseKind: ${f.exerciseKind}): ${f.error}`);
  }

  if (diagnostics.failedCount > 0) {
    console.error(
      "生成に失敗したKnowledgeがあるため、fail-closedでexercises.jsonを書き換えません。",
    );
    process.exitCode = 1;
  } else {
    await mkdir(path.dirname(exercisesPath), { recursive: true });
    await writeFile(exercisesPath, JSON.stringify({ exercises }, null, 2), "utf8");
    console.log(`OK: wrote ${exercisesPath}`);
  }
} catch (err) {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
}
