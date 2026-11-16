// 教材構造 → 問題データ（Exercise View）の変換のテスト。作り物のデータだけを使う。

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildShohizeiExerciseView } from "../src/exerciseView/buildExerciseView.mjs";

const src = (page, line, x1 = 300) => ({ doc: "d", page, line, bbox: [50, line * 10, x1, line * 10 + 9] });
const L = (text, page, line, extra = {}) => ({ text, source: src(page, line, extra.x1), ...extra });
const marker = (raw) => ({ kind: "paren-number", raw });

function training(answerLines) {
  return {
    meta: { bookId: "t1" },
    children: [
      {
        raw: "第1回",
        parsed: { no: 1 },
        children: [
          {
            id: "t1:problem-1",
            stableId: "t1:problem-1",
            parsed: { no: 1, titleRaw: "サンプル" },
            source: [src(1, 0), src(1, 1)],
            question: {
              instructionRaw: "Aに○、Bに×を付しなさい。",
              formCandidates: [{ form: "true_false_set", evidence: "x" }],
              lines: [L("指示", 1, 2), L("(1) 取引その1", 1, 3, { marker: marker("(1)") }), L("(2) 取引その2", 1, 4, { marker: marker("(2)") })],
            },
            answer: { lines: answerLines },
            guidance: null,
          },
        ],
      },
    ],
  };
}

test("〇×: 1問1行の解答から、問題ごとに true_false を作る（理由は解説へ）", () => {
  const view = buildShohizeiExerciseView({
    trainings: [
      training([
        L("(1) ○", 2, 0, { judgement: { itemNo: 1, symbol: "○", reasonRaw: null } }),
        L("(2) × 理由", 2, 1, { judgement: { itemNo: 2, symbol: "×", reasonRaw: "理由" } }),
      ]),
    ],
  });
  assert.equal(view.meta.subject, "shohizei");
  const tf = view.exercises.filter((e) => e.exerciseType === "true_false");
  assert.deepEqual(tf.map((e) => e.judgement.symbolRaw.text), ["○", "×"]);
  assert.equal(tf[1].explanation.raw.text, "理由");
  assert.equal(tf[0].explanation, null);
  assert.notEqual(tf[0].stableItemIds[0], tf[1].stableItemIds[0]);
});

test("〇×: まとめ書き（○ …… (1)、× …… (2)）も読む", () => {
  const view = buildShohizeiExerciseView({
    trainings: [training([L("○ ………… (1)", 2, 0), L("× ………… (2)", 2, 1)])],
  });
  assert.deepEqual(
    view.exercises.map((e) => e.judgement.symbolRaw.text),
    ["○", "×"],
  );
});

test("〇×: 同じ番号が○にも×にもあれば作らない", () => {
  const view = buildShohizeiExerciseView({
    trainings: [training([L("○ ………… (1)、(2)", 2, 0), L("× ………… (2)", 2, 1)])],
  });
  assert.deepEqual(view.exercises.map((e) => e.stableItemIds[0]), ["t1:problem-1:item-1"]);
  assert.ok(view.diagnostics.some((d) => d.reason === "true-false-grouped-conflict"));
});

function theory(headingChildren, headingLines = []) {
  return {
    meta: { bookId: "tm" },
    children: [
      {
        kind: "theme",
        stableId: "tm:theme-1",
        parsed: { no: 1, titleRaw: "総則" },
        children: [
          {
            kind: "theory",
            id: "tm:theory-1",
            stableId: "tm:theory-1-1",
            parsed: { code: "1-1", codeRaw: "1－1", titleRaw: "題", rankRaw: "Ａ" },
            source: [src(1, 0)],
            children: [
              {
                kind: "heading",
                id: "tm:heading-1",
                parsed: { markerRaw: "１．", titleRaw: "見出し", importanceRaw: "◎" },
                source: [src(1, 1)],
                lines: headingLines,
                children: headingChildren,
              },
            ],
          },
        ],
      },
    ],
  };
}
const clause = (raw, lines, children = []) => ({ kind: "clause", id: `c-${raw}`, parsed: { marker: { depth: 1, kind: "paren-number", raw } }, source: [lines[0].source], lines, children });

