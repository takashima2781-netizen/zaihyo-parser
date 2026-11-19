// テキスト（読む用）の段落の形。教材の原文は使わず、位置だけをまねた作り物の行で確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutReadingLines } from "../src/exerciseView/readingLayout.mjs";

const L = (text, x0, y0, x1, style = "body", page = 1) => ({ text, style, source: { doc: "d", page, bbox: [x0, y0, x1, y0 + 9] } });

test("読む: 右端まで届いた行の次は続き。1行目が1文字下がっていれば段落の字下げ", () => {
  const out = layoutReadingLines([
    L("見出し", 105, 100, 200, "heading"),
    L("あいうえおかきくけこ", 123, 110, 456),
    L("さしすせそ。", 114, 120, 172),
    L("たちつてとなにぬねの", 123, 130, 456),
    L("はひふへほ。", 114, 140, 172),
  ]);
  assert.deepEqual(out.map((o) => o.continues), [false, false, true, false, true]);
  assert.equal(out[1].indent, "first");
  assert.equal(out[1].depth, 0);
});

test("読む: (1) や ※ で始まる行は、前の行が右端まで届いていても新しい段落。※の2行目がそろうなら hanging", () => {
  const out = layoutReadingLines([
    L("あいうえおかきくけこ", 78, 100, 452),
    L("(1) 項目", 69, 110, 130),
    L("※ あいうえおかきくけ", 78, 120, 451),
    L("さしすせそ。", 87, 130, 244),
  ]);
  assert.equal(out[1].continues, false);
  assert.equal(out[2].continues, false);
  assert.equal(out[3].continues, true);
  assert.equal(out[2].indent, "hanging");
});

test("読む: 同じ高さで右隣にある文字は、表のように1行につなぐ", () => {
  const out = layoutReadingLines([L("本文", 114, 80, 456), L("国 税", 137, 100, 168), L("「消費税」等", 184, 100, 411), L("地方税", 137, 110, 168)]);
  assert.equal(out[2].rowJoin, true);
  assert.equal(out[3].continues, false);
});

test("読む: 右端は本文の行で決める（本文より右まで出た見出しがあっても、折り返しをつなぐ）", () => {
  const out = layoutReadingLines([
    L("理論：重要度", 343, 124, 460, "heading"),
    L("あいうえおかきくけこ", 96, 178, 447),
    L("さしすせそ。", 87, 196, 279),
  ]);
  assert.equal(out[2].continues, true);
});

test("読む: 枠の中など狭い所でも、3行以上が同じ右端にそろっていれば、そこを右端として折り返しをつなぐ", () => {
  const out = layoutReadingLines([
    L("本文の行", 96, 100, 456),
    L("枠の中の文章の一行目", 112, 200, 380),
    L("枠の中の文章の二行目", 103, 218, 380),
    L("枠の中の文章の三行目", 103, 236, 380),
    L("おわり。", 103, 254, 200),
  ]);
  assert.deepEqual(out.slice(1).map((o) => o.continues), [false, true, true, true]);
});

test("読む: 短い項目を並べただけのところは、いちばん長い項目でもつながない", () => {
  const out = layoutReadingLines([
    L("本文の行", 96, 100, 456),
    L("第１段階…あいうえお", 112, 200, 300),
    L("第２段階…かき", 112, 218, 240),
    L("第３段階…くけこさし", 112, 236, 320),
  ]);
  assert.deepEqual(out.slice(1).map((o) => o.continues), [false, false, false]);
});

test("読む: 「。」で右端に届いた行の次が1文字下がっていれば、新しい段落", () => {
  const out = layoutReadingLines([
    L("あいうえおかきくけこ", 123, 100, 456),
    L("さしすせそたちつてと。", 114, 118, 456),
    L("なにぬねの", 123, 136, 300),
  ]);
  assert.deepEqual(out.map((o) => o.continues), [false, true, false]);
});

test("読む: 1行だけの段落が、近くの段落の左端から1文字下がって始まっていれば、同じ左端の段落にする", () => {
  const out = layoutReadingLines([
    L("本文の行", 87, 100, 456),
    L("枠の中の文章の一行目", 112, 251, 450),
    L("枠の中の文章の二行目", 103, 269, 300),
    L("したがって、…。", 112, 305, 430),
  ]);
  assert.equal(out[2].continues, true);
  assert.equal(out[3].continues, false);
  assert.equal(out[3].depth, out[1].depth);
  assert.equal(out[3].indent, "first");
});
