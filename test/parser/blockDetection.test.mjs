import { test } from "node:test";
import assert from "node:assert/strict";

import { detectTermBasedFormulas } from "../../src/parser/blockDetection.mjs";

// 架空の計算式を使う(教材原文は使わない)。

test("detectTermBasedFormulas: 単一行の用語ベース計算式を検出する", () => {
  const page = "見出し\n（架空項Ａ－架空項Ｂ）×架空率＝架空額\n次の行";
  const result = detectTermBasedFormulas(page);
  assert.equal(result.length, 1);
  assert.equal(result[0].matchedLine, "（架空項Ａ－架空項Ｂ）×架空率＝架空額");
  assert.equal(result[0].detectorId, "termBasedFormulaDetector");
});

test("detectTermBasedFormulas: 分数が前後行に分離しているケースをcontextとして保持する", () => {
  const page = ["１架空単位", "（架空項Ａ－架空項Ｂ）×      ＝架空額", "架空全体単位"].join(
    "\n",
  );
  const [candidate] = detectTermBasedFormulas(page);
  assert.deepEqual(candidate.contextBefore, ["１架空単位"]);
  assert.deepEqual(candidate.contextAfter, ["架空全体単位"]);
});

test("detectTermBasedFormulas: 直前のサブ項目見出しをprecedingHeadingとして保持する", () => {
  const page = [
    "１ 架空技術Ａ（〇）",
    "架空技術Ａとは、～である。",
    "（架空項Ａ－架空項Ｂ）×架空率＝架空額",
  ].join("\n");
  const [candidate] = detectTermBasedFormulas(page);
  assert.equal(candidate.precedingHeading, "１ 架空技術Ａ（〇）");
});

test("detectTermBasedFormulas: 複数件を検出できる", () => {
  const page = [
    "１ 架空技術Ａ",
    "（架空項Ａ－架空項Ｂ）×架空率Ａ＝架空額Ａ",
    "２ 架空技術Ｂ",
    "（架空項Ｃ－架空項Ｄ）×架空率Ｂ＝架空額Ｂ",
  ].join("\n");
  const result = detectTermBasedFormulas(page);
  assert.equal(result.length, 2);
});

test("detectTermBasedFormulas: パターンに一致しない行は検出しない", () => {
  const page = "架空の地の文。式は含まれない。";
  assert.equal(detectTermBasedFormulas(page).length, 0);
});
