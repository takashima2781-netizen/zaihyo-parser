import { test } from "node:test";
import assert from "node:assert/strict";

import { tokenizeJournalPattern, renderTokens } from "../../src/knowledge/journalPatternTokenizer.mjs";

// 架空データ(教材原文は使わない)。

test("tokenizeJournalPattern: 想定形状を5トークン語彙(termのみ)へ分解する", () => {
  const formula = "(借)架空勘定Ａ×××(貸)架空勘定Ｂ×××";
  const structure = tokenizeJournalPattern(formula);

  assert.equal(structure.kind, "sequence");
  assert.equal(structure.tokens.length, 6);
  assert.deepEqual(structure.tokens, [
    { kind: "term", value: "(借)" },
    { kind: "term", value: "架空勘定Ａ" },
    { kind: "term", value: "×××" },
    { kind: "term", value: "(貸)" },
    { kind: "term", value: "架空勘定Ｂ" },
    { kind: "term", value: "×××" },
  ]);
});

test("tokenizeJournalPattern: 往復整合性が成り立つ", () => {
  const formula = "(借)架空勘定Ａ×××(貸)架空勘定Ｂ×××";
  assert.equal(renderTokens(tokenizeJournalPattern(formula)), formula);
});

test("tokenizeJournalPattern: 想定外の形状はfail-closedで例外を投げる(推測しない)", () => {
  assert.throws(
    () => tokenizeJournalPattern("架空勘定Ａ×××架空勘定Ｂ×××"),
    /一致しない/,
  );
});

test("tokenizeJournalPattern: 全角括弧の(借)/(貸)は未確認の表記のため対応しない(fail-closed)", () => {
  // 実データ確認: テーマ8-11の仕訳パターン2件はいずれも半角括弧だった。
  // 未確認の表記まで先回りして対応しない(CLAUDE.md原則4)。
  assert.throws(
    () => tokenizeJournalPattern("（借）架空勘定Ａ×××（貸）架空勘定Ｂ×××"),
    /一致しない/,
  );
});
