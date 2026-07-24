// Phase 1/2A(docs/exercise_view_json_migration_plan.md, docs/phase2_html_design.md)実行CLI。
//
// 入力・出力を明示的に受け取る(暗黙の共有出力先や、直前に別CLIを実行したことを前提にしない)。
//   入力1: output/exercise_view_full.json (Exercise View本体、既存・無変更・読み取り専用)
//   入力2: output/book_structure_master_full.json (BSM本体、theme/importance解決専用・読み取り専用)
//   出力 : output/drill_exercise_view.json ほか(下記)
//
// 重要な設計方針:
// - exerciseView.exercises(=出題対象として確定済み、eligibility判定・reviewOverride反映済み)を
//   そのまま採用するだけで、選別ロジックは一切再実装しない。
// - exerciseView.withheldExercises には一切触れない(既存のレビュー基盤
//   `src/review/reviewQueue.mjs`・`src/cli/review-status-report.mjs` に任せる)。
// - Parser・既存CSV Bridge・kmCompatAdapter・build-drill-csv.mjs・BSM本体・
//   reference/current_app/index.html のいずれも書き換えない(このCLIは上記2入力の
//   読み取りと output/drill_exercise_view.json 系の書き出しのみを行う)。
// - fail closed: 1件でも検証違反があれば output/drill_exercise_view.json は書き出さない
//   (入力ファイル欠落・schemaVersion想定外・対象book欠落を含む)。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { buildDrillExerciseViewJson } from "../exerciseView/buildDrillExerciseViewJson.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// 入出力パスをコード上で明示する(すべてこの1箇所に集約)。
const EXERCISE_VIEW_INPUT_PATH = path.join(ROOT, "output/exercise_view_full.json");
const BSM_INPUT_PATH = path.join(ROOT, "output/book_structure_master_full.json");
const OUTPUT_DIR = path.join(ROOT, "output");
const DRILL_EXERCISE_VIEW_OUTPUT_PATH = path.join(OUTPUT_DIR, "drill_exercise_view.json");
const VALIDATION_OUTPUT_PATH = path.join(OUTPUT_DIR, "drill_exercise_view_validation.json");
const LOG_OUTPUT_PATH = path.join(OUTPUT_DIR, "drill_exercise_view_generation.log");

// BSMの既知のschemaVersion(2026-07-22時点、output/book_structure_master_full.json実測値)。
// 想定外の値であれば、Exercise View側との対応関係が保証できないため生成を停止する。
const EXPECTED_BSM_SCHEMA_VERSION = "book-structure-master-0.2.0-draft";

function hashFile(absPath) {
  return createHash("sha256").update(readFileSync(absPath)).digest("hex");
}
function sha256OfObject(obj) {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}
function stripGeneratedAt(doc) {
  const clone = JSON.parse(JSON.stringify(doc));
  delete clone.generatedAt;
  return clone;
}

