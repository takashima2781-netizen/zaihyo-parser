// 消費税パーサーの単体テスト。教材の原文は使わず、型だけを再現した作り物のデータで確かめる。

import { test } from "node:test";
import assert from "node:assert/strict";
import { removeWatermark } from "../src/extract/extract.mjs";
import { restoreFractions, findFractionCandidates } from "../src/common/fractions.mjs";
import {
  parseTocLine,
  parseProblemHeading,
  parseTime,
  parseJudgement,
  findBlanks,
  questionFormCandidates,
} from "../src/training/patterns.mjs";
import { segmentLine } from "../src/theory/buildTheory.mjs";
import { runGateChecks } from "../src/gateChecks/gateChecks.mjs";

const span = (text, x0, y0, x1, y1, size = 9) => ({ text, bbox: [x0, y0, x1, y1], size, font: "F", flags: 0 });
const line = (text, bbox, extra = {}) => ({
  text,
  role: null,
  spans: [span(text, ...bbox)],
  bbox,
  block: extra.block ?? 0,
  source: { doc: "d", page: 1, line: extra.lineNo ?? 0, bbox },
  ...extra,
});

test("透かしの行は、そのかたまりごと取り除き、数だけ残す", () => {
  const page = {
    page: 1,
    lines: [
      { block: 0, bbox: [0, 0, 1, 1], spans: [span("本文", 0, 0, 1, 1)] },
      { block: 7, bbox: [0, 0, 1, 1], spans: [span("会員番：", 0, 0, 1, 1)] },
      { block: 7, bbox: [0, 0, 1, 1], spans: [span("0000", 0, 0, 1, 1)] },
    ],
  };
  const r = removeWatermark(page);
  assert.equal(r.removedLineCount, 2);
  assert.deepEqual(r.page.lines.map((l) => l.spans[0].text), ["本文"]);
});

test("分数: 縦に並んだ数字2つを、真横の行の空白に戻す", () => {
  const host = line("1,000×   ＝900", [80, 108, 200, 117]);
  host.spans = [span("1,000×   ＝900", 80, 108, 200, 117)];
  // 行の幅 120pt に対して空白（3字）はおよそ x=131〜157 にある
  const num = line("90", [138, 102, 150, 111], { block: 5, lineNo: 1 });
  const den = line("100", [136, 114, 152, 123], { block: 5, lineNo: 2 });
  const { lines, unresolved } = restoreFractions([host, num, den]);
  assert.equal(unresolved.length, 0);
  const segs = lines[0].segments;
  assert.equal(segs.length, 3);
  assert.deepEqual([segs[1].kind, segs[1].numerator, segs[1].denominator], ["fraction", "90", "100"]);
  assert.equal(lines[0].text, "1,000×   ＝900", "原文の行は書き換えない");
  assert.equal(lines[1].role, "fractionPart");
});

test("分数: 入る空白が見つからなければ戻さず unresolved に残す", () => {
  const host = line("空白なしの行", [80, 108, 200, 117]);
  const num = line("1", [120, 102, 126, 111], { lineNo: 1 });
  const den = line("2", [120, 114, 126, 123], { lineNo: 2 });
  const { lines, unresolved } = restoreFractions([host, num, den]);
  assert.equal(unresolved.length, 1);
  assert.equal(unresolved[0].reason, "fraction-host-not-found");
  assert.equal(lines[0].segments, undefined);
});

test("分数: 分母が「７＋３」のような和でも候補になる", () => {
  const c = findFractionCandidates([line("３", [100, 0, 110, 9], { lineNo: 0 }), line("７＋３", [96, 11, 114, 20], { lineNo: 1 })]);
  assert.equal(c.length, 1);
  assert.equal(c[0].denominator, "７＋３");
});

test("目次の行を読む（回・問題・難度・シート・ページ）", () => {
  assert.deepEqual(parseTocLine("第 ２ 回"), { kind: "session", no: 2 });
  const p = parseTocLine("問題12 サンプル・その２〔応用〕（シートあり） ·········· 5 （10）");
  assert.equal(p.no, 12);
  assert.equal(p.titleRaw, "サンプル・その２");
  assert.equal(p.levelRaw, "応用");
  assert.equal(p.hasSheet, true);
  assert.deepEqual([p.problemPage, p.answerPage], [5, 10]);
  assert.equal(parseTocLine("問題１ 学習記録の欄"), null);
});

