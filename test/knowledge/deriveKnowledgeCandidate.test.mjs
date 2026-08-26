import { test } from "node:test";
import assert from "node:assert/strict";

import { deriveTeigakuhoKnowledgeCandidate } from "../../src/knowledge/deriveKnowledgeCandidate.mjs";

// 架空のConfirmed Sourceを使う(教材原文は使わない)。
function fakeConfirmedCase({ block: blockOverrides = {} } = {}) {
  return {
    structureContext: {
      theme: { id: "theme-8", label: { number: "8", titleRaw: "架空テーマ" } },
      topic: { id: "topic-8-2", label: { number: "8-2", titleRaw: "架空論点" } },
    },
    block: {
      id: "block-teigakuho-def",
      blockKind: "formula_termbased",
      sourceFaithful: "（架空項Ａ－架空項Ｂ）×（１架空単位／架空全体単位）＝架空額",
      diag: {
        faithfulReconstruction: { performed: true, method: "human_reviewed", confidence: "high" },
      },
      ...blockOverrides,
    },
  };
}

test("deriveTeigakuhoKnowledgeCandidate: reviewStatusがknowledge本体の外側にある", () => {
  const result = deriveTeigakuhoKnowledgeCandidate(fakeConfirmedCase());
  assert.equal(result.reviewStatus, "candidate");
  assert.ok(result.knowledge);
  assert.equal("reviewStatus" in result.knowledge, false);
});

test("deriveTeigakuhoKnowledgeCandidate: knowledgeKindはcalculation_formula", () => {
  const result = deriveTeigakuhoKnowledgeCandidate(fakeConfirmedCase());
  assert.equal(result.knowledge.knowledgeKind, "calculation_formula");
});

test("deriveTeigakuhoKnowledgeCandidate: content.rawFormulaはsourceFaithfulと完全一致する", () => {
  const input = fakeConfirmedCase();
  const result = deriveTeigakuhoKnowledgeCandidate(input);
  assert.equal(result.knowledge.content.rawFormula, input.block.sourceFaithful);
});

test("deriveTeigakuhoKnowledgeCandidate: sourceRefsがSourceをrole=definitionで参照する", () => {
  const result = deriveTeigakuhoKnowledgeCandidate(fakeConfirmedCase());
  assert.deepEqual(result.knowledge.sourceRefs, [
    { sourceBlockId: "block-teigakuho-def", role: "definition" },
  ]);
});

test("deriveTeigakuhoKnowledgeCandidate: 3軸(confidence/evidence/consolidation)が既存設計どおり", () => {
  const result = deriveTeigakuhoKnowledgeCandidate(fakeConfirmedCase());
  assert.equal(result.knowledge.contentConfidence.level, "verified_from_source");
  assert.deepEqual(result.knowledge.evidence.byRole, { definition: 1 });
  assert.deepEqual(result.knowledge.evidence.distinctThemes, ["theme-8"]);
  assert.equal(result.knowledge.evidence.crossesBaseAdvanced, false);
  assert.equal(result.knowledge.consolidation.state, "single_source");
  assert.deepEqual(result.knowledge.consolidation.possibleDuplicateOf, []);
});

test("deriveTeigakuhoKnowledgeCandidate: 対象外のblockIdはfail-closedで拒否する", () => {
  const input = fakeConfirmedCase({ block: { id: "block-other" } });
  assert.throws(() => deriveTeigakuhoKnowledgeCandidate(input), /対象外/);
});

test("deriveTeigakuhoKnowledgeCandidate: 想定外のblockKindはfail-closedで拒否する", () => {
  const input = fakeConfirmedCase({ block: { blockKind: "journal_template" } });
  assert.throws(() => deriveTeigakuhoKnowledgeCandidate(input), /想定外/);
});

test("deriveTeigakuhoKnowledgeCandidate: 未定義のconfidence値はfail-closedで拒否する(推測しない)", () => {
  const input = fakeConfirmedCase();
  input.block.diag.faithfulReconstruction.confidence = "medium";
  assert.throws(() => deriveTeigakuhoKnowledgeCandidate(input), /伝播規則が未定義/);
});

test("deriveTeigakuhoKnowledgeCandidate: 想定外の式形状はfail-closedで拒否する(往復整合性の前段)", () => {
  const input = fakeConfirmedCase();
  input.block.sourceFaithful = "架空額＝架空項Ａ＋架空項Ｂ";
  assert.throws(() => deriveTeigakuhoKnowledgeCandidate(input));
});
