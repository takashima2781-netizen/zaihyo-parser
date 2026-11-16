import { test } from "node:test";
import assert from "node:assert/strict";

import { buildExercisesFromApprovedKnowledge } from "../../src/exercise/buildExercisesFromApprovedKnowledge.mjs";

// 架空データ(教材原文は使わない)。

function fakeKnowledge(overrides = {}) {
  return {
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
    ...overrides,
  };
}

function approvedEntry(knowledgeOverrides = {}, entryOverrides = {}) {
  return {
    approvedAt: "2026-01-01T00:00:00.000Z",
    sourceCase: "teigakuho-definition",
    knowledge: fakeKnowledge(knowledgeOverrides),
    ...entryOverrides,
  };
}

// 実際のformula_ordering generatorとは無関係に、レジストリの走査ロジック
// (N件処理・未対応/失敗の切り分け・複数generator登録)だけを検証するための
// 架空generator群。

function fakeSupportedGenerator(exerciseKind = "fake_kind_exercise") {
  return {
    exerciseKind,
    supports: (knowledge) => knowledge.knowledgeKind === "fake_supported_kind",
    generate: (entry) => ({
      type: "Exercise",
      id: `exercise-${entry.knowledge.id}-${exerciseKind}`,
      exerciseKind,
      knowledgeRef: { knowledgeId: entry.knowledge.id, approvedAt: entry.approvedAt },
    }),
  };
}

function fakeFailingGenerator() {
  return {
    exerciseKind: "always_fails",
    supports: (knowledge) => knowledge.knowledgeKind === "fake_failing_kind",
    generate: () => {
      throw new Error("架空の生成失敗(テスト用)");
    },
  };
}

test("buildExercisesFromApprovedKnowledge: approved Knowledgeが0件ならexercisesも0件、エラーにならない", () => {
  const result = buildExercisesFromApprovedKnowledge({ knowledge: [] });
  assert.deepEqual(result.exercises, []);
  assert.equal(result.diagnostics.checkedCount, 0);
  assert.equal(result.diagnostics.generatedCount, 0);
  assert.equal(result.diagnostics.unsupportedCount, 0);
  assert.equal(result.diagnostics.failedCount, 0);
});

test("buildExercisesFromApprovedKnowledge: 対応するgeneratorが無いKnowledgeはエラーにせず「未対応」として記録する", () => {
  const result = buildExercisesFromApprovedKnowledge(
    { knowledge: [approvedEntry({ knowledgeKind: "journal_pattern", id: "dk-未対応" })] },
    { generators: [fakeSupportedGenerator()] },
  );
  assert.deepEqual(result.exercises, []);
  assert.equal(result.diagnostics.checkedCount, 1);
  assert.equal(result.diagnostics.unsupportedCount, 1);
  assert.equal(result.diagnostics.unsupported[0].knowledgeId, "dk-未対応");
  assert.equal(result.diagnostics.unsupported[0].knowledgeKind, "journal_pattern");
  assert.match(result.diagnostics.unsupported[0].reason, /対応するExercise generator/);
});

test("buildExercisesFromApprovedKnowledge: 承認済みKnowledgeが複数件あれば全件を走査し、対応するものだけExerciseを生成する", () => {
  const entries = [
    approvedEntry({ id: "dk-A", knowledgeKind: "fake_supported_kind" }),
    approvedEntry({ id: "dk-B", knowledgeKind: "fake_supported_kind" }),
    approvedEntry({ id: "dk-C", knowledgeKind: "journal_pattern" }), // 未対応
  ];
  const result = buildExercisesFromApprovedKnowledge(
    { knowledge: entries },
    { generators: [fakeSupportedGenerator()] },
  );
  assert.equal(result.diagnostics.checkedCount, 3);
  assert.equal(result.exercises.length, 2);
  assert.deepEqual(
    result.exercises.map((e) => e.knowledgeRef.knowledgeId).sort(),
    ["dk-A", "dk-B"],
  );
  assert.equal(result.diagnostics.generatedCount, 2);
  assert.equal(result.diagnostics.unsupportedCount, 1);
  assert.equal(result.diagnostics.unsupported[0].knowledgeId, "dk-C");
});

test("buildExercisesFromApprovedKnowledge: generatorが失敗したKnowledgeは「失敗」として記録し、未対応とは区別する", () => {
  const entries = [
    approvedEntry({ id: "dk-A", knowledgeKind: "fake_supported_kind" }),
    approvedEntry({ id: "dk-B", knowledgeKind: "fake_failing_kind" }),
  ];
  const result = buildExercisesFromApprovedKnowledge(
    { knowledge: entries },
    { generators: [fakeSupportedGenerator(), fakeFailingGenerator()] },
  );
  assert.equal(result.diagnostics.checkedCount, 2);
  assert.equal(result.exercises.length, 1);
  assert.equal(result.diagnostics.unsupportedCount, 0); // dk-Bはsupportsには一致した(未対応ではない)
  assert.equal(result.diagnostics.failedCount, 1);
  assert.equal(result.diagnostics.failed[0].knowledgeId, "dk-B");
  assert.match(result.diagnostics.failed[0].error, /架空の生成失敗/);
});

test("buildExercisesFromApprovedKnowledge: 同一Knowledgeに複数generatorが登録されていれば、両方から生成する(将来の1 Knowledge→複数Exercise拡張を妨げない)", () => {
  const entries = [approvedEntry({ id: "dk-A", knowledgeKind: "fake_supported_kind" })];
  const result = buildExercisesFromApprovedKnowledge(
    { knowledge: entries },
    { generators: [fakeSupportedGenerator("kind_one"), fakeSupportedGenerator("kind_two")] },
  );
  assert.equal(result.exercises.length, 2);
  assert.deepEqual(
    result.exercises.map((e) => e.exerciseKind).sort(),
    ["kind_one", "kind_two"],
  );
});

test("buildExercisesFromApprovedKnowledge: 同じ入力から再生成しても安定した結果になる(exercise IDが決定的)", () => {
  const entries = [approvedEntry({ id: "dk-A", knowledgeKind: "fake_supported_kind" })];
  const first = buildExercisesFromApprovedKnowledge({ knowledge: entries }, { generators: [fakeSupportedGenerator()] });
  const second = buildExercisesFromApprovedKnowledge({ knowledge: entries }, { generators: [fakeSupportedGenerator()] });
  assert.deepEqual(first.exercises, second.exercises);
});

test("buildExercisesFromApprovedKnowledge: 実際のレジストリ(デフォルト引数)でcalculation_formula Knowledgeから1件生成できる", () => {
  const result = buildExercisesFromApprovedKnowledge({ knowledge: [approvedEntry()] });
  assert.equal(result.exercises.length, 1);
  assert.equal(result.exercises[0].knowledgeRef.knowledgeId, "dk-calc-formula-teigakuho");
  assert.equal(result.diagnostics.unsupportedCount, 0);
  assert.equal(result.diagnostics.failedCount, 0);
});

test("buildExercisesFromApprovedKnowledge: 入力データは変更しない", () => {
  const entries = [approvedEntry({ id: "dk-A", knowledgeKind: "fake_supported_kind" })];
  const before = JSON.stringify(entries);
  buildExercisesFromApprovedKnowledge({ knowledge: entries }, { generators: [fakeSupportedGenerator()] });
  assert.equal(JSON.stringify(entries), before);
});
