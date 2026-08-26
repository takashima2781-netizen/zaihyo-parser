#!/usr/bin/env node
// CLIエントリポイント: 承認済みKnowledge(M4の出力)からExercise 1件を生成する。
//
// 入力は output/knowledge/approved-knowledge.json のみ(M5設計2節のとおり、
// output/cases/ には一切触れない)。
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
  const result = buildExercisesFromApprovedKnowledge(approved);

  await mkdir(path.dirname(exercisesPath), { recursive: true });
  await writeFile(exercisesPath, JSON.stringify(result, null, 2), "utf8");

  console.log(`OK: wrote ${exercisesPath}`);
  for (const exercise of result.exercises) {
    console.log(`exercise.id: ${exercise.id}`);
    console.log(`answer.correctOrder: ${JSON.stringify(exercise.answer.correctOrder)}`);
  }
} catch (err) {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
}
