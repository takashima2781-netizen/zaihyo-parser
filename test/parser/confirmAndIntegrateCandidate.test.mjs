import { test } from "node:test";
import assert from "node:assert/strict";

import { confirmAndIntegrateCandidate } from "../../src/parser/confirmAndIntegrateCandidate.mjs";

// 架空データ(教材原文は使わない)。

function fakeApplicationCase(overrides = {}) {
  return {
    case: "fake-application",
    structureContext: {
      themeA: { id: "theme-fake-A" },
      topicA: { id: "topic-fake-A" },
      themeB: { id: "theme-fake-B" },
      topicB: { id: "topic-fake-B" },
    },
    candidates: [
      {
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
          extraction: { status: "captured_differs", artifacts: [] },
          faithfulReconstruction: { performed: true, method: "human_reviewed", confidence: "high" },
        },
        confirmationStatus: "candidate",
        confirmationMethod: null,
        reviewedAt: null,
        reviewNote: null,
        confirmedBlockId: null,
        ...overrides,
      },
    ],
  };
}

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

test("confirmAndIntegrateCandidate: 候補を確定し、themeAの候補としてKnowledgeへ統合する", () => {
  const result = confirmAndIntegrateCandidate({
    applicationCase: fakeApplicationCase(),
    definitionCase: fakeDefinitionCase(),
    candidateId: "cand-topic-fake-A-app",
    method: "auto",
    note: "テスト用",
  });

  const candidate = result.applicationCase.candidates[0];
  assert.equal(candidate.confirmationStatus, "confirmed");
  assert.equal(candidate.confirmationMethod, "auto");
  assert.equal(candidate.confirmedBlockId, "block-cand-topic-fake-A-app");

  const { knowledge } = result.definitionCase.derivedKnowledgeCandidate;
  assert.equal(knowledge.sourceRefs.length, 2);
  assert.deepEqual(knowledge.sourceRefs[1], {
    sourceBlockId: "block-cand-topic-fake-A-app",
    role: "application",
  });
  // 定義と同一topic(themeA)の候補なので、distinctThemesは増えない
  assert.deepEqual(knowledge.evidence.distinctThemes, ["theme-fake-A"]);
});

test("confirmAndIntegrateCandidate: topicBの候補の場合はthemeBとして統合する", () => {
  const applicationCase = fakeApplicationCase({
    candidateId: "cand-topic-fake-B-app",
    structureRef: "topic-fake-B",
  });
  const result = confirmAndIntegrateCandidate({
    applicationCase,
    definitionCase: fakeDefinitionCase(),
    candidateId: "cand-topic-fake-B-app",
    method: "human_reviewed",
  });
  assert.deepEqual(result.definitionCase.derivedKnowledgeCandidate.knowledge.evidence.distinctThemes, [
    "theme-fake-A",
    "theme-fake-B",
  ]);
});

test("confirmAndIntegrateCandidate: content(rawFormula/structure)は変更しない", () => {
  const definitionCase = fakeDefinitionCase();
  const result = confirmAndIntegrateCandidate({
    applicationCase: fakeApplicationCase(),
    definitionCase,
    candidateId: "cand-topic-fake-A-app",
    method: "auto",
  });
  assert.deepEqual(
    result.definitionCase.derivedKnowledgeCandidate.knowledge.content,
    definitionCase.derivedKnowledgeCandidate.knowledge.content,
  );
});

test("confirmAndIntegrateCandidate: reviewStatus(M4の承認状態)は変更しない", () => {
  const result = confirmAndIntegrateCandidate({
    applicationCase: fakeApplicationCase(),
    definitionCase: fakeDefinitionCase(),
    candidateId: "cand-topic-fake-A-app",
    method: "auto",
  });
  assert.equal(result.definitionCase.derivedKnowledgeCandidate.reviewStatus, "approved");
  assert.equal(result.definitionCase.derivedKnowledgeCandidate.reviewedAt, "2026-01-01T00:00:00.000Z");
});

test("confirmAndIntegrateCandidate: candidate以外からの確定はfail-closedで拒否する", () => {
  const applicationCase = fakeApplicationCase({ confirmationStatus: "confirmed" });
  assert.throws(
    () =>
      confirmAndIntegrateCandidate({
        applicationCase,
        definitionCase: fakeDefinitionCase(),
        candidateId: "cand-topic-fake-A-app",
        method: "auto",
      }),
    /不正な状態遷移/,
  );
});

test("confirmAndIntegrateCandidate: 同じSourceを二重に統合しようとするとfail-closedで拒否する", () => {
  const alreadyIntegrated = fakeDefinitionCase([
    { sourceBlockId: "block-fake-def", role: "definition" },
    { sourceBlockId: "block-cand-topic-fake-A-app", role: "application" },
  ]);
  assert.throws(
    () =>
      confirmAndIntegrateCandidate({
        applicationCase: fakeApplicationCase(),
        definitionCase: alreadyIntegrated,
        candidateId: "cand-topic-fake-A-app",
        method: "auto",
      }),
    /既に.*統合済み/,
  );
});
