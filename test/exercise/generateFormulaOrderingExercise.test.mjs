import { test } from "node:test";
import assert from "node:assert/strict";

import { generateFormulaOrderingExercise } from "../../src/exercise/generateFormulaOrderingExercise.mjs";

// 架空のapproved-knowledgeエントリ(教材原文は使わない)。
function fakeApprovedEntry(overrides = {}) {
  return {
    approvedAt: "2026-01-01T00:00:00.000Z",
    sourceCase: "teigakuho-definition",
    knowledge: {
      type: "DerivedKnowledge",
      id: "dk-calc-formula-teigakuho",
      knowledgeKind: "calculation_formula",
      content: {
        rawFormula: "（架空項Ａ－架空項Ｂ）×（１架空単位／架空全体単位）＝架空額",
        structure: {
          kind: "sequence",
          tokens: [
            {
              kind: "group",
              tokens: [
                { kind: "term", value: "架空項Ａ" },
                { kind: "operator", value: "－" },
                { kind: "term", value: "架空項Ｂ" },
              ],
            },
            { kind: "operator", value: "×" },
            {
              kind: "group",
              tokens: [
                {
                  kind: "fraction",
                  numerator: [{ kind: "term", value: "１架空単位" }],
                  denominator: [{ kind: "term", value: "架空全体単位" }],
                },
              ],
            },
            { kind: "operator", value: "＝" },
            { kind: "term", value: "架空額" },
          ],
        },
      },
      sourceRefs: [{ sourceBlockId: "block-teigakuho-def", role: "definition" }],
      contentConfidence: { level: "verified_from_source", note: "架空の根拠" },
      evidence: {
        byRole: { definition: 1 },
        distinctThemes: ["theme-8"],
        distinctBooks: ["book-1"],
        crossesBaseAdvanced: false,
      },
      consolidation: { state: "single_source", possibleDuplicateOf: [] },
      scopeNote: "架空のスコープノート",
      ...overrides,
    },
  };
}

test("generateFormulaOrderingExercise: knowledgeRefで元Knowledgeを追跡できる", () => {
  const exercise = generateFormulaOrderingExercise(fakeApprovedEntry());
  assert.equal(exercise.knowledgeRef.knowledgeId, "dk-calc-formula-teigakuho");
  assert.equal(exercise.knowledgeRef.approvedAt, "2026-01-01T00:00:00.000Z");
});

test("generateFormulaOrderingExercise: exerciseKindとgrading.methodが設定される", () => {
  const exercise = generateFormulaOrderingExercise(fakeApprovedEntry());
  assert.equal(exercise.exerciseKind, "formula_ordering");
  assert.equal(exercise.answer.grading.method, "exact_sequence_match");
});

test("generateFormulaOrderingExercise: トップレベル5要素が過不足なくcorrectOrderになる", () => {
  const exercise = generateFormulaOrderingExercise(fakeApprovedEntry());
  assert.equal(exercise.answer.correctOrder.length, 5);
  assert.deepEqual(exercise.answer.correctOrder, [
    "（架空項Ａ－架空項Ｂ）",
    "×",
    "（１架空単位／架空全体単位）",
    "＝",
    "架空額",
  ]);
});

test("generateFormulaOrderingExercise: correctOrderを連結するとrawFormulaに復元できる", () => {
  const entry = fakeApprovedEntry();
  const exercise = generateFormulaOrderingExercise(entry);
  assert.equal(exercise.answer.correctOrder.join(""), entry.knowledge.content.rawFormula);
});

test("generateFormulaOrderingExercise: instructionOriginでアプリ追加情報であることが分かる", () => {
  const exercise = generateFormulaOrderingExercise(fakeApprovedEntry());
  assert.equal(exercise.prompt.instructionOrigin, "app_generated");
  assert.ok(exercise.prompt.instruction.length > 0);
});

test("generateFormulaOrderingExercise: revealはrawFormulaとsourceRefsのみを持つ(解説文を含まない)", () => {
  const entry = fakeApprovedEntry();
  const exercise = generateFormulaOrderingExercise(entry);
  assert.deepEqual(Object.keys(exercise.reveal).sort(), ["rawFormula", "sourceRefs"]);
  assert.equal(exercise.reveal.rawFormula, entry.knowledge.content.rawFormula);
  assert.deepEqual(exercise.reveal.sourceRefs, entry.knowledge.sourceRefs);
});

test("generateFormulaOrderingExercise: Exercise生成によって入力knowledgeオブジェクトは変更されない", () => {
  const entry = fakeApprovedEntry();
  const before = JSON.stringify(entry);
  generateFormulaOrderingExercise(entry);
  assert.equal(JSON.stringify(entry), before);
});

test("generateFormulaOrderingExercise: 対象外のknowledge idはfail-closedで拒否する", () => {
  const entry = fakeApprovedEntry({ id: "dk-other" });
  assert.throws(() => generateFormulaOrderingExercise(entry), /対象外/);
});

test("generateFormulaOrderingExercise: 想定外のknowledgeKindはfail-closedで拒否する", () => {
  const entry = fakeApprovedEntry({ knowledgeKind: "journal_pattern" });
  assert.throws(() => generateFormulaOrderingExercise(entry), /想定外/);
});
