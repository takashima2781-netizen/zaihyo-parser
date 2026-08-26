import { test } from "node:test";
import assert from "node:assert/strict";

import { integrateApplicationSource } from "../../src/knowledge/integrateApplicationSource.mjs";

// 架空データ(教材原文は使わない)。

function fakeDefinitionCase(sourceRefsOverride) {
  return {
    case: "fake-definition",
    derivedKnowledgeCandidate: {
      reviewStatus: "approved",
      reviewedAt: "2026-01-01T00:00:00.000Z",
      reviewNote: null,
      knowledge: {
        type: "DerivedKnowledge",
        id: "dk-fake",
        knowledgeKind: "calculation_formula",
        content: { rawFormula: "架空の定義式", structure: { kind: "sequence", tokens: [] } },
        sourceRefs: sourceRefsOverride ?? [{ sourceBlockId: "block-fake-def", role: "definition" }],
        contentConfidence: { level: "verified_from_source", note: "架空" },
        evidence: {
          byRole: { definition: 1 },
          distinctThemes: ["theme-架空A"],
          distinctBooks: ["book-1"],
          crossesBaseAdvanced: false,
        },
        consolidation: { state: "single_source", possibleDuplicateOf: [] },
        scopeNote: "架空のスコープノート",
      },
    },
  };
}

function fakeConfirmedBlock(id = "block-fake-app") {
  return {
    type: "ContentBlock",
    id,
    blockKind: "formula_termbased",
    sourceFaithful: "架空額×（３年／７年）＝架空結果",
    provenance: { parentLabel: "例 架空設例設", relation: "extracted_from_parent" },
  };
}

test("integrateApplicationSource: sourceRefsへapplication roleが追加される", () => {
  const result = integrateApplicationSource(fakeDefinitionCase(), fakeConfirmedBlock(), "theme-架空B");
  const { sourceRefs } = result.derivedKnowledgeCandidate.knowledge;
  assert.equal(sourceRefs.length, 2);
  assert.deepEqual(sourceRefs[1], { sourceBlockId: "block-fake-app", role: "application" });
});

test("integrateApplicationSource: evidence.byRoleにapplicationが加算される", () => {
  const result = integrateApplicationSource(fakeDefinitionCase(), fakeConfirmedBlock(), "theme-架空B");
  assert.deepEqual(result.derivedKnowledgeCandidate.knowledge.evidence.byRole, {
    definition: 1,
    application: 1,
  });
});

test("integrateApplicationSource: distinctThemesに新しいテーマが追加される(重複しない)", () => {
  const result = integrateApplicationSource(fakeDefinitionCase(), fakeConfirmedBlock(), "theme-架空B");
  assert.deepEqual(result.derivedKnowledgeCandidate.knowledge.evidence.distinctThemes, [
    "theme-架空A",
    "theme-架空B",
  ]);
});

test("integrateApplicationSource: consolidation.stateがsingle_source→merged_confirmedになる", () => {
  const result = integrateApplicationSource(fakeDefinitionCase(), fakeConfirmedBlock(), "theme-架空B");
  assert.equal(result.derivedKnowledgeCandidate.knowledge.consolidation.state, "merged_confirmed");
});

test("integrateApplicationSource: content(rawFormula/structure)は変更されない", () => {
  const input = fakeDefinitionCase();
  const result = integrateApplicationSource(input, fakeConfirmedBlock(), "theme-架空B");
  assert.deepEqual(
    result.derivedKnowledgeCandidate.knowledge.content,
    input.derivedKnowledgeCandidate.knowledge.content,
  );
});

test("integrateApplicationSource: reviewStatus(承認状態)は変更されない", () => {
  const result = integrateApplicationSource(fakeDefinitionCase(), fakeConfirmedBlock(), "theme-架空B");
  assert.equal(result.derivedKnowledgeCandidate.reviewStatus, "approved");
  assert.equal(result.derivedKnowledgeCandidate.reviewedAt, "2026-01-01T00:00:00.000Z");
});

test("integrateApplicationSource: 同じSourceを二重に統合しようとするとfail-closedで拒否する", () => {
  const alreadyIntegrated = fakeDefinitionCase([
    { sourceBlockId: "block-fake-def", role: "definition" },
    { sourceBlockId: "block-fake-app", role: "application" },
  ]);
  assert.throws(
    () => integrateApplicationSource(alreadyIntegrated, fakeConfirmedBlock(), "theme-架空B"),
    /既に.*統合済み/,
  );
});

test("integrateApplicationSource: 2件目のapplicationを追加すると累積する", () => {
  const first = integrateApplicationSource(fakeDefinitionCase(), fakeConfirmedBlock("block-fake-app-1"), "theme-架空B");
  const second = integrateApplicationSource(first, fakeConfirmedBlock("block-fake-app-2"), "theme-架空C");
  const { sourceRefs, evidence } = second.derivedKnowledgeCandidate.knowledge;
  assert.equal(sourceRefs.length, 3);
  assert.deepEqual(evidence.byRole, { definition: 1, application: 2 });
  assert.deepEqual(evidence.distinctThemes, ["theme-架空A", "theme-架空B", "theme-架空C"]);
});
