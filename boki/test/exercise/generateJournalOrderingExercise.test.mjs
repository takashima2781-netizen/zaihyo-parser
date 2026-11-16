import { test } from "node:test";
import assert from "node:assert/strict";

import { generateJournalOrderingExercise } from "../../src/exercise/generateJournalOrderingExercise.mjs";

// 架空のapproved-knowledgeエントリ(教材原文は使わない)。
function fakeApprovedEntry(overrides = {}) {
  return {
    approvedAt: "2026-01-01T00:00:00.000Z",
    sourceCase: "fake-journal-case",
    knowledge: {
      type: "DerivedKnowledge",
      id: "dk-fake-journal",
      knowledgeKind: "journal_pattern",
      content: {
        rawFormula: "(借)架空勘定Ａ×××(貸)架空勘定Ｂ×××",
        structure: {
          kind: "sequence",
          tokens: [
            { kind: "term", value: "(借)" },
            { kind: "term", value: "架空勘定Ａ" },
            { kind: "term", value: "×××" },
            { kind: "term", value: "(貸)" },
            { kind: "term", value: "架空勘定Ｂ" },
            { kind: "term", value: "×××" },
          ],
        },
      },
      sourceRefs: [{ sourceBlockId: "block-fake-journal", role: "definition" }],
      ...overrides,
    },
  };
}

test("generateJournalOrderingExercise: knowledgeRefで元Knowledgeを追跡できる", () => {
  const exercise = generateJournalOrderingExercise(fakeApprovedEntry());
  assert.equal(exercise.knowledgeRef.knowledgeId, "dk-fake-journal");
  assert.equal(exercise.knowledgeRef.approvedAt, "2026-01-01T00:00:00.000Z");
});

test("generateJournalOrderingExercise: exerciseKindとgrading.methodが設定される", () => {
  const exercise = generateJournalOrderingExercise(fakeApprovedEntry());
  assert.equal(exercise.exerciseKind, "journal_ordering");
  assert.equal(exercise.answer.grading.method, "exact_sequence_match");
});

test("generateJournalOrderingExercise: トップレベル6要素が過不足なくcorrectOrderになる", () => {
  const exercise = generateJournalOrderingExercise(fakeApprovedEntry());
  assert.deepEqual(exercise.answer.correctOrder, [
    "(借)",
    "架空勘定Ａ",
    "×××",
    "(貸)",
    "架空勘定Ｂ",
    "×××",
  ]);
});

test("generateJournalOrderingExercise: correctOrderを連結するとrawFormulaに復元できる", () => {
  const entry = fakeApprovedEntry();
  const exercise = generateJournalOrderingExercise(entry);
  assert.equal(exercise.answer.correctOrder.join(""), entry.knowledge.content.rawFormula);
});

test("generateJournalOrderingExercise: exercise.idはknowledge.idから決定的に導出される", () => {
  const exercise = generateJournalOrderingExercise(fakeApprovedEntry());
  assert.equal(exercise.id, "exercise-dk-fake-journal-journal_ordering");
});

test("generateJournalOrderingExercise: revealはrawFormulaとsourceRefsのみを持つ(解説文を含まない)", () => {
  const entry = fakeApprovedEntry();
  const exercise = generateJournalOrderingExercise(entry);
  assert.deepEqual(Object.keys(exercise.reveal).sort(), ["rawFormula", "sourceRefs"]);
});

test("generateJournalOrderingExercise: 想定外のknowledgeKindはfail-closedで拒否する", () => {
  const entry = fakeApprovedEntry({ knowledgeKind: "calculation_formula" });
  assert.throws(() => generateJournalOrderingExercise(entry), /想定外/);
});
