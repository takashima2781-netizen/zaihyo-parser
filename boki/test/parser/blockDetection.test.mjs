import { test } from "node:test";
import assert from "node:assert/strict";

import {
  detectTermBasedFormulas,
  findNestedParentLabel,
  detectJournalPatterns,
  detectPlainTermFormulas,
  detectAdditionGroupFormulas,
  detectLabelFractionFormulas,
  detectSubtractGroupFormulas,
  detectSubtractGroupDivideFormulas,
} from "../../src/parser/blockDetection.mjs";

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

// 第2ケースの実データ検証で判明した、残存価額ゼロのため減算部分が
// 教材上省略される適用例の形状(`case2_readiness_and_generalization_
// analysis.md`5節1項)。
test("detectTermBasedFormulas: 括弧・減算を伴わない「数値×...＝...」も検出する(適用例の形状)", () => {
  const page = "見出し\n93,000×      ＝12,000\n次の行";
  const result = detectTermBasedFormulas(page);
  assert.equal(result.length, 1);
  assert.equal(result[0].matchedLine, "93,000×      ＝12,000");
});

// 実データ確認: sort=Trueの読み順ヒューリスティックがアイコン隣接文字を
// 並べ替え、「例 ◯◯設」という語順になることを確認済み
// (`case2_readiness_and_generalization_analysis.md`7-1節と同種)。
test("findNestedParentLabel: 候補より前にある「設 例」ラベルを見つける(実データの語順)", () => {
  const page = [
    "架空の見出し",
    "    例 架空の設例タイトル設",
    "架空の問題文…",
    "93,000×      ＝12,000",
  ].join("\n");
  const result = findNestedParentLabel(page, 3);
  assert.ok(result);
  assert.match(result.label, /例.*設/);
  assert.equal(result.lineIndex, 1);
});

test("findNestedParentLabel: ラベルが見つからなければnullを返す(推測しない)", () => {
  const page = ["架空の見出し", "架空の問題文…", "93,000×      ＝12,000"].join("\n");
  assert.equal(findNestedParentLabel(page, 2), null);
});

// 第3ケース(仕訳パターン)の実データ検証で確認した形状
// (`(借)勘定科目×××(貸)勘定科目×××`)。

test("detectJournalPatterns: 仕訳パターン行を検出する", () => {
  const page = "見出し\n(借) 架空勘定Ａ ×××  (貸) 架空勘定Ｂ ×××\n次の行";
  const result = detectJournalPatterns(page);
  assert.equal(result.length, 1);
  assert.equal(result[0].debitAccountRaw, "架空勘定Ａ");
  assert.equal(result[0].creditAccountRaw, "架空勘定Ｂ");
  assert.equal(result[0].detectorId, "journalPatternDetector");
});

test("detectJournalPatterns: 行頭が(借)の場合、inlineLabelRawはnull(第3ケースと同じ挙動)", () => {
  const page = "(借) 架空勘定Ａ ×××  (貸) 架空勘定Ｂ ×××";
  const [candidate] = detectJournalPatterns(page);
  assert.equal(candidate.inlineLabelRaw, null);
});

// 第4ケース(テーマ4-1 手形)の実データ検証で確認した形状。「(借)」の
// 直前に役割ラベル(例: "振出人")が同じ行に同居している。
test("detectJournalPatterns: (借)の前に同居する役割ラベルをinlineLabelRawとして保持する", () => {
  const page = "架空役割                (借) 架空勘定Ａ ×××   (貸) 架空勘定Ｂ ×××";
  const [candidate] = detectJournalPatterns(page);
  assert.equal(candidate.inlineLabelRaw, "架空役割");
  assert.equal(candidate.debitAccountRaw, "架空勘定Ａ");
  assert.equal(candidate.creditAccountRaw, "架空勘定Ｂ");
});

test("detectJournalPatterns: 直前の「(番号) ラベル」をprecedingHeadingとして保持する", () => {
  const page = ["(1) 架空局面", "(借) 架空勘定Ａ ×××  (貸) 架空勘定Ｂ ×××"].join("\n");
  const [candidate] = detectJournalPatterns(page);
  assert.equal(candidate.precedingHeading, "(1) 架空局面");
});

test("detectJournalPatterns: 複数件を検出できる", () => {
  const page = [
    "(1) 架空局面Ａ",
    "(借) 架空勘定Ａ ×××  (貸) 架空勘定Ｂ ×××",
    "(2) 架空局面Ｂ",
    "(借) 架空勘定Ｃ ×××  (貸) 架空勘定Ｄ ×××",
  ].join("\n");
  const result = detectJournalPatterns(page);
  assert.equal(result.length, 2);
  assert.equal(result[0].precedingHeading, "(1) 架空局面Ａ");
  assert.equal(result[1].precedingHeading, "(2) 架空局面Ｂ");
});

