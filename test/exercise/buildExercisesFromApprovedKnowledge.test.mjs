import { test } from "node:test";
import assert from "node:assert/strict";

import { buildExercisesFromApprovedKnowledge } from "../../src/exercise/buildExercisesFromApprovedKnowledge.mjs";

function fakeKnowledge() {
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
  };
}

test("buildExercisesFromApprovedKnowledge: approved-knowledge.jsonに対象Knowledgeがあれば1件生成する", () => {
  const result = buildExercisesFromApprovedKnowledge({
    knowledge: [
      { approvedAt: "2026-01-01T00:00:00.000Z", sourceCase: "teigakuho-definition", knowledge: fakeKnowledge() },
    ],
  });
  assert.equal(result.exercises.length, 1);
  assert.equal(result.exercises[0].knowledgeRef.knowledgeId, "dk-calc-formula-teigakuho");
});

// candidate/rejectedは、そもそもapproved-knowledge.json(M4の派生ビュー)に
// 含まれない(`m4_review_workflow_design.md`6-2節)。したがって、この関数へ
// candidate/rejectedのKnowledgeが渡されること自体が無い、という設計上の
// 保証を、"approved-knowledge.jsonに対象Knowledgeが無い場合"として確認する。
test("buildExercisesFromApprovedKnowledge: 対象KnowledgeがapprovedにいなければExerciseを生成しない(fail-closed)", () => {
  assert.throws(
    () => buildExercisesFromApprovedKnowledge({ knowledge: [] }),
    /見つからない/,
  );
});

test("buildExercisesFromApprovedKnowledge: 別のKnowledgeしか無い場合もExerciseを生成しない(fail-closed)", () => {
  const otherKnowledge = { ...fakeKnowledge(), id: "dk-other" };
  assert.throws(
    () =>
      buildExercisesFromApprovedKnowledge({
        knowledge: [{ approvedAt: "2026-01-01T00:00:00.000Z", sourceCase: "other-case", knowledge: otherKnowledge }],
      }),
    /見つからない/,
  );
});
