import { test } from "node:test";
import assert from "node:assert/strict";

import { checkDuplicateSourceFaithful } from "../../src/gateChecks/duplicateSourceFaithfulChecks.mjs";

// 架空データ(教材原文は使わない)。

function fakeJournalCase(caseName, sourceFaithful) {
  return {
    case: caseName,
    block: { blockKind: "journal_termbased", sourceFaithful },
  };
}

function fakeFormulaCase(caseName, sourceFaithful) {
  return {
    case: caseName,
    block: { blockKind: "formula_termbased", sourceFaithful },
  };
}

test("checkDuplicateSourceFaithful: すべて異なる型ならokになる", () => {
  const result = checkDuplicateSourceFaithful([
    fakeJournalCase("case-a", "(借)現金×××(貸)売上×××"),
    fakeJournalCase("case-b", "(借)仕入×××(貸)買掛金×××"),
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
});

test("checkDuplicateSourceFaithful: 異なるケースでsourceFaithfulが完全一致していればfail-closedで検出する", () => {
  const result = checkDuplicateSourceFaithful([
    fakeJournalCase("case-a", "(借)有形固定資産×××(貸)現金預金×××"),
    fakeJournalCase("case-b", "(借)有形固定資産×××(貸)現金預金×××"),
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.violations.length, 1);
  assert.match(result.violations[0], /case-a/);
  assert.match(result.violations[0], /case-b/);
});

test("checkDuplicateSourceFaithful: blockKindが異なれば同一テキストでも重複としない", () => {
  const result = checkDuplicateSourceFaithful([
    fakeJournalCase("case-a", "同一テキスト"),
    fakeFormulaCase("case-b", "同一テキスト"),
  ]);
  assert.equal(result.ok, true);
});

test("checkDuplicateSourceFaithful: 対象外のblockKindは無視する", () => {
  const result = checkDuplicateSourceFaithful([
    { case: "case-a", block: { blockKind: "unknown_kind", sourceFaithful: "x" } },
    { case: "case-b", block: { blockKind: "unknown_kind", sourceFaithful: "x" } },
  ]);
  assert.equal(result.ok, true);
});

test("checkDuplicateSourceFaithful: 空配列を渡してもエラーにならない", () => {
  const result = checkDuplicateSourceFaithful([]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
});
