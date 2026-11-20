// 問題データ化（第2層）と合流のテスト。教材の原文は使わず、型だけをまねた作り物のデータで確かめる。

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExamExercises, GENERATOR, joinRows } from "../src/exerciseView/buildExerciseView.mjs";
import { mergeExerciseViews, POINTCHECK_BOOK } from "../src/merge/merge.mjs";

const src = (row, page = 1, doc = "A") => ({ doc, page, row, bbox: [80, row * 18, 500, row * 18 + 10] });
const row = (text, n, x = 80) => ({ text, x, source: src(n) });

function node(id, kind, no, parent, extra = {}) {
  return {
    id,
    kind,
    parent,
    heading: { text: "", source: src(0), x: 77 },
    parsed: { no },
    source: [src(0)],
    instruction: [],
    passage: [],
    options: [],
    wordBank: null,
    labeledItems: [],
    blankLabels: [],
    instructionText: "",
    children: [],
    formCandidates: [],
    ...extra,
  };
}

const slot = (text, label = null) => ({ type: "slot", label, text, lines: [{ text }], sources: [src(1, 1, "C")] });
const answer = (segments) => ({ key: "k", heading: { text: "", source: src(0, 1, "C") }, segments });

function structureWith(q, { toi = {}, guidance = [] } = {}) {
  const d = node("x:d1", "daimon", 1, null, { heading: { text: "〔第一問〕 －25点－", source: src(0), x: 77 } });
  const t = node("x:d1:t1", "toi", 1, d.id, toi);
  d.children = [t.id];
  t.children = [q.id];
  q.parent = t.id;
  if (guidance.length) q.guidance = guidance;
  return { set: { id: "x", title: "回", book: { id: "b", title: "教材" } }, nodes: [d, t, q] };
}

test("段落のつなぎ: 折り返しはつなぎ、項番号・字下げ・節の境目で改める", () => {
  const text = joinRows([
    { text: "一行目の途中", x: 83 },
    { text: "の続き。", x: 83 },
    { text: "次の段落は字下げ", x: 93 },
    { text: "１. 項番号の行", x: 83 },
    { text: "節の境目", x: 83, paragraphStart: true },
  ]);
  assert.equal(text, "一行目の途中の続き。\n次の段落は字下げ\n１. 項番号の行\n節の境目");
});

test("語群から選ぶ: 空欄ごとの choice_item。語群に無い答えは作らない", () => {
  const q = node("x:d1:t1:s1", "shomon", 1, null, {
    instructionText: "空欄 ① から ② に当てはまる語句を【語群】から選び",
    formCandidates: [{ form: "choose_from_word_bank" }],
    wordBank: { entries: [{ symbol: "ア", text: "語甲" }, { symbol: "イ", text: "語乙" }] },
    answer: answer([{ type: "text", text: "①" }, slot("イ", "①"), { type: "text", text: "②" }, slot("ウ", "②")]),
  });
  const diag = [];
  const ex = buildExamExercises(structureWith(q, { toi: { passage: [row("甲は  ①  、乙は  ②  。", 2)], blankLabels: ["①", "②"] } }), { diag });
  assert.equal(ex.length, 1);
  assert.equal(ex[0].exerciseType, "choice_item");
  assert.equal(ex[0].correctChoice, "イ");
  assert.deepEqual(ex[0].choiceOptions.map((o) => o.label), ["ア 語甲", "イ 語乙"]);
  assert.equal(ex[0].structure.book.titleRaw.text, "教材");
  assert.deepEqual(diag.map((d) => d.reason), ["word-bank-answer-not-in-bank"]);
});

test("2つ選ぶ: 解答への道の〇×と解答が合えば選択肢ごとの true_false、食い違えば作らない", () => {
  const options = ["ア", "イ", "ウ"].map((s, i) => ({ symbol: s, text: `文${i}`, rows: [row(`${s} 文${i}`, 5 + i)] }));
  const judgement = (symbol, mark, reason = null) => ({ symbol, mark, markRaw: mark, reason, source: src(9, 2, "C"), rows: [{ text: `${symbol} ${mark}`, source: src(9, 2, "C") }] });
  const make = (answerText, marks) =>
    structureWith(
      node("x:d1:t1:s2", "shomon", 2, null, {
        instructionText: "適切でないものを２つ選び、記号で答えなさい。",
        formCandidates: [{ form: "choose_options", count: 2 }],
        options,
        answer: answer([slot(answerText)]),
      }),
      { guidance: [{ rows: [], optionJudgements: marks.map(([s, m, r]) => judgement(s, m, r)) }] },
    );
  const ok = buildExamExercises(make("ア、ウ", [["ア", "×", "理由甲"], ["イ", "○"], ["ウ", "×", "理由丙"]]));
  assert.deepEqual(ok.map((e) => [e.exerciseType, e.judgement.symbolRaw.text, e.explanation?.raw.text ?? null]), [
    ["true_false", "×", "理由甲"],
    ["true_false", "○", null],
    ["true_false", "×", "理由丙"],
  ]);
  // 食い違えば〇×は作らず、選択肢を見せて解答の記号を答える暗記カードにする（理由は残す）
  const diag = [];
  const fallback = buildExamExercises(make("ア、イ", [["ア", "×"], ["イ", "○"], ["ウ", "×"]]), { diag });
  assert.deepEqual(fallback.map((e) => [e.exerciseType, e.expectedAnswer[0].answerText.text]), [["recall_text", "ア、イ"]]);
  assert.match(fallback[0].prompt.text, /ア 文0/);
  assert.deepEqual(diag.map((d) => [d.reason, d.builtAs]), [["choose-many-judgements-mismatch", "recall_text"]]);
});

