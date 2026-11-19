// 答練パーサーの単体テスト。教材の原文は使わず、型だけをまねた作り物のデータで確かめる。

import { test } from "node:test";
import assert from "node:assert/strict";
import { removeWatermark } from "../src/extract/extract.mjs";
import { pageRows } from "../src/common/rows.mjs";
import {
  parseDaimon,
  parseToiHeading,
  parseShomonHeading,
  parseEdamonHeading,
  parseOptionLine,
  parseWordBankLine,
  parseSheetHeading,
  parseGuidanceHeading,
  parseOptionJudgement,
} from "../src/exam/patterns.mjs";
import { blanksInPassageRow, buildProblemTree } from "../src/exam/problem.mjs";
import { classifyUnit, sheetUnits } from "../src/exam/answerKey.mjs";
import { buildGuidance } from "../src/exam/guidance.mjs";
import { formCandidates } from "../src/exam/forms.mjs";
import { runStructureChecks } from "../src/gateChecks/gateChecks.mjs";

const span = (text, x0, y0, x1 = x0 + 10 * text.length, size = 10) => ({ text, bbox: [x0, y0, x1, y0 + size], size, font: "F", flags: 0 });
const page = (no, lines) => ({ page: no, width: 600, height: 850, lines: lines.map((spans, i) => ({ block: i, bbox: spans[0].bbox, spans })) });
const doc = (docId, pages) => ({ docId, pages });

test("透かしの行は、そのかたまりごと取り除く", () => {
  const p = { page: 1, lines: [
    { block: 0, bbox: [0, 0, 1, 1], spans: [span("本文", 0, 100)] },
    { block: 3, bbox: [0, 0, 1, 1], spans: [span("会員番：", 0, 10)] },
    { block: 3, bbox: [0, 0, 1, 1], spans: [span("氏名：テスト", 200, 10)] },
  ] };
  const r = removeWatermark(p);
  assert.equal(r.removedLineCount, 2);
  assert.equal(r.page.lines.length, 1);
});

test("同じ高さの span は1行にまとめ、左から並べる", () => {
  const rows = pageRows(doc("d", []), page(1, [[span("エ", 150, 200)], [span("①", 100, 201)], [span("下の行", 100, 230)]]));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].spans.map((s) => s.text), ["①", "エ"]);
  assert.equal(rows[0].text, "① エ");
});

test("見出しの形", () => {
  assert.deepEqual(parseDaimon("〔 第 ニ 問 〕 "), { no: 2, points: null, kanjiRaw: "ニ" });
  assert.equal(parseDaimon("〔第一問〕 －25点－").points, 25);
  assert.deepEqual(parseToiHeading("問１(11点) "), { no: 1, points: 11, rest: "" });
  assert.deepEqual(parseShomonHeading("２ 次の文章は、"), { no: 2, rest: "次の文章は、" });
  assert.equal(parseShomonHeading("１. 引用文の項番号"), null);
  assert.deepEqual(parseEdamonHeading(" (3) 空欄に"), { no: 3, rest: "空欄に" });
  assert.deepEqual(parseOptionLine("ウ 選択肢の文 "), { symbol: "ウ", text: "選択肢の文" });
});

test("語群の行は、記号と語句の組に分ける", () => {
  assert.deepEqual(parseWordBankLine(" ア 語甲   イ 語乙  ウ  語丙 "), [
    { symbol: "ア", text: "語甲" },
    { symbol: "イ", text: "語乙" },
    { symbol: "ウ", text: "語丙" },
  ]);
  assert.equal(parseWordBankLine("ふつうの文"), null);
});

test("答案用紙の見出し: 金額を見出しと取り違えない", () => {
  assert.deepEqual(parseSheetHeading(" １(1) "), { toi: null, shomon: 1, edamon: 1, rest: "" });
  assert.deepEqual(parseSheetHeading("(2) 名称 "), { toi: null, shomon: null, edamon: 2, rest: "名称" });
  assert.deepEqual(parseSheetHeading("問２ "), { toi: 2, shomon: null, edamon: null, rest: "" });
  assert.equal(parseSheetHeading("5,100 "), null);
  assert.deepEqual(parseSheetHeading("３"), { toi: null, shomon: 3, edamon: null, rest: "" });
});

test("解答への道の見出しと〇×", () => {
  assert.deepEqual(parseGuidanceHeading("１(2)及び(3)について "), [
    { shomon: 1, edamon: 2 },
    { shomon: 1, edamon: 3 },
  ]);
  assert.deepEqual(parseGuidanceHeading("２について"), [{ shomon: 2, edamon: null }]);
  assert.equal(parseGuidanceHeading("ほかについて"), null);
  assert.deepEqual(parseOptionJudgement("エ ×：理由の文。"), { symbol: "エ", mark: "×", markRaw: "×", reason: "理由の文。" });
  assert.equal(parseOptionJudgement("ア 〇").mark, "○");
});

test("本文の空欄は前後に空白がある丸数字だけ（行頭の箇条は空欄にしない）", () => {
  assert.deepEqual(blanksInPassageRow("ある語は  ①  であり  ② "), ["①", "②"]);
  assert.deepEqual(blanksInPassageRow("① 前提の箇条"), []);
});

test("問い方の候補", () => {
  assert.deepEqual(formCandidates("空欄から当てはまるものを【語群】から選び、記号で答えなさい。").map((c) => c.form), ["choose_from_word_bank"]);
  assert.deepEqual(formCandidates("適切でないものを２つ選び、記号で答えなさい。"), [{ form: "choose_options", evidence: "２つ選び", count: 2 }]);
  assert.deepEqual(formCandidates("名称を答え、金額を計算しなさい。").map((c) => c.form).sort(), ["calculate", "write_terms"]);
  assert.deepEqual(formCandidates("定義を答えなさい。").map((c) => c.form), ["write_text"]);
  assert.deepEqual(formCandidates("よく読むこと。"), []);
});

