// 振り分け・選ぶ問題の解答の読み取りのテスト（作り物の文字だけ）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryLegend, parseGroupedAnswer, parseSelectedAnswer } from "../src/exerciseView/choiceItems.mjs";

const L = (text) => ({ text });

test("指示文から記号の意味を読む（○△× と「課」「非」の両方）", () => {
  assert.deepEqual([...categoryLegend("次の取引のうち、Aとなるものに○、Bとなるものに△、Cとなるものに×を付しなさい。")], [
    ["○", "A"],
    ["△", "B"],
    ["×", "C"],
  ]);
  assert.deepEqual([...categoryLegend("次の取引のうち、課税取引となるものには「課」を、非課税取引となるものには「非」を付しなさい。")], [
    ["課", "課税"],
    ["非", "非課税"],
  ]);
});

test("振り分けの解答: 記号ごとの番号（次の行への続きも）。両方に出る番号は除く", () => {
  const r = parseGroupedAnswer([L("課 ………… (1)、(2)"), L("(3)"), L("非 ………… (4)、(2)")]);
  assert.equal(r.answerOf.get(1), "課");
  assert.equal(r.answerOf.get(3), "課");
  assert.equal(r.answerOf.get(4), "非");
  assert.ok(r.conflicts.has(2));
});

test("選ぶ問題の解答: 番号だけが並ぶ行（続きの行も）。文が混じる行で止まる", () => {
  const s = parseSelectedAnswer([L("(1)、(5)、"), L("(7)、（10）"), L("【解答への道】の前置き(9)")]);
  assert.deepEqual([...s].sort((a, b) => a - b), [1, 5, 7, 10]);
});

test("取引ごとの短い文の答え（事業区分）と、解答側の記号の意味（○〔標準税率〕）", async () => {
  const { parseInlineValueAnswers } = await import("../src/exerciseView/choiceItems.mjs");
  const m = parseInlineValueAnswers([L("(１) 第一種事業    (８) 第三種事業"), L("(２) 非課税取引    (９) 1,000")]);
  assert.deepEqual([...m], [[1, "第一種事業"], [8, "第三種事業"], [2, "非課税取引"]]);
  const g = parseGroupedAnswer([L("○〔標準税率〕 (１)、(３)"), L("△〔軽減税率〕 (２)")]);
  assert.equal(g.legend.get("○"), "標準税率");
  assert.equal(g.answerOf.get(2), "△");
  const h = parseGroupedAnswer([L("○   (1)、(3)"), L("×   (2)")]);
  assert.equal(h.answerOf.get(3), "○", "点線の無い書き方も読む");
});