test("答えが金額の問いは、指示文に「計算」が無くても計算の問いとして作らない", () => {
  const q = node("x:d1:t1:s5", "shomon", 5, null, { formCandidates: [{ form: "write_terms" }], answer: answer([slot("5,500 千円")]) });
  const diag = [];
  assert.equal(buildExamExercises(structureWith(q), { diag }).length, 0);
  assert.equal(diag[0].reason, "calculation-not-yet");
});

test("記述の欄が2つ以上: 欄の名前ごと1つの模範解答にする", () => {
  const q = node("x:d1:t1:s6", "shomon", 6, null, {
    formCandidates: [{ form: "write_text" }],
    answer: answer([{ type: "text", text: "名称" }, slot("答え一"), { type: "break" }, { type: "text", text: "内容" }, slot("答え二")]),
  });
  const [ex] = buildExamExercises(structureWith(q));
  assert.equal(ex.exerciseType, "recall_text");
  assert.equal(ex.expectedAnswer[0].answerText.text, "名称 答え一\n内容 答え二");
});

test("答案用紙の定型の文に答えを入れる multi_blank。欄の名前は本文に重ねて出さない", () => {
  const q = node("x:d1:t1:s3", "shomon", 3, null, {
    instructionText: "解答欄に適切な語句を記入しなさい。",
    formCandidates: [{ form: "write_terms" }],
    answer: answer([{ type: "text", text: "甲とは、" }, slot("答え一"), { type: "text", text: "をいう。" }, { type: "break" }, { type: "text", text: "Ａ" }, slot("答え二", "Ａ")]),
  });
  const [ex] = buildExamExercises(structureWith(q));
  assert.equal(ex.exerciseType, "multi_blank");
  assert.deepEqual(ex.bodySegments.map((s) => (s.type === "blank" ? `[${s.label}]` : s.text)), ["甲とは、", "[1]", "をいう。", "\n", "[Ａ]"]);
  assert.deepEqual(ex.expectedAnswer.map((a) => a.answerText.text), ["答え一", "答え二"]);
  assert.equal(ex.stableItemIds.length, 2);
});

test("計算の問いはまだ作らず、理由を残す", () => {
  const q = node("x:d1:t1:s4", "shomon", 4, null, { formCandidates: [{ form: "calculate" }], answer: answer([slot("1,000")]) });
  const diag = [];
  assert.equal(buildExamExercises(structureWith(q), { diag }).length, 0);
  assert.equal(diag[0].reason, "calculation-not-yet");
});

test("合流: 前回の答練の問題は入れ替え、土台の問題は残して教材の見出しだけ付ける", () => {
  const pc = { exerciseId: "p1", exerciseType: "true_false", stableItemIds: ["s1"], structure: { theme: { structureNodeId: "t" } } };
  const oldExam = { exerciseId: "old", exerciseType: "choice_item", stableItemIds: ["o"], provenance: { generator: GENERATOR } };
  const base = { meta: { schemaVersion: "v", exerciseCount: 2 }, exercises: [pc, oldExam], withheldExercises: [], exerciseConversions: [{ a: 1 }] };
  const exams = { meta: { sets: ["x"] }, exercises: [{ exerciseId: "new", provenance: { generator: GENERATOR } }] };
  const { merged, stats } = mergeExerciseViews(base, [exams], { generatedAt: "t" });
  assert.deepEqual(merged.exercises.map((e) => e.exerciseId), ["p1", "new"]);
  assert.equal(merged.exercises[0].structure.book, POINTCHECK_BOOK);
  assert.equal(merged.exercises[0].structure.theme.structureNodeId, "t");
  assert.deepEqual(merged.exerciseConversions, [{ a: 1 }]);
  assert.equal(stats.removed, 1);
  assert.equal(base.exercises[0].structure.book, undefined); // 土台のオブジェクトは書き換えない
  assert.throws(() => mergeExerciseViews({ meta: { subject: "boki" }, exercises: [] }, [exams]));
});

