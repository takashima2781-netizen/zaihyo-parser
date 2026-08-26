import { test } from "node:test";
import assert from "node:assert/strict";

import { grade } from "../../src/exercise/gradingRegistry.mjs";

// 架空のExercise(教材原文は使わない)。
function fakeExercise(correctOrder, method = "exact_sequence_match") {
  return { answer: { correctOrder, grading: { method } } };
}

test("grade: 正解順序と完全一致すればtrueを返す", () => {
  const exercise = fakeExercise(["Ａ", "×", "Ｂ", "＝", "Ｃ"]);
  assert.equal(grade(["Ａ", "×", "Ｂ", "＝", "Ｃ"], exercise), true);
});

test("grade: 順序が異なればfalseを返す", () => {
  const exercise = fakeExercise(["Ａ", "×", "Ｂ", "＝", "Ｃ"]);
  assert.equal(grade(["Ｃ", "＝", "Ｂ", "×", "Ａ"], exercise), false);
});

test("grade: 要素数が異なればfalseを返す", () => {
  const exercise = fakeExercise(["Ａ", "×", "Ｂ", "＝", "Ｃ"]);
  assert.equal(grade(["Ａ", "×", "Ｂ"], exercise), false);
});

test("grade: 未対応の判定方式はfail-closedで例外を投げる", () => {
  const exercise = fakeExercise(["Ａ"], "unknown_method");
  assert.throws(() => grade(["Ａ"], exercise), /未対応の判定方式/);
});
