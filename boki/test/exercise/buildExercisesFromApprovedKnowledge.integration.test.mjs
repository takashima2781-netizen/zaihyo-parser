import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildExercisesFromApprovedKnowledge } from "../../src/exercise/buildExercisesFromApprovedKnowledge.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const approvedKnowledgePath = path.join(rootDir, "output", "knowledge", "approved-knowledge.json");

// 実際のapproved-knowledge.json(M4でユーザーが承認した実データ)が存在する
// 場合のみ実行する。教材原文をアサーションに埋め込まない
// (`m1_minimal_parser_prototype_design.md`8-3節と同じ方針)。
const dataAvailable = existsSync(approvedKnowledgePath);

test(
  "buildExercisesFromApprovedKnowledge: 実データ(承認済みKnowledge)からExerciseを生成できる(構造的性質のみ検証)",
  { skip: !dataAvailable && "output/knowledge/approved-knowledge.json が無いためskip(先にM4で承認する)" },
  () => {
    const approved = JSON.parse(readFileSync(approvedKnowledgePath, "utf8"));
    const result = buildExercisesFromApprovedKnowledge(approved);

    // 承認済みKnowledge数は今後も増減しうるため、件数を固定値で断定しない。
    // 生成された各Exerciseが構造的な契約を満たすことだけを検証する
    // (実データの内容そのものはアサーションに埋め込まない)。
    assert.ok(result.exercises.length >= 1);

    for (const exercise of result.exercises) {
      assert.ok(["formula_ordering", "journal_ordering"].includes(exercise.exerciseKind));
      assert.equal(exercise.answer.grading.method, "exact_sequence_match");
      assert.ok(exercise.answer.correctOrder.length >= 1);
      assert.equal(exercise.answer.correctOrder.join(""), exercise.reveal.rawFormula);
      assert.equal(exercise.prompt.instructionOrigin, "app_generated");
      assert.deepEqual(Object.keys(exercise.reveal).sort(), ["rawFormula", "sourceRefs"]);
    }

    const teigakuhoExercise = result.exercises.find(
      (ex) => ex.knowledgeRef.knowledgeId === "dk-calc-formula-teigakuho",
    );
    assert.ok(teigakuhoExercise, "定額法のExerciseが含まれているはず");
    assert.equal(teigakuhoExercise.exerciseKind, "formula_ordering");
    assert.equal(teigakuhoExercise.answer.correctOrder.length, 5);
  },
);
