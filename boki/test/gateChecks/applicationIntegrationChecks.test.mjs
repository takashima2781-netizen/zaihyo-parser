import { test } from "node:test";
import assert from "node:assert/strict";

import { runApplicationIntegrationGateChecks } from "../../src/gateChecks/applicationIntegrationChecks.mjs";

// 架空データ(教材原文は使わない)。

function fakeDefinitionCase({ sourceRefs, rawFormula = "架空の定義式" } = {}) {
  return {
    case: "fake-definition",
    block: { id: "block-fake-def", structureRef: "topic-fake-A", sourceFaithful: "架空の定義式" },
    derivedKnowledgeCandidate: {
      reviewStatus: "approved",
      knowledge: {
        content: { rawFormula, structure: { kind: "sequence", tokens: [] } },
        sourceRefs: sourceRefs ?? [{ sourceBlockId: "block-fake-def", role: "definition" }],
      },
    },
  };
}

function fakeCandidate(overrides = {}) {
  return {
    candidateId: "cand-topic-fake-A-app",
    structureRef: "topic-fake-A",
    boundaryType: "none",
    abstractDefinitionCandidate: { exists: true, sourceBlockId: "block-fake-def" },
    diag: {
      extraction: { artifacts: [{ kind: "fraction_split", resolved: true }] },
      faithfulReconstruction: { performed: true, confidence: "high" },
    },
    confirmationStatus: "candidate",
    confirmationMethod: null,
    confirmedBlockId: null,
    ...overrides,
  };
}

function fakeApplicationCase(candidates) {
  return { case: "fake-application", candidates };
}

test("runApplicationIntegrationGateChecks: 整合した状態(auto確定+統合済み)はok:trueを返す", () => {
  const applicationCase = fakeApplicationCase([
    fakeCandidate({
      confirmationStatus: "confirmed",
      confirmationMethod: "auto",
      confirmedBlockId: "block-cand-topic-fake-A-app",
    }),
  ]);
  const definitionCase = fakeDefinitionCase({
    sourceRefs: [
      { sourceBlockId: "block-fake-def", role: "definition" },
      { sourceBlockId: "block-cand-topic-fake-A-app", role: "application" },
    ],
  });
  const result = runApplicationIntegrationGateChecks({ applicationCase, definitionCase });
  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
});

test("runApplicationIntegrationGateChecks: needs_review相当の候補が統合されずに残っていてもok:trueを返す", () => {
  const applicationCase = fakeApplicationCase([
    fakeCandidate({ structureRef: "topic-fake-B" }), // まだcandidateのまま
  ]);
  const definitionCase = fakeDefinitionCase();
  const result = runApplicationIntegrationGateChecks({ applicationCase, definitionCase });
  assert.equal(result.ok, true);
});

test("runApplicationIntegrationGateChecks: 自動確定条件を実際には満たさないのにauto扱いなら違反を検出する", () => {
  const applicationCase = fakeApplicationCase([
    fakeCandidate({
      structureRef: "topic-fake-B", // テーマ横断、本来は自動確定できない
      confirmationStatus: "confirmed",
      confirmationMethod: "auto",
      confirmedBlockId: "block-cand-topic-fake-A-app",
    }),
  ]);
  const definitionCase = fakeDefinitionCase({
    sourceRefs: [
      { sourceBlockId: "block-fake-def", role: "definition" },
      { sourceBlockId: "block-cand-topic-fake-A-app", role: "application" },
    ],
  });
  const result = runApplicationIntegrationGateChecks({ applicationCase, definitionCase });
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.includes("自動確定条件を実際には満たしていない")));
});

test("runApplicationIntegrationGateChecks: confirmedな候補のSourceがsourceRefsに無ければ違反を検出する", () => {
  const applicationCase = fakeApplicationCase([
    fakeCandidate({
      confirmationStatus: "confirmed",
      confirmationMethod: "auto",
      confirmedBlockId: "block-cand-topic-fake-A-app",
    }),
  ]);
  const definitionCase = fakeDefinitionCase(); // sourceRefsは定義のみ、統合が漏れている
  const result = runApplicationIntegrationGateChecks({ applicationCase, definitionCase });
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.includes("sourceRefsに存在しない")));
});

test("runApplicationIntegrationGateChecks: sourceRefsにconfirmedでない候補由来のapplicationがあれば違反を検出する", () => {
  const applicationCase = fakeApplicationCase([fakeCandidate()]); // まだcandidateのまま
  const definitionCase = fakeDefinitionCase({
    sourceRefs: [
      { sourceBlockId: "block-fake-def", role: "definition" },
      { sourceBlockId: "block-cand-topic-fake-A-app", role: "application" },
    ],
  });
  const result = runApplicationIntegrationGateChecks({ applicationCase, definitionCase });
  assert.equal(result.ok, false);
  assert.ok(
    result.violations.some(
      (v) => v.includes("confirmedな候補に対応しない") || v.includes("既にsourceRefsへ統合されている"),
    ),
  );
});

test("runApplicationIntegrationGateChecks: content.rawFormulaが定義SourceのsourceFaithfulと不一致なら違反を検出する", () => {
  const applicationCase = fakeApplicationCase([]);
  const definitionCase = fakeDefinitionCase({ rawFormula: "改変された式" });
  const result = runApplicationIntegrationGateChecks({ applicationCase, definitionCase });
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.includes("content.rawFormula")));
});
