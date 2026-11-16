import { test } from "node:test";
import assert from "node:assert/strict";

import { toExerciseView } from "../../src/exercise/toExerciseView.mjs";

// 架空のExerciseを使う(教材原文は使わない)。

function fakeOrderingExercise({ id, exerciseKind, knowledgeId, tokens }) {
  return {
    type: "Exercise",
    id,
    exerciseKind,
    knowledgeRef: { knowledgeId, approvedAt: "2026-01-01T00:00:00.000Z" },
    prompt: { instruction: "並べ替えてください。", instructionOrigin: "app_generated" },
    answer: { correctOrder: tokens, grading: { method: "exact_sequence_match" } },
    reveal: { rawFormula: tokens.join(""), sourceRefs: [] },
  };
}

test("toExerciseView: journal_ordering/formula_orderingをExercise Viewのordering形式へ変換する", () => {
  const source = {
    exercises: [
      fakeOrderingExercise({
        id: "exercise-dk-a-formula_ordering",
        exerciseKind: "formula_ordering",
        knowledgeId: "dk-a",
        tokens: ["架空Ａ", "×", "架空Ｂ", "＝", "架空Ｃ"],
      }),
    ],
  };

  const { document, diagnostics } = toExerciseView(source);

  assert.equal(document.meta.schemaVersion, "exercise-view-schema-v1.8.0");
  assert.equal(document.meta.subject, "boki");
  assert.equal(document.exercises.length, 1);
  assert.deepEqual(document.withheldExercises, []);

  const ex = document.exercises[0];
  assert.equal(ex.exerciseId, "exercise-dk-a-formula_ordering");
  assert.equal(ex.exerciseType, "ordering");
  assert.deepEqual(ex.stableItemIds, ["boki:dk-a"]);
  assert.equal(ex.body.text, "並べ替えてください。");
  assert.equal(ex.orderingItems.length, 5);
  assert.deepEqual(
    ex.orderingItems.map((i) => i.text),
    ["架空Ａ", "×", "架空Ｂ", "＝", "架空Ｃ"],
  );
  assert.equal(ex.correctOrder.length, 5);

  assert.equal(diagnostics.checkedCount, 1);
  assert.equal(diagnostics.convertedCount, 1);
  assert.equal(diagnostics.unsupportedCount, 0);
});

test("toExerciseView: correctOrderがorderingItemsの元のトークン順を正しく指す(往復整合性)", () => {
  const source = {
    exercises: [
      fakeOrderingExercise({
        id: "exercise-dk-b-journal_ordering",
        exerciseKind: "journal_ordering",
        knowledgeId: "dk-b",
        tokens: ["(借)", "架空科目", "×××", "(貸)", "架空科目２", "×××"],
      }),
    ],
  };

  const { document } = toExerciseView(source);
  const ex = document.exercises[0];

  var itemById = {};
  ex.orderingItems.forEach((item) => { itemById[item.id] = item; });
  const reconstructed = ex.correctOrder.map((id) => itemById[id].text).join("");
  assert.equal(reconstructed, "(借)架空科目×××(貸)架空科目２×××");
});

test("toExerciseView: 未対応のexerciseKindはエラーにせずunsupportedへ記録して除外する", () => {
  const source = {
    exercises: [
      {
        type: "Exercise",
        id: "exercise-dk-c-unknown_kind",
        exerciseKind: "unknown_kind",
        knowledgeRef: { knowledgeId: "dk-c", approvedAt: "2026-01-01T00:00:00.000Z" },
        prompt: { instruction: "x", instructionOrigin: "app_generated" },
        answer: { correctOrder: [], grading: { method: "unknown" } },
        reveal: { rawFormula: "", sourceRefs: [] },
      },
    ],
  };

  const { document, diagnostics } = toExerciseView(source);
  assert.equal(document.exercises.length, 0);
  assert.equal(diagnostics.unsupportedCount, 1);
  assert.equal(diagnostics.unsupported[0].exerciseId, "exercise-dk-c-unknown_kind");
});

test("toExerciseView: exercisesが0件でも正常に空のドキュメントを返す", () => {
  const { document, diagnostics } = toExerciseView({ exercises: [] });
  assert.equal(document.exercises.length, 0);
  assert.equal(document.meta.exerciseCount, 0);
  assert.equal(diagnostics.checkedCount, 0);
});