test("問題の見出し・目安時間・〇×の解答・空欄", () => {
  const h = parseProblemHeading("問題３ サンプル・その３（シートあり）");
  assert.deepEqual([h.no, h.titleRaw, h.seriesRaw, h.hasSheetMark], [3, "サンプル・その３", "その３", true]);
  assert.equal(parseTime("１分").minutes, 1);
  assert.equal(parseTime("－55分－").minutes, 55);
  const j = parseJudgement("(2)  × 理由の文");
  assert.deepEqual([j.itemNo, j.symbol, j.reasonRaw], [2, "×", "理由の文"]);
  assert.equal(parseJudgement("(3)  〇").symbol, "○");
  assert.deepEqual(findBlanks("A × [ ① ] ＝ B － [ ② ]"), ["①", "②"]);
});

test("問い方の候補は言い回しを根拠にし、3区分のときは〇×を外す", () => {
  assert.deepEqual(questionFormCandidates("次の資料から、税額を求めなさい。").map((c) => c.form), ["calculation"]);
  const three = questionFormCandidates("Aとなるものに○、Bとなるものに△、Cとなるものに×を付しなさい。");
  assert.deepEqual(three.map((c) => c.form), ["classify_items"]);
  assert.deepEqual(questionFormCandidates("当てはまらない文").length, 0);
});

test("理論の行: 小さい文字を条文番号・カッコ書き・不明に分ける", () => {
  const l = {
    spans: [
      { text: "本文", size: 8.5 },
      { text: "（法１①）", size: 7.5 },
      { text: "本文の続き", size: 8.5 },
      { text: "（カッコ書きが", size: 7.5 },
    ],
  };
  const r = segmentLine(l, 8.5, 0);
  assert.deepEqual(r.segments.map((s) => s.role ?? s.style), ["body", "articleRef", "body", "parenthetical"]);
  assert.equal(r.openParen, 1, "閉じていないカッコは次の行へ持ち越す");
  const next = segmentLine({ spans: [{ text: "続いて閉じる。）", size: 7.5 }, { text: "本文", size: 8.5 }] }, 8.5, r.openParen);
  assert.equal(next.segments[0].role, "parenthetical");
  assert.equal(next.openParen, 0);
  const lone = segmentLine({ spans: [{ text: "小さいだけの文", size: 7.5 }] }, 8.5, 0);
  assert.equal(lone.segments[0].role, "unknown");
});

test("検査: 透かしの文字・id の重複・出典なしを見つける", () => {
  assert.equal(runGateChecks({ children: [{ id: "a", source: [{}] }] }).ok, true);
  assert.equal(runGateChecks({ text: "氏名：サンプル" }).ok, false);
  assert.equal(runGateChecks({ children: [{ id: "a", source: [{}] }, { id: "a", source: [{}] }] }).ok, false);
  assert.equal(runGateChecks({ children: [{ id: "b", source: [] }] }).ok, false);
});

test("分数: 左右に分かれた行のあいだの分数は、左の行に分数と右の行をつなげる", () => {
  const left = line("7,000×", [90, 108, 130, 117]);
  const right = line("＝700", [150, 108, 180, 117], { lineNo: 3 });
  const num = line("10", [134, 102, 144, 111], { lineNo: 1 });
  const den = line("100", [132, 114, 146, 123], { lineNo: 2 });
  const { lines, unresolved } = restoreFractions([left, num, den, right]);
  assert.equal(unresolved.length, 0);
  assert.deepEqual(lines[0].segments.map((s) => s.text ?? `${s.numerator}/${s.denominator}`), ["7,000×", "10/100", "＝700"]);
  assert.equal(lines[3].role, "fractionJoined");
});

test("分数: 分子と分母のあいだに横線が無ければ分数とみなさない（表の数字の上下）", () => {
  const num = line("5,000", [100, 100, 130, 109], { lineNo: 0 });
  const den = line("0", [100, 112, 130, 121], { lineNo: 1 });
  assert.equal(findFractionCandidates([num, den], []).length, 0);
  assert.equal(findFractionCandidates([num, den], [{ rect: [99, 110, 131, 110.5] }]).length, 1);
  assert.equal(findFractionCandidates([num, den], [{ rect: [20, 110, 400, 110.5] }]).length, 0, "表の罫線のような長い線は数えない");
});

