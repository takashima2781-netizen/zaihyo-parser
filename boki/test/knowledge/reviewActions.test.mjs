import { test } from "node:test";
import assert from "node:assert/strict";

import {
  approveCandidate,
  rejectCandidate,
  editCandidate,
} from "../../src/knowledge/reviewActions.mjs";

// 架空のcaseData(教材原文は使わない)。
function fakeCaseData(overrides = {}) {
  return {
    case: "fake-case",
    structureContext: {
      theme: { id: "theme-8", label: { number: "8", titleRaw: "架空テーマ" } },
    },
    block: { id: "block-teigakuho-def", blockKind: "formula_termbased" },
    derivedKnowledgeCandidate: {
      reviewStatus: "candidate",
      reviewedAt: null,
      reviewNote: null,
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
      },
    },
    ...overrides,
  };
}

// --- 承認 ---

test("approveCandidate: candidate -> approved に遷移し、reviewedAtが記録される", () => {
  const result = approveCandidate(fakeCaseData(), { note: "確認済み" });
  assert.equal(result.derivedKnowledgeCandidate.reviewStatus, "approved");
  assert.ok(result.derivedKnowledgeCandidate.reviewedAt);
  assert.equal(result.derivedKnowledgeCandidate.reviewNote, "確認済み");
});

test("approveCandidate: knowledge本体の内容は承認によって変わらない", () => {
  const input = fakeCaseData();
  const result = approveCandidate(input);
  assert.deepEqual(
    result.derivedKnowledgeCandidate.knowledge,
    input.derivedKnowledgeCandidate.knowledge,
  );
});

test("approveCandidate: candidate以外からの承認はfail-closedで拒否する", () => {
  const input = fakeCaseData();
  input.derivedKnowledgeCandidate.reviewStatus = "approved";
  assert.throws(() => approveCandidate(input), /不正な状態遷移/);
});

test("approveCandidate: 存在しないSourceへの参照はfail-closedで拒否する", () => {
  const input = fakeCaseData();
  input.derivedKnowledgeCandidate.knowledge.sourceRefs = [
    { sourceBlockId: "block-does-not-exist", role: "definition" },
  ];
  assert.throws(() => approveCandidate(input), /存在しないSource/);
});

// --- 除外 ---

test("rejectCandidate: candidate -> rejected に遷移し、knowledgeは削除されず残る", () => {
  const input = fakeCaseData();
  const result = rejectCandidate(input, { note: "不採用" });
  assert.equal(result.derivedKnowledgeCandidate.reviewStatus, "rejected");
  assert.equal(result.derivedKnowledgeCandidate.reviewNote, "不採用");
  assert.deepEqual(
    result.derivedKnowledgeCandidate.knowledge,
    input.derivedKnowledgeCandidate.knowledge,
  );
});

test("rejectCandidate: candidate以外からの除外はfail-closedで拒否する", () => {
  const input = fakeCaseData();
  input.derivedKnowledgeCandidate.reviewStatus = "rejected";
  assert.throws(() => rejectCandidate(input), /不正な状態遷移/);
});

// --- 修正 ---

test("editCandidate: contentConfidence/scopeNoteを更新でき、reviewStatusはcandidateのまま", () => {
  const result = editCandidate(fakeCaseData(), {
    contentConfidence: { level: "uncertain", note: "再検討が必要" },
    scopeNote: "更新後のスコープノート",
    note: "確信度を下げた",
  });
  assert.equal(result.derivedKnowledgeCandidate.reviewStatus, "candidate");
  assert.equal(result.derivedKnowledgeCandidate.knowledge.contentConfidence.level, "uncertain");
  assert.equal(result.derivedKnowledgeCandidate.knowledge.scopeNote, "更新後のスコープノート");
  assert.equal(result.derivedKnowledgeCandidate.reviewNote, "確信度を下げた");
});

test("editCandidate: evidence/consolidationはsourceRefsから再計算され、直接指定しても無視される", () => {
  const result = editCandidate(fakeCaseData(), {});
  assert.deepEqual(result.derivedKnowledgeCandidate.knowledge.evidence, {
    byRole: { definition: 1 },
    distinctThemes: ["theme-8"],
    distinctBooks: ["book-1"],
    crossesBaseAdvanced: false,
  });
  assert.deepEqual(result.derivedKnowledgeCandidate.knowledge.consolidation, {
    state: "single_source",
    possibleDuplicateOf: [],
  });
});

test("editCandidate: rawFormula/structure/sourceRefs/knowledgeKind/id/typeは変更されない(受け取る経路が無い)", () => {
  const input = fakeCaseData();
  const result = editCandidate(input, {
    contentConfidence: { level: "uncertain" },
  });
  const before = input.derivedKnowledgeCandidate.knowledge;
  const after = result.derivedKnowledgeCandidate.knowledge;
  assert.equal(after.content.rawFormula, before.content.rawFormula);
  assert.deepEqual(after.content.structure, before.content.structure);
  assert.deepEqual(after.sourceRefs, before.sourceRefs);
  assert.equal(after.knowledgeKind, before.knowledgeKind);
  assert.equal(after.id, before.id);
  assert.equal(after.type, before.type);
});

test("editCandidate: candidate以外への修正はfail-closedで拒否する", () => {
  const input = fakeCaseData();
  input.derivedKnowledgeCandidate.reviewStatus = "approved";
  assert.throws(() => editCandidate(input, { scopeNote: "x" }), /不正な状態遷移/);
});

test("editCandidate: 往復整合性が壊れる状態を人為的に作った場合はfail-closedで拒否する", () => {
  const input = fakeCaseData();
  // 通常このフィールドはeditCandidateから書き換えられないが、他の要因で
  // 壊れた状態がcaseDataとして渡された場合でも保存させないことを確認する。
  input.derivedKnowledgeCandidate.knowledge.content.rawFormula = "壊れた式";
  assert.throws(() => editCandidate(input, { scopeNote: "x" }), /往復整合性/);
});
