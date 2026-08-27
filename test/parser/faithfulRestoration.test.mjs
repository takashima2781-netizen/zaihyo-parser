import { test } from "node:test";
import assert from "node:assert/strict";

import { applyKnownCorrection, normalizeCjkLetterSpacing } from "../../src/parser/faithfulRestoration.mjs";

// 架空の補正データを使う(教材原文は使わない)。

test("applyKnownCorrection: 期待される断片がすべて揃っていれば補正を適用する", () => {
  const correction = {
    blockId: "block-fake",
    artifactKind: "fraction_split",
    expectedFragments: ["架空項Ａ", "架空額", "架空全体単位"],
    correctedText: "（架空項Ａ－架空項Ｂ）×（１架空単位／架空全体単位）＝架空額",
  };
  const rawText = "１架空単位\n（架空項Ａ－架空項Ｂ）×      ＝架空額\n架空全体単位";

  const result = applyKnownCorrection(rawText, correction);
  assert.equal(result.sourceFaithful, correction.correctedText);
  assert.equal(result.artifact.kind, "fraction_split");
  assert.equal(result.artifact.resolved, true);
});

test("applyKnownCorrection: 期待される断片が欠けていればfail-closedで例外を投げる(推測で補正しない)", () => {
  const correction = {
    blockId: "block-fake",
    artifactKind: "fraction_split",
    expectedFragments: ["架空項Ａ", "想定外の断片"],
    correctedText: "（架空項Ａ－架空項Ｂ）×（１架空単位／架空全体単位）＝架空額",
  };
  const rawText = "１架空単位\n（架空項Ａ－架空項Ｂ）×      ＝架空額\n架空全体単位";

  assert.throws(() => applyKnownCorrection(rawText, correction), /fail-closed/);
});

// 第3ケース(仕訳パターン)の実データ検証で確認した、勘定科目名の文字間に
// 挿入された字間調整用の空白の除去(`planning`の仕訳パターン検証相当)。

test("normalizeCjkLetterSpacing: 全角文字の間の空白を除去する", () => {
  const result = normalizeCjkLetterSpacing("架 空 勘 定");
  assert.equal(result.normalized, "架空勘定");
  assert.equal(result.removedCount, 3);
});

test("normalizeCjkLetterSpacing: 複数個の空白(全角/半角混在)もまとめて1回として除去する", () => {
  const result = normalizeCjkLetterSpacing("架空  勘  定");
  assert.equal(result.normalized, "架空勘定");
  assert.equal(result.removedCount, 2);
});

test("normalizeCjkLetterSpacing: もともと空白が無い文字列は変更しない", () => {
  const result = normalizeCjkLetterSpacing("架空勘定科目");
  assert.equal(result.normalized, "架空勘定科目");
  assert.equal(result.removedCount, 0);
});

// 第4ケース(テーマ4-1 手形)の実データ検証で確認した、勘定科目名の代わりに
// 使われる「○○○」「〇〇〇」(空欄記入を促すプレースホルダー記号)。

test("normalizeCjkLetterSpacing: ○(白丸記号)の間の空白も除去する", () => {
  const result = normalizeCjkLetterSpacing("○ ○ ○");
  assert.equal(result.normalized, "○○○");
  assert.equal(result.removedCount, 2);
});

test("normalizeCjkLetterSpacing: 〇(漢数字の零)の間の空白も除去する", () => {
  const result = normalizeCjkLetterSpacing("〇 〇 〇");
  assert.equal(result.normalized, "〇〇〇");
  assert.equal(result.removedCount, 2);
});

test("normalizeCjkLetterSpacing: 末尾の記号の前の空白は対象外(記号はCJK文字ではないため)", () => {
  const result = normalizeCjkLetterSpacing("架空勘定 ※");
  assert.equal(result.normalized, "架空勘定 ※");
  assert.equal(result.removedCount, 0);
});