test("分数: 分子が行の上・分母が行の下にはみ出していても（あいだを行が通る）、その行の空白に戻す", () => {
  const host = line("6,000×   ＝5,454", [96, 591, 200, 600]);
  const num = line("100", [131, 582, 149, 591], { lineNo: 1 });
  const den = line("110", [131, 600, 149, 609], { lineNo: 2 });
  const { lines, unresolved } = restoreFractions([num, host, den]);
  assert.equal(unresolved.length, 0);
  assert.deepEqual(lines[1].segments.map((s) => s.text ?? `${s.numerator}/${s.denominator}`), ["6,000×", "100/110", "＝5,454"]);
});

test("分数: 1行に分数が2つ・空白も2つなら、左から順に入れる（行末の空白にも入る）", () => {
  const host = line("Ａ＋Ｂ×    ×   ", [100, 644, 213, 653]);
  const n1 = line("12", [163, 638, 175, 647], { lineNo: 1 });
  const d1 = line("９", [163, 650, 176, 659], { lineNo: 2 });
  const n2 = line("６", [198, 637, 207, 646], { lineNo: 3 });
  const d2 = line("12", [198, 650, 207, 659], { lineNo: 4 });
  const { lines, unresolved } = restoreFractions([host, n1, d1, n2, d2]);
  assert.equal(unresolved.length, 0);
  assert.deepEqual(lines[0].segments.filter((s) => s.kind === "fraction").map((s) => `${s.numerator}/${s.denominator}`), ["12/９", "６/12"]);
});

test("分数: 行の頭の分数は、右の行の頭に入れる", () => {
  const right = line(" ＝310,000≦4,000,000", [145, 125, 316, 134]);
  const num = line("1,860,000", [92, 119, 137, 128], { lineNo: 1 });
  const den = line("６", [108, 131, 121, 140], { lineNo: 2 });
  const { lines, unresolved } = restoreFractions([right, num, den]);
  assert.equal(unresolved.length, 0);
  assert.equal(lines[0].segments[0].kind, "fraction");
});

test("分数: まわりに行が無くても、分数の線があれば分子の行を分数として出す。線が無ければ戻さない", () => {
  const num = line("77,500,000", [199, 327, 249, 336], { lineNo: 1 });
  const den = line("77,515,000", [199, 339, 249, 348], { lineNo: 2 });
  const withBar = restoreFractions([num, den], [{ rect: [189, 338, 254, 338] }]);
  assert.equal(withBar.unresolved.length, 0);
  assert.equal(withBar.lines[0].segments[0].kind, "fraction");
  assert.equal(withBar.lines[1].role, "fractionPart");
  assert.equal(restoreFractions([num, den]).unresolved.length, 1);
});

test("分数: 文字のかたまりの境目で分かれた空白は1つとして扱う", () => {
  const host = line("77,000×      ＝5,460", [87, 177, 202, 186]);
  host.spans = [span("77,000×    ", 87, 177, 145, 186), span("  ＝5,460", 145, 177, 202, 186)];
  const num = line("7.8", [133, 171, 151, 180], { lineNo: 1 });
  const den = line("110", [133, 183, 151, 192], { lineNo: 2 });
  const { lines, unresolved } = restoreFractions([host, num, den]);
  assert.equal(unresolved.length, 0);
  assert.equal(lines[0].segments.filter((s) => s.kind === "fraction").length, 1);
});

test("分数: 同じ数字が同じ位置に重ねて書かれていても、1つの分数として戻す", () => {
  const host = line("Ａ×     ×80％＋Ｂ×     ×50％", [98, 640, 422, 649]);
  const parts = [
    line("6.24", [204, 634, 222, 643], { lineNo: 1 }),
    line("108", [207, 646, 220, 655], { lineNo: 2 }),
    line("6.24", [204, 634, 222, 643], { lineNo: 3 }),
    line("108", [207, 646, 220, 655], { lineNo: 4 }),
    line("6.24", [343, 634, 361, 643], { lineNo: 5 }),
    line("108", [346, 646, 359, 655], { lineNo: 6 }),
  ];
  const { lines, unresolved } = restoreFractions([host, ...parts]);
  assert.equal(unresolved.length, 0);
  assert.equal(lines[0].segments.filter((s) => s.kind === "fraction").length, 2);
  assert.equal(lines[3].role, "overprint");
});
