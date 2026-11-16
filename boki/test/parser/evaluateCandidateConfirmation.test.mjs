import { test } from "node:test";
import assert from "node:assert/strict";

import { evaluateAutoConfirmation } from "../../src/parser/evaluateCandidateConfirmation.mjs";

// 架空データ(教材原文は使わない)。

const DEFINITION_INFO = {
  definitionBlockId: "block-fake-def",
  definitionBlockStructureRef: "topic-fake-A",
};

function baseCandidate(overrides = {}) {
  return {
    structureRef: "topic-fake-A",
    boundaryType: "none",
    abstractDefinitionCandidate: { exists: true, sourceBlockId: "block-fake-def" },
    diag: {
      extraction: { artifacts: [{ kind: "fraction_split", resolved: true }] },
      faithfulReconstruction: { performed: true, confidence: "high" },
    },
    ...overrides,
  };
}

test("evaluateAutoConfirmation: 同一topic・定義候補一意・復元済み → auto_confirm", () => {
  const result = evaluateAutoConfirmation(baseCandidate(), DEFINITION_INFO);
  assert.equal(result.sameTopicAsDefinition, true);
  assert.equal(result.definitionMatchIsUnique, true);
  assert.equal(result.restorationResolved, true);
  assert.equal(result.result, "auto_confirm");
  assert.equal(result.reason, null);
});

test("evaluateAutoConfirmation: 候補のtopicが定義と異なる(テーマ横断) → needs_review(cross_topic)", () => {
  const candidate = baseCandidate({ structureRef: "topic-fake-B" });
  const result = evaluateAutoConfirmation(candidate, DEFINITION_INFO);
  assert.equal(result.sameTopicAsDefinition, false);
  assert.equal(result.definitionMatchIsUnique, true);
  assert.equal(result.result, "needs_review");
  assert.equal(result.reason, "cross_topic");
});

test("evaluateAutoConfirmation: abstractDefinitionCandidateが存在しない → needs_review(no_definition_candidate)", () => {
  const candidate = baseCandidate({
    abstractDefinitionCandidate: { exists: false, sourceBlockId: null },
  });
  const result = evaluateAutoConfirmation(candidate, DEFINITION_INFO);
  assert.equal(result.sameTopicAsDefinition, false);
  assert.equal(result.definitionMatchIsUnique, false);
  assert.equal(result.result, "needs_review");
  assert.equal(result.reason, "no_definition_candidate");
});

test("evaluateAutoConfirmation: 定義候補の参照先が異なるblockId → needs_review(cross_topic)", () => {
  const candidate = baseCandidate({
    abstractDefinitionCandidate: { exists: true, sourceBlockId: "block-other-def" },
  });
  const result = evaluateAutoConfirmation(candidate, DEFINITION_INFO);
  assert.equal(result.sameTopicAsDefinition, false);
  assert.equal(result.definitionMatchIsUnique, true);
  assert.equal(result.result, "needs_review");
  assert.equal(result.reason, "cross_topic");
});

test("evaluateAutoConfirmation: Faithful Restorationが未解決 → needs_review(restoration_unresolved)", () => {
  const candidate = baseCandidate({
    diag: {
      extraction: { artifacts: [{ kind: "fraction_split", resolved: false }] },
      faithfulReconstruction: { performed: true, confidence: "high" },
    },
  });
  const result = evaluateAutoConfirmation(candidate, DEFINITION_INFO);
  assert.equal(result.sameTopicAsDefinition, true);
  assert.equal(result.restorationResolved, false);
  assert.equal(result.result, "needs_review");
  assert.equal(result.reason, "restoration_unresolved");
});

test("evaluateAutoConfirmation: 複数artifactsのうち1つでも未解決なら restoration_unresolved", () => {
  const candidate = baseCandidate({
    diag: {
      extraction: {
        artifacts: [
          { kind: "fraction_split", resolved: true },
          { kind: "fraction_split_compound", resolved: false },
        ],
      },
      faithfulReconstruction: { performed: true, confidence: "high" },
    },
  });
  const result = evaluateAutoConfirmation(candidate, DEFINITION_INFO);
  assert.equal(result.restorationResolved, false);
  assert.equal(result.result, "needs_review");
});