test("暗記カード: (1)(2) ごとに1枚。見出しが問い、本文が答え", () => {
  const view = buildShohizeiExerciseView({
    theories: [theory([clause("(1)", [L("(1) 小見出しA", 1, 2), L("本文A", 1, 3)]), clause("(2)", [L("(2) 小見出しB", 1, 4), L("本文B", 1, 5)])])],
  });
  const cards = view.exercises.filter((e) => e.exerciseType === "recall_text");
  assert.equal(cards.length, 2);
  assert.match(cards[0].prompt.text, /小見出しA/);
  assert.equal(cards[0].answerRich.length, 1);
  assert.equal(cards[0].expectedAnswer[0].answerText.text, "本文A");
});

test("暗記カード: (1) が1行だけの列挙なら、見出しごとに1枚にまとめる", () => {
  const view = buildShohizeiExerciseView({
    theories: [theory([clause("(1)", [L("(1) 項目A", 1, 2)]), clause("(2)", [L("(2) 項目B", 1, 3)])])],
  });
  const cards = view.exercises.filter((e) => e.exerciseType === "recall_text");
  assert.equal(cards.length, 1);
  assert.equal(cards[0].answerRich.length, 2);
});

test("暗記カード: 右端まで届いた行の次だけを折り返しの続きにする", () => {
  const view = buildShohizeiExerciseView({
    theories: [
      theory([
        clause("(1)", [L("(1) 小見出し", 1, 2, { x1: 120 }), L("長い本文が右端まで", 1, 3, { x1: 370 }), L("続き", 1, 4, { x1: 200 }), L("短い行", 1, 5, { x1: 150 }), L("次の段落", 1, 6, { x1: 370 })]),
      ]),
    ],
  });
  assert.deepEqual(view.exercises[0].answerRich.map((l) => l.continues), [false, true, false, false]);
});

test("並べ替え: 暗記カードの本文を「、」「。」でピースにし、つなげると本文に戻る", () => {
  const view = buildShohizeiExerciseView({
    theories: [theory([clause("(1)", [L("(1) 小見出し", 1, 2, { x1: 120 }), L("Aは、Bにより行う。ただし、Cとする。", 1, 3, { x1: 200 })])])],
  });
  const ord = view.exercises.filter((e) => e.exerciseType === "ordering");
  assert.equal(ord.length, 1);
  assert.deepEqual(ord[0].orderingItems.map((i) => i.text), ["Aは、", "Bにより行う。", "ただし、", "Cとする。"]);
  assert.deepEqual(ord[0].correctOrder, ["item-0", "item-1", "item-2", "item-3"]);
  assert.equal(ord[0].assembledFromSource, true);
  assert.equal(ord[0].sourceExerciseId, view.exercises[0].exerciseId, "元の暗記カードのすぐ後ろに置く");
  assert.equal(ord[0].orderingMeta.referenceText, "Aは、Bにより行う。ただし、Cとする。", "編集画面の完全一致の基準");
});

test("並べ替え: 区切りが無い本文は文節で分け、それでも2つに満たなければ作らない", () => {
  const split = (t) => (t.includes("と") ? [t.slice(0, t.indexOf("と")), t.slice(t.indexOf("と"))] : [t]);
  const one = buildShohizeiExerciseView({
    phraseSplit: split,
    theories: [theory([clause("(1)", [L("(1) 見出し", 1, 2, { x1: 120 }), L("AとB", 1, 3, { x1: 100 })])])],
  });
  assert.deepEqual(one.exercises.find((e) => e.exerciseType === "ordering").orderingItems.map((i) => i.text), ["A", "とB"]);
  const none = buildShohizeiExerciseView({
    phraseSplit: split,
    theories: [theory([clause("(1)", [L("(1) 見出し", 1, 2, { x1: 120 }), L("AB", 1, 3, { x1: 100 })])])],
  });
  assert.equal(none.exercises.filter((e) => e.exerciseType === "ordering").length, 0);
  assert.ok(none.diagnostics.some((d) => d.reason === "ordering-skipped-too-few-pieces"));
});

test("並べ替え: ピースが12個を超えるカードは段落の切れ目で分ける", () => {
  const para = (i) => L(`${"x、".repeat(6)}終わり${i}。`, 1, 3 + i, { x1: 100 }); // 1段落7ピース
  const view = buildShohizeiExerciseView({
    theories: [theory([clause("(1)", [L("(1) 見出し", 1, 2, { x1: 120 }), para(0), para(1), para(2)])])],
  });
  const ord = view.exercises.filter((e) => e.exerciseType === "ordering");
  assert.equal(ord.length, 3);
  assert.ok(ord.every((e) => e.orderingItems.length <= 12));
  assert.match(ord[0].prompt.text, /（1／3）$/);
});