function main() {
  const log = [];
  const record = (msg) => {
    console.log(msg);
    log.push(`[${new Date().toISOString()}] ${msg}`);
  };

  function stopWithoutOutput(reason, extra) {
    record(`=== fail closed: ${reason} ===`);
    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(
      VALIDATION_OUTPUT_PATH,
      JSON.stringify({ status: "failed", generatedAt: new Date().toISOString(), reason, ...extra }, null, 2),
      "utf8"
    );
    writeFileSync(LOG_OUTPUT_PATH, log.join("\n") + "\n", "utf8");
    console.error(`生成停止: ${reason} のため ${path.relative(ROOT, DRILL_EXERCISE_VIEW_OUTPUT_PATH)} は書き出していません(既存ファイルも上書きしていません)。`);
    process.exitCode = 1;
  }

  record("=== Step 1: 入力ファイルの存在確認 ===");
  record(`Exercise View入力: ${path.relative(ROOT, EXERCISE_VIEW_INPUT_PATH)}`);
  record(`BSM入力: ${path.relative(ROOT, BSM_INPUT_PATH)}`);
  record(`出力先: ${path.relative(ROOT, DRILL_EXERCISE_VIEW_OUTPUT_PATH)}`);
  if (!existsSync(EXERCISE_VIEW_INPUT_PATH)) {
    return stopWithoutOutput("exercise-view-input-missing", { path: path.relative(ROOT, EXERCISE_VIEW_INPUT_PATH) });
  }
  if (!existsSync(BSM_INPUT_PATH)) {
    return stopWithoutOutput("bsm-input-missing", { path: path.relative(ROOT, BSM_INPUT_PATH) });
  }

  record("=== Step 2: 入力読込(いずれも読み取り専用) ===");
  const sourceExerciseViewFileSha256 = hashFile(EXERCISE_VIEW_INPUT_PATH);
  const exerciseView = JSON.parse(readFileSync(EXERCISE_VIEW_INPUT_PATH, "utf8"));
  const bsmFileSha256 = hashFile(BSM_INPUT_PATH);
  const bsmBeforeRead = readFileSync(BSM_INPUT_PATH, "utf8");
  const bsm = JSON.parse(bsmBeforeRead);
  record(`Exercise View sha256=${sourceExerciseViewFileSha256}`);
  record(`BSM sha256=${bsmFileSha256}`);
  record(`exercises(出題対象): ${exerciseView.exercises.length}件 / withheldExercises(対象外・無変更): ${exerciseView.withheldExercises.length}件`);

  if (bsm?.meta?.schemaVersion !== EXPECTED_BSM_SCHEMA_VERSION) {
    return stopWithoutOutput("bsm-schema-version-unexpected", { expected: EXPECTED_BSM_SCHEMA_VERSION, actual: bsm?.meta?.schemaVersion ?? null });
  }
  if (!Array.isArray(bsm.books) || bsm.books.length === 0 || !bsm.books[0]) {
    return stopWithoutOutput("bsm-target-book-missing", {});
  }
  record(`BSM対象book: ${bsm.books[0].id ?? "(id無し)"}`);

  const sourceMeta = { sourceExerciseViewFile: "output/exercise_view_full.json", sourceExerciseViewFileSha256 };

  record("=== Step 3: drill_exercise_view.json 生成(決定論性確認のため2回実行) ===");
  const run1 = buildDrillExerciseViewJson(exerciseView, bsm, { generatedAt: new Date().toISOString(), source: sourceMeta });
  const run2 = buildDrillExerciseViewJson(exerciseView, bsm, { generatedAt: new Date().toISOString(), source: sourceMeta });

  // 生成処理がbsm/exerciseView入力オブジェクト自体を書き換えていないことを独立に確認する
  // (JSON生成側でExercise View/BSMの内容を書き換えていないことのユーザー指定回帰項目)。
  const evUnchanged = JSON.stringify(exerciseView) === JSON.stringify(JSON.parse(readFileSync(EXERCISE_VIEW_INPUT_PATH, "utf8")));
  const bsmUnchanged = bsmBeforeRead === readFileSync(BSM_INPUT_PATH, "utf8");
  record(`入力オブジェクト無変更確認: exerciseView=${evUnchanged}, bsm=${bsmUnchanged}`);
  if (!evUnchanged || !bsmUnchanged) {
    return stopWithoutOutput("input-file-mutated-during-generation", { evUnchanged, bsmUnchanged });
  }

  if (run1.errors.length > 0) {
    record(`検証違反: ${run1.errors.length}件`);
    for (const e of run1.errors.slice(0, 50)) record("  - " + JSON.stringify(e));
    return stopWithoutOutput("validation-errors", { errorCount: run1.errors.length, errors: run1.errors, sourceExerciseViewFileSha256, bsmFileSha256 });
  }

  const deterministic = sha256OfObject(stripGeneratedAt(run1.document)) === sha256OfObject(stripGeneratedAt(run2.document));
  record(`決定論性(generatedAt除く内容の完全一致): ${deterministic}`);
  if (!deterministic) {
    return stopWithoutOutput("non-deterministic-generation", { sourceExerciseViewFileSha256, bsmFileSha256 });
  }

  record("=== Step 4: 書き出し ===");
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(DRILL_EXERCISE_VIEW_OUTPUT_PATH, JSON.stringify(run1.document, null, 2), "utf8");
  record(`wrote: ${path.relative(ROOT, DRILL_EXERCISE_VIEW_OUTPUT_PATH)} (sha256=${hashFile(DRILL_EXERCISE_VIEW_OUTPUT_PATH)})`);

  const validationOutput = {
    status: "success",
    generatedAt: new Date().toISOString(),
    sourceExerciseViewFileSha256,
    bsmFileSha256,
    deterministic,
    outputCounts: run1.document.summary,
  };
  writeFileSync(VALIDATION_OUTPUT_PATH, JSON.stringify(validationOutput, null, 2), "utf8");
  writeFileSync(LOG_OUTPUT_PATH, log.join("\n") + "\n", "utf8");
  record(`wrote: ${path.relative(ROOT, VALIDATION_OUTPUT_PATH)}`);
  record(`wrote: ${path.relative(ROOT, LOG_OUTPUT_PATH)}`);

  console.log(JSON.stringify({ status: "success", outputCounts: run1.document.summary }, null, 2));
}

main();