test("語群の答えが「①オ ②エ」と1つの欄に読めたとき: 空欄の名前と記号の組に分ける。「ウ、オ」は暗記カード", () => {
  const bank = { entries: ["ア", "イ", "ウ", "エ", "オ"].map((s) => ({ symbol: s, text: `語${s}` })) };
  const q = node("x:d1:t1:s1", "shomon", 1, null, {
    instructionText: "空欄 ① 及び ② に入る語句を語群から選択し",
    formCandidates: [{ form: "choose_from_word_bank" }],
    wordBank: bank,
    answer: answer([slot("①オ ②エ")]),
  });
  const ex = buildExamExercises(structureWith(q));
  assert.deepEqual(ex.map((e) => [e.choiceMeta.blank, e.correctChoice]), [["①", "オ"], ["②", "エ"]]);

  const q2 = node("x:d1:t1:s1", "shomon", 1, null, {
    instructionText: "次の語句から２つ選び",
    formCandidates: [{ form: "choose_from_word_bank" }],
    passage: [row("ア 語甲 イ 語乙 ウ 語丙", 2)],
    answer: answer([slot("ア、ウ")]),
  });
  const diag = [];
  const ex2 = buildExamExercises(structureWith(q2), { diag });
  assert.equal(ex2[0].exerciseType, "recall_text");
  assert.equal(ex2[0].expectedAnswer[0].answerText.text, "ア、ウ");
  assert.deepEqual(diag.map((d) => d.reason), ["word-bank-answer-many"]);
});

test("【選択肢】から1つ選ぶ・表の欄ごとに選ぶ: 語群の語を選択肢にする", () => {
  const wordBank = { entries: [{ symbol: "ア", text: "語甲" }, { symbol: "イ", text: "語乙" }] };
  const q = node("x:d1:t1:s1", "shomon", 1, null, { formCandidates: [{ form: "choose_options", count: 1 }], wordBank, answer: answer([slot("イ")]) });
  assert.equal(buildExamExercises(structureWith(q))[0].correctChoice, "イ");
  const q2 = node("x:d1:t1:s1", "shomon", 1, null, {
    formCandidates: [{ form: "choose_options", count: 1 }],
    wordBank,
    answer: answer([{ type: "text", text: "①" }, slot("ア", "①"), { type: "text", text: "②" }, slot("イ", "②")]),
  });
  assert.deepEqual(buildExamExercises(structureWith(q2)).map((e) => [e.choiceMeta.blank, e.correctChoice]), [["①", "ア"], ["②", "イ"]]);
});

test("1つの文の正誤: 離れて書かれた〇×を正誤、残りを理由にする。「記号欄 理由欄」の解答は並べ直す", () => {
  const q = node("x:d1:t1:s1", "shomon", 1, null, {
    formCandidates: [{ form: "judge_statement" }],
    passage: [row("甲は乙である。", 2)],
    answer: answer([{ type: "slot", label: null, text: "", lines: [{ text: "正誤欄 理由欄" }, { text: " 甲は乙ではなく、" }, { text: " × 丙だからである。" }], sources: [src(1, 1, "C")] }]),
  });
  const [tf] = buildExamExercises(structureWith(q));
  assert.equal(tf.exerciseType, "true_false");
  assert.equal(tf.body.text, "甲は乙である。");
  assert.equal(tf.judgement.symbolRaw.text, "×");
  assert.equal(tf.judgement.answerBodyRaw.text, "甲は乙ではなく、丙だからである。");

  const q2 = node("x:d1:t1:s1", "shomon", 1, null, {
    formCandidates: [{ form: "write_text" }],
    answer: answer([{ type: "slot", label: null, text: "", lines: [{ text: "記号欄 理由欄" }, { text: " 理由の前半" }, { text: " Ａ 理由の後半。" }], sources: [src(1, 1, "C")] }]),
  });
  assert.equal(buildExamExercises(structureWith(q2))[0].expectedAnswer[0].answerText.text, "記号欄 Ａ\n理由欄 理由の前半理由の後半。");
});

test("本文の空欄が表の中で番号の順に並んでいなくても、出てくる順に置く", () => {
  const q = node("x:d1:t1:s1", "shomon", 1, null, {
    formCandidates: [{ form: "write_terms" }],
    answer: answer([{ type: "text", text: "①" }, slot("語甲", "①"), { type: "text", text: "②" }, slot("語乙", "②")]),
  });
  const [ex] = buildExamExercises(structureWith(q, { toi: { passage: [row("表 ② の欄", 2), row("表 ① の欄", 3)], blankLabels: ["②", "①"] } }));
  assert.equal(ex.exerciseType, "multi_blank");
  assert.deepEqual(ex.bodySegments.filter((s) => s.type === "blank").map((s) => s.label), ["②", "①"]);
});
