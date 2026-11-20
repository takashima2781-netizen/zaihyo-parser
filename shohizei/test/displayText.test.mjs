// 位置合わせの空白を消す処理のテスト（作り物の文字だけ）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { removeAlignmentSpaces, removeAlignmentSpacesInSegments } from "../src/exerciseView/displayText.mjs";

test("1文字ずつ空けた語を詰める。行頭の記号の後は1つ残す", () => {
  assert.equal(removeAlignmentSpaces("① 定 義"), "① 定義");
  assert.equal(removeAlignmentSpaces("ロ 法 人"), "ロ 法人");
  assert.equal(removeAlignmentSpaces("テーマ１ 総 則"), "テーマ１ 総則");
  assert.equal(removeAlignmentSpaces("計     算     過     程"), "計算過程");
});

test("2つ以上の空白: 日本語どうしなら消し、数字の隣なら1つにする", () => {
  assert.equal(removeAlignmentSpaces("(1) 課税売上高(税込)        44,625,735円"), "(1) 課税売上高(税込) 44,625,735円");
  assert.equal(removeAlignmentSpaces("(2)  取引の文     その続き"), "(2) 取引の文その続き");
  assert.equal(removeAlignmentSpaces("１ 課税標準額 "), "１ 課税標準額", "1つだけの空白は残し、行末は消す");
});

test("segments: 行頭・行末は端の segment だけ。分数は触らない", () => {
  const segs = removeAlignmentSpacesInSegments([
    { kind: "text", text: "  1,000×" },
    { kind: "fraction", numerator: "1", denominator: "2" },
    { kind: "text", text: "＝500   " },
  ]);
  assert.deepEqual(segs.map((s) => s.text ?? `${s.numerator}/${s.denominator}`), ["1,000×", "1/2", "＝500"]);
});

test("書体の記号: B/S などの合字は普通の文字に、見出しの頭の飾りは後ろの空白ごと消す。画像はそのまま", async () => {
  const { replaceFontSymbols, replaceFontSymbolsDeep } = await import("../src/exerciseView/displayText.mjs");
  assert.equal(replaceFontSymbols("テーマ2 計算規則の概要"), "テーマ2 計算規則B/Sの概要");
  assert.equal(replaceFontSymbols("・の概要"), "B/S・P/Lの概要");
  assert.equal(replaceFontSymbols("設例"), "設例");
  assert.equal(replaceFontSymbols("　未払"), "A　未払");
  assert.equal(replaceFontSymbols("　解説"), "解説");
  assert.equal(replaceFontSymbols("表に無いはそのまま"), "表に無いはそのまま");
  const v = replaceFontSymbolsDeep({ a: [""], src: "data:", n: 1, z: null });
  assert.deepEqual(v, { a: ["P/L"], src: "data:", n: 1, z: null });
});
