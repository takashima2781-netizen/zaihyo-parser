// 教材構造（output/*.structure.json）から、学習アプリ用の問題データを作る。
//
// 使い方: node src/cli/run-exercise-view.mjs
//   → output/shohizei-exercise-view.json
//   → ../html-v2/data/shohizei/exercise_view.json（ローカルのアプリが自動で読む。git 対象外）
// 公開サイトには問題データを載せない。iPhone では、このファイルを一度選んで読み込む。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildShohizeiExerciseView } from "../exerciseView/buildExerciseView.mjs";
import { runGateChecks } from "../gateChecks/gateChecks.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = (name) => path.join(root, "output", name);
const read = (name) => JSON.parse(readFileSync(out(name), "utf8"));

// 範囲の画面に出す本の名前（教材の名前の書き方そのものではなく、画面用の短い呼び名）。
const BOOK_TITLES = { "training-basic-1": "トレーニング 基礎M・速修 No.1" };

const trainings = ["training-basic-1"].filter((b) => existsSync(out(`${b}.structure.json`))).map((b) => read(`${b}.structure.json`));
const theories = [1].filter((n) => existsSync(out(`theory-master-theme${n}.structure.json`))).map((n) => read(`theory-master-theme${n}.structure.json`));
if (trainings.length + theories.length === 0) {
  console.error("教材構造がありません。先に npm run training / npm run theory を実行してください。");
  process.exit(1);
}

const view = buildShohizeiExerciseView({ trainings, theories, bookTitles: BOOK_TITLES });
const gate = runGateChecks(view);
const ids = new Set();
const dupKeys = view.exercises.filter((e) => (ids.has(e.stableItemIds[0] + e.exerciseType) ? true : (ids.add(e.stableItemIds[0] + e.exerciseType), false)));
if (!gate.ok || dupKeys.length) {
  console.error("検査に失敗したため書き出しません:", gate.violations, dupKeys.map((e) => e.exerciseId));
  process.exit(1);
}
const text = JSON.stringify(view);
writeFileSync(out("shohizei-exercise-view.json"), text);
const appData = path.join(root, "..", "html-v2", "data", "shohizei");
mkdirSync(appData, { recursive: true });
writeFileSync(path.join(appData, "exercise_view.json"), text);

const byType = {};
for (const e of view.exercises) byType[e.exerciseType] = (byType[e.exerciseType] ?? 0) + 1;
const diag = {};
for (const d of view.diagnostics) diag[d.reason] = (diag[d.reason] ?? 0) + 1;
console.log(JSON.stringify({ exercises: view.exercises.length, byType, diagnostics: diag, bytes: text.length }, null, 2));