test("detectJournalPatterns: (借)/(貸)を含まない行は検出しない", () => {
  const page = "架空の地の文。仕訳は含まれない。";
  assert.equal(detectJournalPatterns(page).length, 0);
});

test("detectJournalPatterns: ×××が片側にしか無い行は検出しない(想定外の形状)", () => {
  const page = "(借) 架空勘定Ａ ×××  (貸) 架空勘定Ｂ 架空額";
  assert.equal(detectJournalPatterns(page).length, 0);
});

// 第5ケース(テーマ11 外貨建取引)の実データ検証で確認した形状
// (括弧・分数を伴わない最も単純な「項×項＝項」)。

test("detectPlainTermFormulas: ラベルの無い単純な「項×項＝項」を検出する", () => {
  const page = "見出し\n架空項Ａ×架空項Ｂ＝架空額\n次の行";
  const result = detectPlainTermFormulas(page);
  assert.equal(result.length, 1);
  assert.equal(result[0].matchedLine, "架空項Ａ×架空項Ｂ＝架空額");
  assert.equal(result[0].formulaRaw, "架空項Ａ×架空項Ｂ＝架空額");
  assert.equal(result[0].termA, "架空項Ａ");
  assert.equal(result[0].termB, "架空項Ｂ");
  assert.equal(result[0].resultTerm, "架空額");
  assert.equal(result[0].inlineLabelRaw, null);
  assert.equal(result[0].detectorId, "plainTermFormulaDetector");
});

test("detectPlainTermFormulas: 空白で区切られたラベルをinlineLabelRawとして保持する(空白ありの実データ形状)", () => {
  const page = "※ 架空項Ａ×架空項Ｂ＝架空額";
  const [candidate] = detectPlainTermFormulas(page);
  assert.equal(candidate.inlineLabelRaw, "※");
  assert.equal(candidate.formulaRaw, "架空項Ａ×架空項Ｂ＝架空額");
});

test("detectPlainTermFormulas: 全角コロンで直接接するラベルもinlineLabelRawとして分離する(空白なしの実データ形状)", () => {
  const page = "架空換算額：架空項Ａ×架空項Ｂ＝架空額";
  const [candidate] = detectPlainTermFormulas(page);
  assert.equal(candidate.inlineLabelRaw, "架空換算額：");
  assert.equal(candidate.formulaRaw, "架空項Ａ×架空項Ｂ＝架空額");
  assert.equal(candidate.termA, "架空項Ａ");
});

test("detectPlainTermFormulas: ×または＝が複数回現れる行は対象外とする(月割計算等の複合式)", () => {
  const page = "架空項Ａ×架空項Ｂ×架空項Ｃ＝架空額";
  assert.equal(detectPlainTermFormulas(page).length, 0);
});

test("detectPlainTermFormulas: パターンに一致しない行は検出しない", () => {
  const page = "架空の地の文。式は含まれない。";
  assert.equal(detectPlainTermFormulas(page).length, 0);
});

test("detectPlainTermFormulas: 複数件を検出できる", () => {
  const page = ["架空項Ａ×架空項Ｂ＝架空額Ａ", "架空項Ｃ×架空項Ｄ＝架空額Ｂ"].join("\n");
  const result = detectPlainTermFormulas(page);
  assert.equal(result.length, 2);
});

// 第6ケース(テーマ7-10 仕入諸掛、按分計算の平均法)の実データ検証で確認した
// 形状(先頭が加算グループ)。

test("detectAdditionGroupFormulas: 「（項＋項）×...＝...」を検出する", () => {
  const page = "見出し\n（架空項Ａ＋架空項Ｂ）×      ＝架空額\n次の行";
  const result = detectAdditionGroupFormulas(page);
  assert.equal(result.length, 1);
  assert.equal(result[0].matchedLine, "（架空項Ａ＋架空項Ｂ）×      ＝架空額");
  assert.equal(result[0].detectorId, "additionGroupFormulaDetector");
});

test("detectAdditionGroupFormulas: 先頭が減算グループの行は検出しない(既存detectTermBasedFormulasの対象)", () => {
  const page = "（架空項Ａ－架空項Ｂ）×架空率＝架空額";
  assert.equal(detectAdditionGroupFormulas(page).length, 0);
});