test("問題の木: 大問 → 問 → 小問 → 枝問。選択肢・語群を節に付ける", () => {
  const p = page(1, [
    [span("〔第一問〕 －25点－", 77, 70)],
    [span("問１(10点) ", 77, 90)],
    [span("次の文章を読み、問に答えなさい。", 87, 108)],
    [span("甲とは、  ①  をいう。", 93, 126)],
    [span("１ 空欄に当てはまる語句を【語群】から選び、記号で答えなさい。", 77, 144)],
    [span("【語群】", 77, 162)],
    [span(" ア 語甲  イ 語乙", 99, 180)],
    [span("２ 次の文章について答えなさい。", 77, 198)],
    [span("(1) 適切なものを１つ選び、記号で答えなさい。", 87, 216)],
    [span("ア 一つ目", 97, 234)],
    [span("イ 二つ目の", 97, 252)],
    [span("続き", 107, 270)],
    [span("〔第三問〕 －50点－", 77, 300)],
    [span("計算の問題", 77, 320)],
  ]);
  const rows = pageRows(doc("A", []), p);
  const { nodes } = buildProblemTree({ setId: "x", rows, daimonNos: [1] });
  const ids = nodes.map((n) => n.id);
  assert.deepEqual(ids, ["x:d1", "x:d1:t1", "x:d1:t1:s1", "x:d1:t1:s2", "x:d1:t1:s2:e1", "x:d3"]);
  const toi = nodes[1];
  assert.deepEqual(toi.blankLabels, ["①"]);
  const s1 = nodes[2];
  assert.deepEqual(s1.wordBank.entries.map((e) => e.symbol), ["ア", "イ"]);
  const e1 = nodes[4];
  assert.deepEqual(e1.options.map((o) => o.text), ["一つ目", "二つ目の続き"]);
  assert.equal(nodes[5].outOfScope, true);
});

test("答案用紙に無い文字を答えとし、隣の欄の名前を付ける（行の数がずれても単位ごとに比べる）", () => {
  const sheet = pageRows(doc("B", []), page(1, [
    [span("問１ ", 85, 100)],
    [span(" １ ", 85, 120)],
    [span("①", 108, 140), span("  ", 120, 140), span("②", 193, 140), span(" ", 205, 140)],
    [span(" ２ ", 85, 160)],
    [span(" 甲とは、", 100, 180), span(" ", 256, 180), span("をいう。", 339, 180)],
    [span(" ", 105, 200)],
  ]));
  const answer = pageRows(doc("C", []), page(1, [
    [span("問１ ", 85, 100)],
    [span(" １ ", 85, 120)],
    [span("①", 109, 140), span("エ", 152, 140), span("②  語乙", 194, 140)],
    [span(" ２ ", 85, 160)],
    [span(" 甲とは、", 100, 180), span("答えの語 ", 220, 180), span("をいう。", 339, 180)],
    [span("余分な行", 340, 190)],
  ]));
  const su = new Map(sheetUnits(sheet, 1).map((u) => [u.key, u]));
  const au = sheetUnits(answer, 1);
  const u1 = classifyUnit(au.find((u) => u.key === "d1/t1/s1/e-"), su.get("d1/t1/s1/e-"));
  assert.deepEqual(u1.segments.filter((s) => s.type === "slot").map((s) => [s.label, s.text]), [["①", "エ"], ["②", "語乙"]]);
  const u2 = classifyUnit(au.find((u) => u.key === "d1/t1/s2/e-"), su.get("d1/t1/s2/e-"));
  const slots = u2.segments.filter((s) => s.type === "slot");
  assert.equal(slots[0].label, null);
  assert.equal(slots[0].text, "答えの語");
  assert.equal(slots[1].text, "余分な行"); // 答案用紙に無い文字は答えとして残す（捨てない）
});

test("解答への道: 見出しで区切り、選択肢ごとの〇×と理由の続きの行を持つ", () => {
  const rows = pageRows(doc("C", []), page(2, [
    [span("問１ ", 85, 90)],
    [span("１について ", 85, 108)],
    [span(" 説明の行。", 96, 126)],
    [span("２(1)及び(2)について ", 85, 144)],
    [span("ア 〇 ", 96, 162)],
    [span("イ ×：理由の", 96, 180)],
    [span("続き。", 106, 198)],
    [span("したがって、「イ」を選択する。", 96, 216)],
  ]));
  const { blocks } = buildGuidance(rows, 1);
  // 「問１」の直下に行が無いので、その空のブロックは残さない
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].toi, 1);
  assert.deepEqual(blocks[0].refs, [{ shomon: 1, edamon: null }]);
  assert.deepEqual(blocks[1].refs, [{ shomon: 2, edamon: 1 }, { shomon: 2, edamon: 2 }]);
  assert.deepEqual(blocks[1].optionJudgements.map((j) => [j.symbol, j.mark, j.reason]), [["ア", "○", null], ["イ", "×", "理由の続き。"]]);
});

test("検査: 透かし・id の重複・出典なしを見つける", () => {
  const bad = { nodes: [{ id: "a", source: [{}] }, { id: "a", source: [] }], note: "氏名：テスト" };
  const r = runStructureChecks(bad);
  assert.equal(r.ok, false);
  assert.equal(r.violations.length, 3);
  assert.equal(runStructureChecks({ nodes: [{ id: "a", source: [{}] }] }).ok, true);
});
