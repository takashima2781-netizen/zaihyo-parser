// v1.5.0(Phase 1、docs/phase1_multiblank_31_structural_investigation.md)検証専用CLI。
//
// output/exercise_view_full.json(build-drill-csv.mjs等が生成した最新の内容、読み取り専用)に対し、
// multi_blankのstructureType/subQuestionsフィールドが、意図した31件のみに・意図した形で
// 付与されていることを検証する。生成ロジック自体は一切変更せず、検証のみを行う。
//
// 確認項目:
// - schemaVersion, meta整合性 (validateSchemaShapeV1)
// - subQuestionsが意図した条件下でのみ付与されている (validateMultiBlankSubQuestions)
// - 総件数・exerciseType別件数が期待値どおり
// - independent_subquestions構造のexerciseIdが、事前に構造調査で確認した31件と完全一致
// - 31件それぞれについて、子Item本文の欠落0件・正答の欠落0件・順序不一致0件・
//   expectedAnswerとの不一致0件

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { validateSchemaShapeV1, validateMultiBlankSubQuestions } from "../exerciseView/validator.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// docs/phase1_multiblank_31_structural_investigation.md の調査で確認済みの31件。
const EXPECTED_INDEPENDENT_SUBQUESTIONS_EXERCISE_IDS = [
  "ex-multiblank-qu-question-02", "ex-multiblank-qu-question-08", "ex-multiblank-qu-question-14",
  "ex-multiblank-qu-question-42", "ex-multiblank-qu-question-53", "ex-multiblank-qu-question-56",
  "ex-multiblank-qu-question-60", "ex-multiblank-qu-question-62", "ex-multiblank-qu-question-66",
  "ex-multiblank-qu-question-85", "ex-multiblank-qu-question-105", "ex-multiblank-qu-question-113",
  "ex-multiblank-qu-question-138", "ex-multiblank-qu-question-147", "ex-multiblank-qu-question-153",
  "ex-multiblank-qu-question-169", "ex-multiblank-qu-question-174", "ex-multiblank-qu-question-187",
  "ex-multiblank-qu-question-209", "ex-multiblank-qu-question-217", "ex-multiblank-qu-question-226",
  "ex-multiblank-qu-question-230", "ex-multiblank-qu-question-245", "ex-multiblank-qu-question-248",
  "ex-multiblank-qu-question-251", "ex-multiblank-qu-question-253", "ex-multiblank-qu-question-255",
  "ex-multiblank-qu-question-258", "ex-multiblank-qu-question-260", "ex-multiblank-qu-question-264",
  "ex-multiblank-qu-question-275",
].sort();

function fail(msg) {
  console.error("NG: " + msg);
  process.exitCode = 1;
}
function ok(msg) {
  console.log("OK: " + msg);
}