test("detectAdditionGroupFormulas: 直前の「(番号) ラベル」をprecedingHeadingとして保持する", () => {
  const page = ["(1) 架空方法", "（架空項Ａ＋架空項Ｂ）×      ＝架空額"].join("\n");
  const [candidate] = detectAdditionGroupFormulas(page);
  assert.equal(candidate.precedingHeading, "(1) 架空方法");
});

test("detectAdditionGroupFormulas: パターンに一致しない行は検出しない", () => {
  const page = "架空の地の文。式は含まれない。";
  assert.equal(detectAdditionGroupFormulas(page).length, 0);
});

// Phase C・テーマ7-4(原価率)用: 視覚的な分数(分子が式行の直前、分母が
// 直後の別行)として印字され、式行自体には「項＝」しか現れない形状。
test("detectLabelFractionFormulas: 「項＝」のみの行を検出する", () => {
  const page = "架空項Ａ\n架空率＝\n架空項Ｂ";
  const result = detectLabelFractionFormulas(page);
  assert.equal(result.length, 1);
  assert.equal(result[0].labelTerm, "架空率");
  assert.deepEqual(result[0].contextBefore, ["架空項Ａ"]);
  assert.deepEqual(result[0].contextAfter, ["架空項Ｂ"]);
  assert.equal(result[0].detectorId, "labelFractionFormulaDetector");
});

test("detectLabelFractionFormulas: ×や／を含む行は検出しない(既存検出器の対象)", () => {
  const page = "架空項Ａ×架空項Ｂ＝架空額\n架空率＝架空項Ａ／架空項Ｂ";
  assert.equal(detectLabelFractionFormulas(page).length, 0);
});

test("detectLabelFractionFormulas: 複数件を検出できる", () => {
  const page = "架空項Ａ\n架空率＝\n架空項Ｂ\n\n架空項Ｃ\n架空率２＝\n架空項Ｄ";
  assert.equal(detectLabelFractionFormulas(page).length, 2);
});

// Phase C・テーマ7-2(総記法)用: 先頭が減算で、括弧グループの中に加算と
// 減算が混在する形状。
test("detectSubtractGroupFormulas: 「項－（項＋項－項）＝項」を検出する", () => {
  const page = "見出し\n※ 架空項Ａ－（架空項Ｂ＋架空項Ｃ－架空項Ｄ）＝架空額\n次の行";
  const result = detectSubtractGroupFormulas(page);
  assert.equal(result.length, 1);
  assert.equal(result[0].formulaRaw, "架空項Ａ－（架空項Ｂ＋架空項Ｃ－架空項Ｄ）＝架空額");
  assert.equal(result[0].inlineLabelRaw, "※");
  assert.equal(result[0].detectorId, "subtractGroupFormulaDetector");
});

test("detectSubtractGroupFormulas: 「又は、」で始まる代替表現(先頭に減算グループが無い)は検出しない", () => {
  const page = "又は、架空基準（架空項Ａ－架空項Ｂ－架空項Ｃ）＋架空項Ｄ＝架空額";
  assert.equal(detectSubtractGroupFormulas(page).length, 0);
});

test("detectSubtractGroupFormulas: パターンに一致しない行は検出しない", () => {
  const page = "架空の地の文。式は含まれない。";
  assert.equal(detectSubtractGroupFormulas(page).length, 0);
});

// Phase C・テーマ8-8(償却方法の変更)用: 括弧グループの中に減算が2回現れ、
// 除算記号「÷」を使う形状。
test("detectSubtractGroupDivideFormulas: 「（項－項－項）÷項＝項」を検出する", () => {
  const page = "見出し\n（架空項Ａ－架空項Ｂ－架空項Ｃ）÷架空項Ｄ＝架空額\n次の行";
  const result = detectSubtractGroupDivideFormulas(page);
  assert.equal(result.length, 1);
  assert.equal(result[0].formulaRaw, "（架空項Ａ－架空項Ｂ－架空項Ｃ）÷架空項Ｄ＝架空額");
  assert.equal(result[0].detectorId, "subtractGroupDivideFormulaDetector");
});

test("detectSubtractGroupDivideFormulas: ×を使う行は検出しない(既存detectTermBasedFormulasの対象)", () => {
  const page = "（架空項Ａ－架空項Ｂ）×架空項Ｃ＝架空額";
  assert.equal(detectSubtractGroupDivideFormulas(page).length, 0);
});

test("detectSubtractGroupDivideFormulas: パターンに一致しない行は検出しない", () => {
  const page = "架空の地の文。式は含まれない。";
  assert.equal(detectSubtractGroupDivideFormulas(page).length, 0);
});
