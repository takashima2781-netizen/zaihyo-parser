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

test("解答の (n) が問題文の取引と対応しないときは、取引ごとの形とみなさない", () => {
  const items = new Map([[1, "(1) 取引A"], [2, "(2) 取引B"], [3, "(3) 取引C"], [4, "(4) 取引D"], [5, "(5) 取引E"]]);
  const steps = buildCalculationSteps([L("(1) 課税仕入れ", paren("(1)")), L("1＋1＝2"), L("(2) 課税貨物", paren("(2)")), L("3,000")], items);
  assert.deepEqual(steps.map((s) => [s.labelRaw, s.expected.value]), [["(1) 課税仕入れ", 2], ["(2) 課税貨物", 3000]]);
});

test("取引ごとの形: 名前は問題文の (n)、答えが文のときは採点しない", () => {
  const items = new Map([
    [1, "(1) 取引その1"],
    [2, "(2) 取引その2"],
    [3, "(3) 取引その3"],
  ]);
  const steps = buildCalculationSteps(
    [L("(1)  60,000", paren("(1)")), L("(2)  不課税売上げ", paren("(2)")), L("(3)  1,000", paren("(3)"))],
    items,
  );
  assert.deepEqual(steps.map((s) => s.labelRaw), ["(1) 取引その1", "(2) 取引その2", "(3) 取引その3"]);
  assert.equal(steps[0].expected.value, 60000);
  assert.equal(steps[1].expected, null);
  assert.equal(steps[1].answerTextRaw, "不課税売上げ");
});

test("段階: 「（続き）」の見出しは前の段階につなげ、最後の「金額」欄を正解にする", () => {
  const steps = buildCalculationSteps([
    L("【控除対象仕入税額】", bracket("【控除対象仕入税額】")),
    L("100＋200＝300"),
    L("【控除対象仕入税額】（続き）", bracket("【控除対象仕入税額】")),
    L("300×1/2＝150"),
    L("150円"),
  ]);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].expected.value, 150);
});

test("判定: 「∴ 納税義務あり」は対の選択肢つき、決まった対が無い結論は表示だけ", async () => {
  const { judgementFrom } = await import("../src/exerciseView/calculation.mjs");
  assert.deepEqual(judgementFrom(["(3) A＞B  ∴  納税義務あり"]), { raw: "納税義務あり", options: ["納税義務あり", "納税義務なし"], correct: "納税義務あり" });
  assert.deepEqual(judgementFrom(["∴ 特別な結論"]), { raw: "特別な結論", options: null, correct: null });
  assert.equal(judgementFrom(["(3)＞(4)  ∴  91,260,000"]), null, "結論が金額なら判定ではない");
  const steps = buildCalculationSteps([L("(1) 基準期間", paren("(1)")), L("1,100×100/110＝1,000"), L("(2) (1)＞500  ∴  納税義務あり", paren("(2)"))]);
  assert.equal(steps[1].labelRaw, "(2)", "名前に結論も、金額の入った式も入れない");
  assert.equal(steps[1].judgement.correct, "納税義務あり");
});

test("日付の答え: 期間・1日・名前つき（第33期：）を読み、「※」の途中計算は読まない。同じ名前には順番を付ける", async () => {
  const { dateAnswerFrom } = await import("../src/exerciseView/calculation.mjs");
  assert.deepEqual(dateAnswerFrom("第33期：令和６年４月１日～令和７年３月31日").values, [6, 4, 1, 7, 3, 31]);
  assert.equal(dateAnswerFrom("第33期：令和６年４月１日～令和７年３月31日").prefix, "第33期");
  assert.equal(dateAnswerFrom("令和元年５月１日").kind, "date");
  assert.equal(dateAnswerFrom("※令和６年10月28日～令和８年９月25日"), null);
  assert.equal(dateAnswerFrom("令和６年４月１日以後に開始する課税期間について述べる"), null, "日付の後に文が続くものは答えにしない");
  const steps = buildCalculationSteps([
    L("〔問１〕", { kind: "sub-question", raw: "〔問１〕" }),
    L("令和８年４月１日から令和８年９月30日まで"),
    L("令和８年10月１日から令和９年３月31日まで"),
  ]);
  assert.deepEqual(steps.map((s) => s.labelRaw), ["〔問１〕（1つ目）", "〔問１〕（2つ目）"]);
  assert.deepEqual(steps[1].expected.values, [8, 10, 1, 9, 3, 31]);
});
