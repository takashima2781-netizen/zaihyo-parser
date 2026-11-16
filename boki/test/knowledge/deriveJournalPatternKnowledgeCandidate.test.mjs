import { test } from "node:test";
import assert from "node:assert/strict";

import { deriveJournalPatternKnowledgeCandidate } from "../../src/knowledge/deriveJournalPatternKnowledgeCandidate.mjs";

// 架空データ(教材原文は使わない)。

function fakeBlock(overrides = {}) {
  return {
    id: "block-fake-journal",
    blockKind: "journal_termbased",
    structureRef: "topic-fake-8-11",
    sourceFaithful: "(借)架空勘定Ａ×××(貸)架空勘定Ｂ×××",
    diag: {
      faithfulReconstruction: { performed: true, method: "human_reviewed", confidence: "high" },
    },
    ...overrides,
  };
}

function fakeStructureContext() {
  return { theme: { id: "theme-fake-8" } };
}

test("deriveJournalPatternKnowledgeCandidate: candidate状態のknowledgeKind:journal_patternを生成する", () => {
  const result = deriveJournalPatternKnowledgeCandidate({
    block: fakeBlock(),
    structureContext: fakeStructureContext(),
    knowledgeId: "dk-fake-journal",
    scopeNote: "架空のスコープノート",
  });

  assert.equal(result.reviewStatus, "candidate");
  assert.equal(result.knowledge.id, "dk-fake-journal");
  assert.equal(result.knowledge.knowledgeKind, "journal_pattern");
  assert.equal(result.knowledge.content.rawFormula, "(借)架空勘定Ａ×××(貸)架空勘定Ｂ×××");
  assert.equal(result.knowledge.scopeNote, "架空のスコープノート");
});

test("deriveJournalPatternKnowledgeCandidate: sourceRefsはrole:definitionでこのSource1件のみ", () => {
  const result = deriveJournalPatternKnowledgeCandidate({
    block: fakeBlock(),
    structureContext: fakeStructureContext(),
    knowledgeId: "dk-fake-journal",
    scopeNote: "架空",
  });
  assert.deepEqual(result.knowledge.sourceRefs, [
    { sourceBlockId: "block-fake-journal", role: "definition" },
  ]);
  assert.equal(result.knowledge.consolidation.state, "single_source");
});

test("deriveJournalPatternKnowledgeCandidate: 往復整合性を検証し、構造がrawFormulaを復元できる", () => {
  const result = deriveJournalPatternKnowledgeCandidate({
    block: fakeBlock(),
    structureContext: fakeStructureContext(),
    knowledgeId: "dk-fake-journal",
    scopeNote: "架空",
  });
  const tokens = result.knowledge.content.structure.tokens;
  assert.equal(tokens.map((t) => t.value).join(""), "(借)架空勘定Ａ×××(貸)架空勘定Ｂ×××");
});

test("deriveJournalPatternKnowledgeCandidate: 想定外のblockKindはfail-closedで拒否する", () => {
  assert.throws(
    () =>
      deriveJournalPatternKnowledgeCandidate({
        block: fakeBlock({ blockKind: "formula_termbased" }),
        structureContext: fakeStructureContext(),
        knowledgeId: "dk-fake-journal",
        scopeNote: "架空",
      }),
    /想定外/,
  );
});

test("deriveJournalPatternKnowledgeCandidate: 想定外の形状(仕訳パターンでない)はfail-closedで拒否する", () => {
  assert.throws(
    () =>
      deriveJournalPatternKnowledgeCandidate({
        block: fakeBlock({ sourceFaithful: "架空額×（１架空単位／架空全体単位）＝架空結果" }),
        structureContext: fakeStructureContext(),
        knowledgeId: "dk-fake-journal",
        scopeNote: "架空",
      }),
    /一致しない/,
  );
});

test("deriveJournalPatternKnowledgeCandidate: 未知のconfidence値はfail-closedで拒否する", () => {
  assert.throws(
    () =>
      deriveJournalPatternKnowledgeCandidate({
        block: fakeBlock({
          diag: { faithfulReconstruction: { performed: true, method: "human_reviewed", confidence: "medium" } },
        }),
        structureContext: fakeStructureContext(),
        knowledgeId: "dk-fake-journal",
        scopeNote: "架空",
      }),
    /伝播規則が未定義/,
  );
});
