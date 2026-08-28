#!/usr/bin/env node
// CLIエントリポイント(Phase D): boki-appのExercise(output/exercises/
// exercises.json、M5の出力)を、財表ドリル(学習エンジン、Zaihyo Parser/
// html-v2)が読み込めるExercise View JSON形式へ変換して書き出す。
//
// 財表ドリル側のコードは一切変更しない。boki-app側にこの変換スクリプトを
// 追加するだけで接続する(`planning/phase_d_investigation_and_design.md`
// 10節、統合方式A)。
//
// 入力: output/exercises/exercises.json(先に
//       node scripts/run-teigakuho-exercise.mjs 等で生成しておく必要がある)
// 出力: output/exercise-view/boki-app-exercise-view.json
//       (財表ドリルの「Exercise View JSONファイルを選択」に読み込ませる)
//
// 使い方: node scripts/export-exercise-view.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { toExerciseView } from "../src/exercise/toExerciseView.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const exercisesPath = path.join(rootDir, "output", "exercises", "exercises.json");
const outputPath = path.join(rootDir, "output", "exercise-view", "boki-app-exercise-view.json");

try {
  const exercisesData = JSON.parse(await readFile(exercisesPath, "utf8"));
  const { document, diagnostics } = toExerciseView(exercisesData);

  console.log(`確認したExercise: ${diagnostics.checkedCount}件`);
  console.log(`Exercise View形式へ変換: ${diagnostics.convertedCount}件`);
  console.log(`未対応(exact_sequence_match以外の判定方式): ${diagnostics.unsupportedCount}件`);
  for (const u of diagnostics.unsupported) {
    console.log(`  - ${u.exerciseId}(exerciseKind: ${u.exerciseKind}): ${u.reason}`);
  }

  // fail-closed: 変換後のexerciseIdがケース内で重複していないか(このスクリプト
  // 単体の不変条件)。boki-app側のExercise IDは既にKnowledge IDから決定的に
  // 導出されており一意のはずだが、変換後データを財表ドリルへ渡す前の最終確認
  // として検証する。
  const seenIds = new Set();
  const duplicateIds = [];
  for (const ex of document.exercises) {
    if (seenIds.has(ex.exerciseId)) duplicateIds.push(ex.exerciseId);
    seenIds.add(ex.exerciseId);
  }
  if (duplicateIds.length > 0) {
    console.error(`fail-closed: exerciseIdが重複しています: ${duplicateIds.join(", ")}`);
    process.exitCode = 1;
  } else {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(document, null, 2), "utf8");
    console.log(`OK: wrote ${outputPath}`);
  }
} catch (err) {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
}