function main() {
  const evPath = path.join(ROOT, "output/exercise_view_full.json");
  if (!existsSync(evPath)) {
    console.error("output/exercise_view_full.json が見つかりません。先に build-drill-csv.mjs を実行してください。");
    process.exit(1);
  }
  const exerciseView = JSON.parse(readFileSync(evPath, "utf8"));

  console.log("=== 1. schemaVersion/meta整合性 (validateSchemaShapeV1) ===");
  const shapeIssues = validateSchemaShapeV1(exerciseView);
  if (shapeIssues.length === 0) ok("違反0件");
  else { fail(`違反${shapeIssues.length}件`); console.log(JSON.stringify(shapeIssues.slice(0, 20), null, 2)); }

  console.log("=== 2. multi_blank subQuestions整合性 (validateMultiBlankSubQuestions) ===");
  const subQIssues = validateMultiBlankSubQuestions(exerciseView);
  if (subQIssues.length === 0) ok("違反0件");
  else { fail(`違反${subQIssues.length}件`); console.log(JSON.stringify(subQIssues.slice(0, 30), null, 2)); }

  console.log("=== 3. 総件数・exerciseType別件数 ===");
  const total = exerciseView.exercises.length;
  const typeCounts = {};
  for (const ex of exerciseView.exercises) typeCounts[ex.exerciseType] = (typeCounts[ex.exerciseType] ?? 0) + 1;
  const withheldTotal = exerciseView.withheldExercises.length;
  if (total === 1233) ok(`eligible総数=1233`); else fail(`eligible総数=${total}(期待値1233)`);
  if (typeCounts.single_blank === 817) ok("single_blank=817"); else fail(`single_blank=${typeCounts.single_blank}(期待値817)`);
  if (typeCounts.multi_blank === 151) ok("multi_blank=151"); else fail(`multi_blank=${typeCounts.multi_blank}(期待値151)`);
  if (typeCounts.true_false === 265) ok("true_false=265"); else fail(`true_false=${typeCounts.true_false}(期待値265)`);
  if (withheldTotal === 42) ok("withheld総数=42"); else fail(`withheld総数=${withheldTotal}(期待値42)`);

  console.log("=== 4. independent_subquestions構造の対象exerciseIdが事前調査の31件と完全一致 ===");
  const actualIds = exerciseView.exercises
    .filter((e) => e.exerciseType === "multi_blank" && e.structureType === "independent_subquestions")
    .map((e) => e.exerciseId)
    .sort();
  if (JSON.stringify(actualIds) === JSON.stringify(EXPECTED_INDEPENDENT_SUBQUESTIONS_EXERCISE_IDS)) {
    ok(`31件完全一致`);
  } else {
    fail(`不一致。実際=${actualIds.length}件`);
    const missing = EXPECTED_INDEPENDENT_SUBQUESTIONS_EXERCISE_IDS.filter((id) => !actualIds.includes(id));
    const extra = actualIds.filter((id) => !EXPECTED_INDEPENDENT_SUBQUESTIONS_EXERCISE_IDS.includes(id));
    console.log("不足:", JSON.stringify(missing));
    console.log("想定外:", JSON.stringify(extra));
  }

  console.log("=== 5. shared_body_blanks(120件)にsubQuestionsが付与されていないこと ===");
  const sharedBodyCount = exerciseView.exercises.filter((e) => e.exerciseType === "multi_blank" && e.structureType === "shared_body_blanks").length;
  const sharedBodyLeaked = exerciseView.exercises.filter((e) => e.exerciseType === "multi_blank" && e.structureType === "shared_body_blanks" && e.subQuestions !== null).length;
  if (sharedBodyCount === 120) ok("shared_body_blanks=120件"); else fail(`shared_body_blanks=${sharedBodyCount}件(期待値120)`);
  if (sharedBodyLeaked === 0) ok("shared_body_blanksへのsubQuestions混入0件"); else fail(`shared_body_blanksへのsubQuestions混入${sharedBodyLeaked}件`);

  console.log("=== 6. 31件・子Item計85件の本文/正答欠落チェック ===");
  let childCount = 0, bodyMissing = 0, answerMissing = 0;
  for (const id of actualIds) {
    const ex = exerciseView.exercises.find((e) => e.exerciseId === id);
    if (!ex || !ex.subQuestions) continue;
    for (const sq of ex.subQuestions) {
      childCount++;
      if (!sq.body?.text?.trim()) bodyMissing++;
      if (!sq.expectedAnswer?.text?.trim()) answerMissing++;
    }
  }
  if (childCount === 85) ok("子Item総数=85"); else fail(`子Item総数=${childCount}(期待値85)`);
  if (bodyMissing === 0) ok("本文欠落0件"); else fail(`本文欠落${bodyMissing}件`);
  if (answerMissing === 0) ok("正答欠落0件"); else fail(`正答欠落${answerMissing}件`);

  console.log();
  if (process.exitCode === 1) {
    console.error("=== 検証失敗: 1件以上のNGがあります ===");
  } else {
    console.log("=== 検証成功: 全項目OK ===");
  }
}

main();
