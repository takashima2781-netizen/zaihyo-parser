import { test } from "node:test";
import assert from "node:assert/strict";

import {
  confirmCandidate,
  rejectCandidate,
  buildConfirmedSource,
} from "../../src/parser/candidateActions.mjs";

// 架空データ(教材原文は使わない)。

function fakeApplicationCase(overrides = {}) {
  return {
    case: "fake-application",
    candidates: [
      {
        candidateId: "cand-topic-架空-app",
        location: { page: 1, printedPageLabel: "1", sequenceOnPage: 1 },
        structureRef: "topic-架空",
        parentContext: { label: "例 架空設例設", note: "架空の注記" },
        boundaryType: "none",
        sameTypePatterns: { count: 2, note: "架空の注記" },
        abstractDefinitionCandidate: { exists: true, sourceBlockId: "block-架空-def" },
        detection: { detectorId: "termBasedFormulaDetector", matchedLine: "架空の行", precedingHeading: null },
        extractionRaw: { text: "架空の生データ", tool: "pymupdf", toolVersion: "1.0", invocation: "架空" },
        sourceFaithful: "架空額×（３年／７年）＝架空結果",
        diag: { extraction: { status: "captured_differs", artifacts: [] }, faithfulReconstruction: { performed: true, method: "human_reviewed", confidence: "high" } },
        confirmationStatus: "candidate",
        reviewedAt: null,
        reviewNote: null,
        confirmedBlockId: null,
        ...overrides,
      },
    ],
  };
}

test("confirmCandidate: candidate -> confirmedに遷移し、confirmedBlockIdが発行される", () => {
  const result = confirmCandidate(fakeApplicationCase(), "cand-topic-架空-app", { note: "確認済み" });
  const candidate = result.candidates[0];
  assert.equal(candidate.confirmationStatus, "confirmed");
  assert.equal(candidate.confirmedBlockId, "block-cand-topic-架空-app");
  assert.ok(candidate.reviewedAt);
  assert.equal(candidate.reviewNote, "確認済み");
});

test("confirmCandidate: methodを省略するとhuman_reviewedがデフォルトになる", () => {
  const result = confirmCandidate(fakeApplicationCase(), "cand-topic-架空-app");
  assert.equal(result.candidates[0].confirmationMethod, "human_reviewed");
});

test("confirmCandidate: method:'auto'を指定すると自動確定として記録される", () => {
  const result = confirmCandidate(fakeApplicationCase(), "cand-topic-架空-app", { method: "auto" });
  assert.equal(result.candidates[0].confirmationMethod, "auto");
});

test("confirmCandidate: 未知のmethodはfail-closedで拒否する", () => {
  assert.throws(
    () => confirmCandidate(fakeApplicationCase(), "cand-topic-架空-app", { method: "something_else" }),
    /未知のconfirmationMethod/,
  );
});

test("confirmCandidate: candidate以外からの確定はfail-closedで拒否する", () => {
  const input = fakeApplicationCase({ confirmationStatus: "confirmed" });
  assert.throws(() => confirmCandidate(input, "cand-topic-架空-app"), /不正な状態遷移/);
});

test("rejectCandidate: candidate -> rejectedに遷移し、候補データは削除されず残る", () => {
  const input = fakeApplicationCase();
  const result = rejectCandidate(input, "cand-topic-架空-app", { note: "不採用" });
  const candidate = result.candidates[0];
  assert.equal(candidate.confirmationStatus, "rejected");
  assert.equal(candidate.reviewNote, "不採用");
  assert.equal(candidate.sourceFaithful, input.candidates[0].sourceFaithful);
});

test("rejectCandidate: candidate以外からの除外はfail-closedで拒否する", () => {
  const input = fakeApplicationCase({ confirmationStatus: "rejected" });
  assert.throws(() => rejectCandidate(input, "cand-topic-架空-app"), /不正な状態遷移/);
});

test("buildConfirmedSource: confirmed状態の候補から4概念モデル+provenanceを持つContentBlockを組み立てる", () => {
  const confirmed = confirmCandidate(fakeApplicationCase(), "cand-topic-架空-app", {
    method: "human_reviewed",
  }).candidates[0];
  const block = buildConfirmedSource(confirmed);
  assert.equal(block.type, "ContentBlock");
  assert.equal(block.id, "block-cand-topic-架空-app");
  assert.equal(block.blockKind, "formula_termbased");
  assert.equal(block.sourceFaithful, confirmed.sourceFaithful);
  assert.equal(block.provenance.relation, "extracted_from_parent");
  assert.equal(block.provenance.parentLabel, "例 架空設例設");
  assert.match(block.provenance.note, /human_reviewed/);
});

test("buildConfirmedSource: 自動確定(method:'auto')の場合はprovenance.noteにautoと明記する", () => {
  const confirmed = confirmCandidate(fakeApplicationCase(), "cand-topic-架空-app", {
    method: "auto",
  }).candidates[0];
  const block = buildConfirmedSource(confirmed);
  assert.match(block.provenance.note, /auto/);
});

test("buildConfirmedSource: confirmed以外の候補からはfail-closedで拒否する", () => {
  const candidate = fakeApplicationCase().candidates[0];
  assert.throws(() => buildConfirmedSource(candidate), /confirmed.*ない/);
});
