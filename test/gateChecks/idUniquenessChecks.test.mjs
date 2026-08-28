import { test } from "node:test";
import assert from "node:assert/strict";

import { checkIdUniqueness } from "../../src/gateChecks/idUniquenessChecks.mjs";

// 架空データ(教材原文は使わない)。

function fakeDefinitionCase(caseName, blockId, knowledgeId) {
  return {
    case: caseName,
    block: { id: blockId },
    derivedKnowledgeCandidate: { knowledge: { id: knowledgeId } },
  };
}

function fakeApplicationCase(caseName, confirmedBlockIds) {
  return {
    case: caseName,
    candidates: confirmedBlockIds.map((id) => ({ confirmedBlockId: id })),
  };
}

test("checkIdUniqueness: すべてのIDが一意ならokになる", () => {
  const result = checkIdUniqueness([
    fakeDefinitionCase("case-a", "block-a", "dk-a"),
    fakeDefinitionCase("case-b", "block-b", "dk-b"),
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
});

test("checkIdUniqueness: 確定Source IDが2ケースで重複していればfail-closedで検出する", () => {
  const result = checkIdUniqueness([
    fakeDefinitionCase("case-a", "block-dup", "dk-a"),
    fakeDefinitionCase("case-b", "block-dup", "dk-b"),
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.violations.length, 1);
  assert.match(result.violations[0], /確定Source ID "block-dup"/);
  assert.match(result.violations[0], /case-a/);
  assert.match(result.violations[0], /case-b/);
});

test("checkIdUniqueness: Knowledge IDが2ケースで重複していればfail-closedで検出する", () => {
  const result = checkIdUniqueness([
    fakeDefinitionCase("case-a", "block-a", "dk-dup"),
    fakeDefinitionCase("case-b", "block-b", "dk-dup"),
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.violations.length, 1);
  assert.match(result.violations[0], /Knowledge ID "dk-dup"/);
});

test("checkIdUniqueness: 適用例ケース(candidates[].confirmedBlockId)のIDも検証対象に含む", () => {
  const result = checkIdUniqueness([
    fakeDefinitionCase("case-a", "block-a", "dk-a"),
    fakeApplicationCase("case-a-application", ["block-a"]),
  ]);
  assert.equal(result.ok, false);
  assert.match(result.violations[0], /確定Source ID "block-a"/);
});

test("checkIdUniqueness: 未確定(confirmedBlockIdが無い)候補は検証対象にしない", () => {
  const result = checkIdUniqueness([
    fakeApplicationCase("case-a", [null]),
  ]);
  assert.equal(result.ok, true);
});

test("checkIdUniqueness: 空配列を渡してもエラーにならない", () => {
  const result = checkIdUniqueness([]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
});
