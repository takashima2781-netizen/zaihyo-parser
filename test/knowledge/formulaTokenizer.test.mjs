import { test } from "node:test";
import assert from "node:assert/strict";

import {
  tokenizeSubtractFractionFormula,
  tokenizeBareNumberFractionFormula,
  renderTokens,
} from "../../src/knowledge/formulaTokenizer.mjs";

// 架空の式を使う(教材原文は使わない、CLAUDE.md原則2・7)。

test("tokenizeSubtractFractionFormula: 想定形状を5トークン語彙へ分解する", () => {
  const formula = "（架空項Ａ－架空項Ｂ）×（１架空単位／架空全体単位）＝架空額";
  const structure = tokenizeSubtractFractionFormula(formula);

  assert.equal(structure.kind, "sequence");
  assert.equal(structure.tokens.length, 5);
  assert.deepEqual(structure.tokens[0], {
    kind: "group",
    tokens: [
      { kind: "term", value: "架空項Ａ" },
      { kind: "operator", value: "－" },
      { kind: "term", value: "架空項Ｂ" },
    ],
  });
  assert.equal(structure.tokens[1].kind, "operator");
  assert.equal(structure.tokens[1].value, "×");
  assert.deepEqual(structure.tokens[2], {
    kind: "group",
    tokens: [
      {
        kind: "fraction",
        numerator: [{ kind: "term", value: "１架空単位" }],
        denominator: [{ kind: "term", value: "架空全体単位" }],
      },
    ],
  });
  assert.equal(structure.tokens[3].value, "＝");
  assert.deepEqual(structure.tokens[4], { kind: "term", value: "架空額" });
});

test("tokenizeSubtractFractionFormula: 想定外の形状はfail-closedで例外を投げる", () => {
  assert.throws(
    () => tokenizeSubtractFractionFormula("架空額＝架空項Ａ＋架空項Ｂ"),
    /一致しない/,
  );
});

test("renderTokens: 往復整合性(tokenize後にrenderすると元の文字列に戻る)", () => {
  const formulas = [
    "（架空項Ａ－架空項Ｂ）×（１架空単位／架空全体単位）＝架空額",
    "（Ｘ－Ｙ）×（Ｚ／Ｗ）＝Ｖ",
  ];
  for (const formula of formulas) {
    const structure = tokenizeSubtractFractionFormula(formula);
    assert.equal(renderTokens(structure), formula);
  }
});

test("renderTokens: 未対応のkindはfail-closedで例外を投げる(powerは今回未実装)", () => {
  assert.throws(
    () => renderTokens({ kind: "power", base: {}, exponent: {} }),
    /未対応/,
  );
});

// 第2ケース(定額法の適用例)用: 残存価額ゼロのため減算部分が省略される形状。
test("tokenizeBareNumberFractionFormula: 想定形状を5トークン語彙へ分解する", () => {
  const formula = "90,000×（１架空単位／架空全体単位）＝15,000";
  const structure = tokenizeBareNumberFractionFormula(formula);

  assert.equal(structure.kind, "sequence");
  assert.equal(structure.tokens.length, 5);
  assert.deepEqual(structure.tokens[0], { kind: "term", value: "90,000" });
  assert.equal(structure.tokens[1].value, "×");
  assert.deepEqual(structure.tokens[2], {
    kind: "group",
    tokens: [
      {
        kind: "fraction",
        numerator: [{ kind: "term", value: "１架空単位" }],
        denominator: [{ kind: "term", value: "架空全体単位" }],
      },
    ],
  });
  assert.equal(structure.tokens[3].value, "＝");
  assert.deepEqual(structure.tokens[4], { kind: "term", value: "15,000" });
});

test("tokenizeBareNumberFractionFormula: 往復整合性が成り立つ", () => {
  const formula = "90,000×（１架空単位／架空全体単位）＝15,000";
  assert.equal(renderTokens(tokenizeBareNumberFractionFormula(formula)), formula);
});

test("tokenizeBareNumberFractionFormula: 想定外の形状はfail-closedで例外を投げる", () => {
  assert.throws(
    () => tokenizeBareNumberFractionFormula("架空額＝架空項Ａ＋架空項Ｂ"),
    /一致しない/,
  );
});
