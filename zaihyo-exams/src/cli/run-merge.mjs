// 答練の問題データとテキストの「読む」問題データを、財表の問題データ（アプリ用）へ合流させる。
// output/zaihyo-exams-exercise-view.json（npm run view）・output/zaihyo-texts-exercise-view.json（npm run text-view）の
// あるものを足す。
//
// 使い方: node src/cli/run-merge.mjs [--base <file>] [--out <file>]
//   --base 土台にする財表の問題データ（既定: ../html-v2/data/exercise_view_full.json）。
//          アプリで編集して書き出したファイル（exercise_view_full.edited-*.json）を土台にするときはここで指定する。
//   --out  書き出し先（既定: ../html-v2/data/exercise_view_full.json。git 対象外）。
// 書き出し先に既にファイルがあれば、上書きの前に output/backup/ へ控えを取る。

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeExerciseViews } from "../merge/merge.mjs";
import { runExerciseViewChecks } from "../gateChecks/gateChecks.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? path.resolve(process.argv[i + 1]) : fallback;
};
const defaultData = path.resolve(root, "..", "html-v2", "data", "exercise_view_full.json");
const basePath = arg("--base", defaultData);
const outPath = arg("--out", defaultData);
const viewPaths = ["zaihyo-exams-exercise-view.json", "zaihyo-texts-exercise-view.json"].map((f) => path.join(root, "output", f)).filter((f) => existsSync(f));

if (!existsSync(basePath)) {
  console.error(`見つかりません: ${basePath}`);
  process.exit(1);
}
if (viewPaths.length === 0) {
  console.error("足す問題データがありません（先に npm run view / npm run text-view）");
  process.exit(1);
}
const base = JSON.parse(readFileSync(basePath, "utf8"));
const views = viewPaths.map((f) => JSON.parse(readFileSync(f, "utf8")));
const { merged, stats } = mergeExerciseViews(base, views);
const gate = runExerciseViewChecks(merged);
if (!gate.ok) {
  console.error("検査に失敗したため書き出しません:");
  for (const v of gate.violations.slice(0, 20)) console.error(" -", v);
  process.exit(1);
}
if (existsSync(outPath)) {
  const dir = path.join(root, "output", "backup");
  mkdirSync(dir, { recursive: true });
  const backup = path.join(dir, `${path.basename(outPath, ".json")}.${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  copyFileSync(outPath, backup);
  console.log(`控え: ${path.relative(root, backup)}`);
}
const json = JSON.stringify(merged);
writeFileSync(outPath, json);
console.log(JSON.stringify({ wrote: outPath, from: viewPaths.map((f) => path.basename(f)), ...stats, total: merged.exercises.length, MB: +(json.length / 1e6).toFixed(1) }, null, 2));
