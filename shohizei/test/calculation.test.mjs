// 計算問題（段階ごとの金額）の組み立てのテスト。作り物のデータだけを使う。

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCalculationSteps, parseAmount } from "../src/exerciseView/calculation.mjs";

const L = (text, marker) => ({ text, source: { doc: "d", page: 1, line: 0, bbox: [0, 0, 300, 9] }, ...(marker ? { marker } : {}) });
const num = (raw) => ({ kind: "number", raw });
const paren = (raw) => ({ kind: "paren-number", raw });
const roman = (raw) => ({ kind: "roman", raw });
const bracket = (raw) => ({ kind: "bracket-heading", raw });

test("金額の読み取り: 桁区切り・全角・円・△（マイナス）", () => {
  assert.equal(parseAmount("1,234,500"), 1234500);
  assert.equal(parseAmount("１２３円"), 123);
  assert.equal(parseAmount("△1,000"), -1000);
  assert.equal(parseAmount("不課税"), null);
});

test("段階: 見出しごとに、最後の「→」の後の金額を正解にする（「※」の検算は使わない）", () => {
  const steps = buildCalculationSteps([
    L("１ 課税標準額", num("１")),
    L("1,100＋100＝1,200"),
    L("1,200×100/110＝1,090 → 1,000（千円未満切捨）"),
    L("※１ 100×50％＝50 ＞ 40"),
    L("２ 納付税額", num("２")),
    L("1,000－300＝700"),
  ]);
  assert.deepEqual(steps.map((s) => [s.labelRaw, s.expected.value]), [["１ 課税標準額", 1000], ["２ 納付税額", 700]]);
});

test("段階: 答案用紙の「金額」欄があればそれを正解にし、子を持つだけの見出しは前置きにする", () => {
  const steps = buildCalculationSteps([
    L("Ⅰ 消費税額の計算", roman("Ⅰ")),
    L("【課税標準額】", bracket("【課税標準額】")),
    L("計 算 過 程 （単位：円）"),
    L("金"),
    L("額"),
    L("5,000円"),
    L("5,500×100/110＝5,000"),
    L("Ⅱ 納付税額の計算", roman("Ⅱ")),
    L("(1) 差引税額", paren("(1)")),
    L("5,000－1,000＝4,000"),
    L("(2) 納付税額", paren("(2)")),
    L("4,000－500＝3,500"),
  ]);
  assert.deepEqual(
    steps.map((s) => [s.groupLabel, s.labelRaw, s.expected.value, s.expected.how]),
    [
      [null, "【課税標準額】", 5000, "box"],
      ["Ⅱ 納付税額の計算", "(1) 差引税額", 4000, "calc"],
      ["Ⅱ 納付税額の計算", "(2) 納付税額", 3500, "calc"],
    ],
  );
  assert.ok(steps[0].workLines.every((l) => !/^(金|額|計)/.test(l.text)), "「金」「額」「計算過程」は計算式に入れない");
});

test("段階: 見出しの行に「＝答え」があるときは、「＝」より前だけを名前にする", () => {
  const steps = buildCalculationSteps([L("【課税標準額】", bracket("【課税標準額】")), L("(1) A", paren("(1)")), L("1＋1＝2"), L("(2) (1)＋1＝3", paren("(2)"))]);
  assert.equal(steps[1].labelRaw, "(2) (1)＋1");
  assert.equal(steps[1].expected.value, 3);
});

test("取引ごとの形: 名前は問題文の (n)、答えが文のときは採点しない", () => {
  const items = new Map([
    [1, "(1) 取引その1"],
    [2, "(2) 取引その2"],
  ]);
  const steps = buildCalculationSteps([L("(1)  60,000", paren("(1)")), L("(2)  不課税売上げ", paren("(2)"))], items);
  assert.deepEqual(steps.map((s) => s.labelRaw), ["(1) 取引その1", "(2) 取引その2"]);
  assert.equal(steps[0].expected.value, 60000);
  assert.equal(steps[1].expected, null);
  assert.equal(steps[1].answerTextRaw, "不課税売上げ");
});
