// output/exercise_view_full.json を html-v2/data/exercise_view_full.json へコピーする。
// html-v2（ドリルアプリ）が起動時に自動読み込みする対象を、Exercise View生成の正本
// （output/、Git管理対象外）から更新するだけの薄いユーティリティ。
// Exercise View生成ロジック（src/exerciseView/）・html-v2側の表示/採点ロジックは一切変更しない。
//
// output/exercise_view_full.json は build-drill-csv.mjs のみが書き込む正式成果物
// （review_decisions.json のoverride反映済み）。生成ロジック単体の診断用出力
// （override無し）は output/exercise_view_full_no_override.json に分離されている
// （docs/exercise_view_full_output_separation_report.md）ため、本スクリプトが誤って
// 未反映データを読み込む経路はない。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const SRC = path.join(ROOT, "output/exercise_view_full.json");
const DEST_DIR = path.join(ROOT, "html-v2/data");
const DEST = path.join(DEST_DIR, "exercise_view_full.json");

function main() {
  if (!existsSync(SRC)) {
    console.error("見つかりません: output/exercise_view_full.json（先に `node src/cli/build-drill-csv.mjs` を実行してください）");
    process.exit(1);
  }
  const text = readFileSync(SRC, "utf8");
  const data = JSON.parse(text);
  mkdirSync(DEST_DIR, { recursive: true });
  writeFileSync(DEST, text, "utf8");
  console.log("wrote: html-v2/data/exercise_view_full.json");
  console.log(
    `  schemaVersion=${data.meta.schemaVersion} generatedAt=${data.meta.generatedAt} ` +
      `exercises=${data.exercises.length} withheld=${data.withheldExercises.length}`
  );
}

main();
