import { test } from "node:test";
import assert from "node:assert/strict";

import { processApplicationCandidates } from "../../src/parser/processApplicationCandidates.mjs";

// 架空データ(教材原文は使わない)。定義Sourceはtopic-fake-Aに属する。

function fakeDefinitionCase(sourceRefsOverride) {
  return {
    case: "fake-definition",
    block: { id: "block-fake-def", structureRef: "topic-fake-A" },
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
          distinctThemes: ["theme-fake-A"],
          distinctBooks: ["book-1"],
          crossesBaseAdvanced: false,
        },
        consolidation: { state: "single_source", possibleDuplicateOf: [] },
        scopeNote: "架空",
      },
    },
  };
}

function fakeCandidate(overrides = {}) {
  return {
    candidateId: "cand-topic-fake-A-app",
    location: { page: 1, printedPageLabel: "1", sequenceOnPage: 1 },
    structureRef: "topic-fake-A",
    parentContext: { label: "例 架空設例設", note: "架空" },
    boundaryType: "none",
    sameTypePatterns: { count: 2, note: "架空" },
    abstractDefinitionCandidate: { exists: true, sourceBlockId: "block-fake-def" },
    detection: { detectorId: "termBasedFormulaDetector", matchedLine: "架空", precedingHeading: null },
    extractionRaw: { text: "架空", tool: "pymupdf", toolVersion: "1.0", invocation: "架空" },
    sourceFaithful: "架空額×（３架空単位／７架空単位）＝架空結果",
    diag: {
      extraction: { status: "captured_differs", artifacts: [{ kind: "fraction_split", resolved: true }] },
      faithfulReconstruction: { performed: true, method: "human_reviewed", confidence: "high" },
    },
    confirmationStatus: "candidate",
    confirmationMethod: null,
    reviewedAt: null,
    reviewNote: null,
    confirmedBlockId: null,
    ...overrides,
  };
}

function fakeApplicationCase(candidates) {
  return {
    case: "fake-application",
    structureContext: {
      themeA: { id: "theme-fake-A" },
      topicA: { id: "topic-fake-A" },
      themeB: { id: "theme-fake-B" },
      topicB: { id: "topic-fake-B" },
    },
    candidates,
  };
}

test("processApplicationCandidates: 同一topicの候補は自動確定+自動統合される", () => {
  const applicationCase = fakeApplicationCase([fakeCandidate()]);
  const result = processApplicationCandidates({ applicationCase, definitionCase: fakeDefinitionCase() });

  const candidate = result.applicationCase.candidates[0];
  assert.equal(candidate.confirmationStatus, "confirmed");
  assert.equal(candidate.confirmationMethod, "auto");
  assert.equal(candidate.autoConfirmEvaluation.result, "auto_confirm");

  const { sourceRefs } = result.definitionCase.derivedKnowledgeCandidate.knowledge;
  assert.equal(sourceRefs.length, 2);
});

test("processApplicationCandidates: テーマ横断の候補は自動確定されず、candidateのまま評価根拠だけ付与される", () => {
  const applicationCase = fakeApplicationCase([
    fakeCandidate({ candidateId: "cand-topic-fake-B-app", structureRef: "topic-fake-B" }),
  ]);
  const result = processApplicationCandidates({ applicationCase, definitionCase: fakeDefinitionCase() });

  const candidate = result.applicationCase.candidates[0];
  assert.equal(candidate.confirmationStatus, "candidate");
  assert.equal(candidate.confirmationMethod, null);
  assert.equal(candidate.autoConfirmEvaluation.result, "needs_review");
  assert.equal(candidate.autoConfirmEvaluation.reason, "cross_topic");

  const { sourceRefs } = result.definitionCase.derivedKnowledgeCandidate.knowledge;
  assert.equal(sourceRefs.length, 1);
});

test("processApplicationCandidates: 既にconfirmed/rejectedの候補は再評価しない(冪等性)", () => {
  const applicationCase = fakeApplicationCase([
    fakeCandidate({ confirmationStatus: "rejected", reviewNote: "既存の却下理由" }),
  ]);
  const result = processApplicationCandidates({ applicationCase, definitionCase: fakeDefinitionCase() });
  const candidate = result.applicationCase.candidates[0];
  assert.equal(candidate.confirmationStatus, "rejected");
  assert.equal(candidate.reviewNote, "既存の却下理由");
  assert.equal(candidate.autoConfirmEvaluation, undefined);
});

test("processApplicationCandidates: 既にKnowledgeへ統合済みのSourceは再統合せず、confirmed状態だけ揃える(冪等性)", () => {
  const applicationCase = fakeApplicationCase([fakeCandidate()]);
  const alreadyIntegratedDefinition = fakeDefinitionCase([
    { sourceBlockId: "block-fake-def", role: "definition" },
    { sourceBlockId: "block-cand-topic-fake-A-app", role: "application" },
  ]);

  const result = processApplicationCandidates({
    applicationCase,
    definitionCase: alreadyIntegratedDefinition,
  });

  const candidate = result.applicationCase.candidates[0];
  assert.equal(candidate.confirmationStatus, "confirmed");
  assert.equal(candidate.confirmationMethod, "auto");
  // 再統合されていない(sourceRefsが増えていない)ことを確認
  assert.equal(result.definitionCase.derivedKnowledgeCandidate.knowledge.sourceRefs.length, 2);
});

test("processApplicationCandidates: 複数候補を同時に処理できる(1件auto_confirm・1件needs_review)", () => {
  const applicationCase = fakeApplicationCase([
    fakeCandidate(),
    fakeCandidate({ candidateId: "cand-topic-fake-B-app", structureRef: "topic-fake-B" }),
  ]);
  const result = processApplicationCandidates({ applicationCase, definitionCase: fakeDefinitionCase() });

  const [a, b] = result.applicationCase.candidates;
  assert.equal(a.confirmationStatus, "confirmed");
  assert.equal(b.confirmationStatus, "candidate");
  assert.equal(result.definitionCase.derivedKnowledgeCandidate.knowledge.sourceRefs.length, 2);
});
