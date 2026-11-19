// 教材構造（output/<setId>.structure.json）→ 答練の問題データ（output/zaihyo-exams-exercise-view.json）。
//
// 使い方: node src/cli/run-exercise-view.mjs [setId ...]   （省略時は src/sets.mjs の全回のうち教材構造があるもの）
// 財表の問題データ（アプリ用）へ入れるのは run-merge.mjs。

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildExamExercises, GENERATOR, SCHEMA_VERSION } from "../exerciseView/buildExerciseView.mjs";
import { runExerciseViewChecks } from "../gateChecks/gateChecks.mjs";
import { SETS } from "../sets.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SETS);
const exercises = [];
const diagnostics = [];
const perSet = {};
for (const id of ids) {
  const file = path.join(root, "output", `${id}.structure.json`);
  if (!existsSync(file)) {
    console.error(`教材構造がありません（先に npm run exam -- ${id}）: ${file}`);
    continue;
  }
  const structure = JSON.parse(readFileSync(file, "utf8"));
  const diag = [];
  const ex = buildExamExercises(structure, { diag });
  exercises.push(...ex);
  diagnostics.push(...diag.map((d) => ({ set: id, ...d })));
  perSet[id] = { exercises: ex.length, byType: countBy(ex, (e) => e.exerciseType), diagnostics: countBy(diag, (d) => d.reason) };
}

const view = {
  meta: {
    schemaVersion: SCHEMA_VERSION,
    subject: "zaihyo",
    status: "zaihyo-exams-generated-draft",
    generatedAt: new Date().toISOString(),
    generator: GENERATOR,
    displayText: "whitespace-collapsed-rows-joined",
    sets: ids,
    exerciseCount: exercises.length,
    withheldExerciseCount: 0,
  },
  exercises,
  withheldExercises: [],
  diagnostics,
};
const gate = runExerciseViewChecks(view);
if (!gate.ok) {
  console.error("検査に失敗したため書き出しません:");
  for (const v of gate.violations) console.error(" -", v);
  process.exit(1);
}
writeFileSync(path.join(root, "output", "zaihyo-exams-exercise-view.json"), JSON.stringify(view, null, 2));
console.log(JSON.stringify({ exercises: exercises.length, byType: countBy(exercises, (e) => e.exerciseType), perSet }, null, 2));

function countBy(arr, f) {
  const o = {};
  for (const x of arr) o[f(x)] = (o[f(x)] ?? 0) + 1;
  return o;
}
