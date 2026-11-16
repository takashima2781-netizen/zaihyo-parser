import { test } from "node:test";
import assert from "node:assert/strict";

import {
  tokenizeSubtractFractionFormula,
  tokenizeBareNumberFractionFormula,
  tokenizePlainTermFormula,
  tokenizeAdditionFractionFormula,
  tokenizeLabelFractionFormula,
  tokenizeSubtractGroupFormula,
  tokenizeSubtractGroupDivideFormula,
  tokenizeSubtractGroupTimesTermFormula,
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

// 第5ケース(テーマ11 外貨建取引)用: 括弧・分数を伴わない最も単純な形状。
test("tokenizePlainTermFormula: 想定形状を5トークン語彙(term/operatorのみ)へ分解する", () => {
  const formula = "架空項Ａ×架空項Ｂ＝架空額";
  const structure = tokenizePlainTermFormula(formula);

  assert.equal(structure.kind, "sequence");
  assert.deepEqual(structure.tokens, [
    { kind: "term", value: "架空項Ａ" },
    { kind: "operator", value: "×" },
    { kind: "term", value: "架空項Ｂ" },
    { kind: "operator", value: "＝" },
    { kind: "term", value: "架空額" },
  ]);
});

test("tokenizePlainTermFormula: 往復整合性が成り立つ", () => {
  const formula = "100ドル×架空レート118円＝11,800";
  assert.equal(renderTokens(tokenizePlainTermFormula(formula)), formula);
});

test("tokenizePlainTermFormula: 想定外の形状(×またが＝が無い)はfail-closedで例外を投げる", () => {
  assert.throws(() => tokenizePlainTermFormula("架空額＝架空項Ａ＋架空項Ｂ"), /一致しない/);
});

// 第6ケース(テーマ7-10 仕入諸掛、按分計算の平均法)用: 分母が単一項ではなく
// 演算(＋)を含む式になる形状。
test("tokenizeAdditionFractionFormula: 想定形状を5トークン語彙へ分解する(分母が複数トークン)", () => {
  const formula = "（架空項Ａ＋架空項Ｂ）×（架空項Ｃ／（架空項Ｄ＋架空項Ｅ））＝架空額";
  const structure = tokenizeAdditionFractionFormula(formula);

  assert.equal(structure.kind, "sequence");
  assert.equal(structure.tokens.length, 5);
  assert.deepEqual(structure.tokens[0], {
    kind: "group",
    tokens: [
      { kind: "term", value: "架空項Ａ" },
      { kind: "operator", value: "＋" },
      { kind: "term", value: "架空項Ｂ" },
    ],
  });
  assert.equal(structure.tokens[1].value, "×");
  assert.deepEqual(structure.tokens[2], {
    kind: "group",
    tokens: [
      {
        kind: "fraction",
        numerator: [{ kind: "term", value: "架空項Ｃ" }],
        denominator: [
          { kind: "term", value: "架空項Ｄ" },
          { kind: "operator", value: "＋" },
          { kind: "term", value: "架空項Ｅ" },
        ],
      },
    ],
  });
  assert.equal(structure.tokens[3].value, "＝");
  assert.deepEqual(structure.tokens[4], { kind: "term", value: "架空額" });
});

test("tokenizeAdditionFractionFormula: 往復整合性が成り立つ(分母の括弧が正しく復元される)", () => {
  const formula = "（架空項Ａ＋架空項Ｂ）×（架空項Ｃ／（架空項Ｄ＋架空項Ｅ））＝架空額";
  assert.equal(renderTokens(tokenizeAdditionFractionFormula(formula)), formula);
});

test("tokenizeAdditionFractionFormula: 想定外の形状はfail-closedで例外を投げる", () => {
  assert.throws(
    () => tokenizeAdditionFractionFormula("架空額＝架空項Ａ－架空項Ｂ"),
    /一致しない/,
  );
});

test("renderTokens: 単一項の分子/分母には括弧を付けない(既存の往復整合性を壊さない)", () => {
  const formula = "（架空項Ａ－架空項Ｂ）×（１架空単位／架空全体単位）＝架空額";
  // 既存のtokenizeSubtractFractionFormula(分子/分母とも単一項)で、
  // renderTokensのfraction分岐拡張後も出力が変わらないことを確認する。
  assert.equal(renderTokens(tokenizeSubtractFractionFormula(formula)), formula);
});

// Phase C・テーマ7-4(原価率)用: 被定義項が左辺、分数が右辺という形
// (既存4形状はいずれも被定義項が右辺だった)。
test("tokenizeLabelFractionFormula: 想定形状を5トークン語彙へ分解する(被定義項が左辺)", () => {
  const formula = "架空率＝架空項Ａ／架空項Ｂ";
  const structure = tokenizeLabelFractionFormula(formula);

  assert.equal(structure.kind, "sequence");
  assert.deepEqual(structure.tokens, [
    { kind: "term", value: "架空率" },
    { kind: "operator", value: "＝" },
    {
      kind: "fraction",
      numerator: [{ kind: "term", value: "架空項Ａ" }],
      denominator: [{ kind: "term", value: "架空項Ｂ" }],
    },
  ]);
});

test("tokenizeLabelFractionFormula: 往復整合性が成り立つ", () => {
  const formula = "架空率＝架空項Ａ／架空項Ｂ";
  assert.equal(renderTokens(tokenizeLabelFractionFormula(formula)), formula);
});

test("tokenizeLabelFractionFormula: 想定外の形状はfail-closedで例外を投げる", () => {
  assert.throws(() => tokenizeLabelFractionFormula("架空額＝架空項Ａ＋架空項Ｂ"), /一致しない/);
});

// Phase C・テーマ7-2(総記法)用: 先頭が減算で、括弧グループの中に加算と
// 減算が混在する形状。
test("tokenizeSubtractGroupFormula: 想定形状を5トークン語彙へ分解する", () => {
  const formula = "架空項Ａ－（架空項Ｂ＋架空項Ｃ－架空項Ｄ）＝架空額";
  const structure = tokenizeSubtractGroupFormula(formula);

  assert.equal(structure.kind, "sequence");
  assert.deepEqual(structure.tokens[0], { kind: "term", value: "架空項Ａ" });
  assert.equal(structure.tokens[1].value, "－");
  assert.deepEqual(structure.tokens[2], {
    kind: "group",
    tokens: [
      { kind: "term", value: "架空項Ｂ" },
      { kind: "operator", value: "＋" },
      { kind: "term", value: "架空項Ｃ" },
      { kind: "operator", value: "－" },
      { kind: "term", value: "架空項Ｄ" },
    ],
  });
  assert.equal(structure.tokens[3].value, "＝");
  assert.deepEqual(structure.tokens[4], { kind: "term", value: "架空額" });
});

test("tokenizeSubtractGroupFormula: 往復整合性が成り立つ", () => {
  const formula = "架空項Ａ－（架空項Ｂ＋架空項Ｃ－架空項Ｄ）＝架空額";
  assert.equal(renderTokens(tokenizeSubtractGroupFormula(formula)), formula);
});

test("tokenizeSubtractGroupFormula: 想定外の形状はfail-closedで例外を投げる", () => {
  assert.throws(() => tokenizeSubtractGroupFormula("架空額＝架空項Ａ×架空項Ｂ"), /一致しない/);
});

// Phase C・テーマ8-8(償却方法の変更)用: 括弧グループの中に減算が2回現れ、
// 除算記号「÷」を使う形状。
test("tokenizeSubtractGroupDivideFormula: 想定形状を5トークン語彙へ分解する", () => {
  const formula = "（架空項Ａ－架空項Ｂ－架空項Ｃ）÷架空項Ｄ＝架空額";
  const structure = tokenizeSubtractGroupDivideFormula(formula);

  assert.equal(structure.kind, "sequence");
  assert.deepEqual(structure.tokens[0], {
    kind: "group",
    tokens: [
      { kind: "term", value: "架空項Ａ" },
      { kind: "operator", value: "－" },
      { kind: "term", value: "架空項Ｂ" },
      { kind: "operator", value: "－" },
      { kind: "term", value: "架空項Ｃ" },
    ],
  });
  assert.equal(structure.tokens[1].value, "÷");
  assert.deepEqual(structure.tokens[2], { kind: "term", value: "架空項Ｄ" });
  assert.equal(structure.tokens[3].value, "＝");
  assert.deepEqual(structure.tokens[4], { kind: "term", value: "架空額" });
});

test("tokenizeSubtractGroupDivideFormula: 往復整合性が成り立つ", () => {
  const formula = "（架空項Ａ－架空項Ｂ－架空項Ｃ）÷架空項Ｄ＝架空額";
  assert.equal(renderTokens(tokenizeSubtractGroupDivideFormula(formula)), formula);
});

test("tokenizeSubtractGroupDivideFormula: 想定外の形状はfail-closedで例外を投げる", () => {
  assert.throws(
    () => tokenizeSubtractGroupDivideFormula("架空額＝架空項Ａ×架空項Ｂ"),
    /一致しない/,
  );
});

// Phase C・テーマ8-8(償却方法の変更)用: 先頭が減算グループだが、乗算の
// 相手が分数ではなく単純な項である形状。
test("tokenizeSubtractGroupTimesTermFormula: 想定形状を5トークン語彙へ分解する", () => {
  const formula = "（架空項Ａ－架空項Ｂ）×架空項Ｃ＝架空額";
  const structure = tokenizeSubtractGroupTimesTermFormula(formula);

  assert.equal(structure.kind, "sequence");
  assert.deepEqual(structure.tokens[0], {
    kind: "group",
    tokens: [
      { kind: "term", value: "架空項Ａ" },
      { kind: "operator", value: "－" },
      { kind: "term", value: "架空項Ｂ" },
    ],
  });
  assert.equal(structure.tokens[1].value, "×");
  assert.deepEqual(structure.tokens[2], { kind: "term", value: "架空項Ｃ" });
  assert.equal(structure.tokens[3].value, "＝");
  assert.deepEqual(structure.tokens[4], { kind: "term", value: "架空額" });
});

test("tokenizeSubtractGroupTimesTermFormula: 往復整合性が成り立つ", () => {
  const formula = "（架空項Ａ－架空項Ｂ）×架空項Ｃ＝架空額";
  assert.equal(renderTokens(tokenizeSubtractGroupTimesTermFormula(formula)), formula);
});

test("tokenizeSubtractGroupTimesTermFormula: 想定外の形状はfail-closedで例外を投げる", () => {
  assert.throws(
    () => tokenizeSubtractGroupTimesTermFormula("架空額＝架空項Ａ／架空項Ｂ"),
    /一致しない/,
  );
});
