// 答練・演習・模試（本試験形式）の見出し・選択肢・語群などの「形」の見分け。教材の原文は含まない。
//
// どの関数も「当てはまれば解釈を返し、当てはまらなければ null」。決めきれないものを推測で埋めない。

import { normalizeForMatch, toHalfWidth } from "../common/rows.mjs";

const KANJI_NUMBERS = { 一: 1, 二: 2, ニ: 2, 三: 3, 四: 4, 五: 5 };

// 〔第一問〕 －25点－ / 〔 第 ニ 問 〕（カタカナの「ニ」の表記ゆれがある。照合では二と同じに扱う）
export function parseDaimon(text) {
  const t = normalizeForMatch(text);
  const m = t.match(/^〔第([一二ニ三四五])問〕(?:[－-]?(\d+)点[－-]?)?/);
  if (!m) return null;
  return { no: KANJI_NUMBERS[m[1]], points: m[2] ? Number(m[2]) : null, kanjiRaw: m[1] };
}

// 問１(11点) / 問１（14 点）
export function parseToiHeading(text) {
  const t = normalizeForMatch(text);
  const m = t.match(/^問(\d+)(?:\((\d+)点\))?(.*)$/);
  if (!m) return null;
  return { no: Number(m[1]), points: m[2] ? Number(m[2]) : null, rest: m[3] };
}

// 小問「１ 空欄…」: 先頭が数字1〜2桁＋空白。「１. 企業の…」（引用文の項番号）は数字の直後が「.」なので当てはまらない。
export function parseShomonHeading(text) {
  // 照合は原文のまま（全角数字も許す）。rest は原文の文字を返す（半角に直さない）
  const m = text.match(/^[\s　]*([0-9０-９]{1,2})[\s　]+(\S.*)$/);
  if (!m) return null;
  return { no: Number(toHalfWidth(m[1])), rest: m[2] };
}

// 枝問「(1) 次のうち…」
export function parseEdamonHeading(text) {
  const m = text.match(/^[\s　]*[（(]([0-9０-９]{1,2})[）)][\s　]*(\S.*)$/);
  if (!m) return null;
  return { no: Number(toHalfWidth(m[1])), rest: m[2] };
}

// 選択肢「ア 退職給付債務の算定」（1行に1つ）
const KANA_ORDER = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワ";
export function kanaIndex(symbol) {
  return KANA_ORDER.indexOf(symbol);
}
export function parseOptionLine(text) {
  const t = text.replace(/^[\s　]+/, "");
  const m = t.match(/^([ア-ワ])[\s　]+(\S.*)$/);
  if (!m || kanaIndex(m[1]) < 0) return null;
  return { symbol: m[1], text: m[2].replace(/[\s　]+$/, "") };
}

export function isWordBankHeading(text) {
  return /^【語群】$/.test(normalizeForMatch(text));
}

// 語群の行「ア 収益力   イ 純資産計算  …」: 記号＋語句が1行に複数。全体がこの形でなければ null。
export function parseWordBankLine(text) {
  const t = text.replace(/[\s　]+$/, "");
  const re = /(?:^|[\s　]+)([ア-ワ])[\s　]+(.+?)(?=[\s　]+[ア-ワ][\s　]+|$)/gy;
  const entries = [];
  let last = 0;
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(t)) !== null) {
    entries.push({ symbol: m[1], text: m[2].replace(/[\s　]+$/, "") });
    last = re.lastIndex;
    if (last >= t.length) break;
  }
  if (entries.length === 0 || last < t.length) return null;
  return entries;
}

// 並べ替え・参照用の記号つきの文「Ａ 契約における…」
export function parseLabeledStatement(text) {
  const t = text.replace(/^[\s　]+/, "");
  const m = t.match(/^([Ａ-Ｚ])[\s　]+(\S.*)$/);
  if (!m) return null;
  return { label: m[1], text: m[2].replace(/[\s　]+$/, "") };
}

export const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
export function blankLabelsIn(text) {
  return [...text].filter((c) => CIRCLED.includes(c));
}

/**
 * 答案用紙・解答の見出し行（行の最初の span）: 「問１」「１」「１(1)」「(2)」「３(1)」「(2) 名称」。
 * 見出しの後ろに短い語（名称・金額など、答案用紙の欄の名前）が続くことがある → rest に返す。
 */
export function parseSheetHeading(text) {
  const t = normalizeForMatch(text);
  let m = t.match(/^問(\d+)$/);
  if (m) return { toi: Number(m[1]), shomon: null, edamon: null, rest: "" };
  // 後ろに続いてよいのは、かな・漢字だけの短い欄の名前（「5,100」のような金額を見出しと取り違えない）
  m = t.match(/^(\d)(?:\((\d+)\))?([぀-ヿ一-鿿]{0,4})$/);
  if (m) return { toi: null, shomon: Number(m[1]), edamon: m[2] ? Number(m[2]) : null, rest: m[3] };
  m = t.match(/^\((\d+)\)([぀-ヿ一-鿿]{0,4})$/);
  if (m) return { toi: null, shomon: null, edamon: Number(m[1]), rest: m[2] };
  return null;
}

/** 解答への道の見出し「１について」「１(2)及び(3)について」「２(1)について」→ 小問・枝問の参照の並び。 */
export function parseGuidanceHeading(text) {
  const t = normalizeForMatch(text);
  const m = t.match(/^(.{1,24})について$/);
  if (!m) return null;
  const refs = [];
  let shomon = null;
  for (const part of m[1].split(/及び|、|・|,/)) {
    const pm = part.match(/^(\d)?(?:\((\d+)\))?$/);
    if (!pm || (pm[1] === undefined && pm[2] === undefined)) return null;
    if (pm[1] !== undefined) shomon = Number(pm[1]);
    if (shomon === null) return null;
    refs.push({ shomon, edamon: pm[2] !== undefined ? Number(pm[2]) : null });
  }
  return refs.length ? refs : null;
}

/** 解答への道の選択肢ごとの判定「ア 〇」「エ ×：理由」 */
export function parseOptionJudgement(text) {
  const t = text.replace(/^[\s　]+/, "").replace(/[\s　]+$/, "");
  const m = t.match(/^([ア-ワ])[\s　]*([〇○×])(?:[\s　]*[：:][\s　]*(.*))?$/);
  if (!m) return null;
  return { symbol: m[1], mark: m[2] === "×" ? "×" : "○", markRaw: m[2], reason: m[3] ?? null };
}

export function isGuidanceStart(text) {
  return /^【?解答への道】?/.test(normalizeForMatch(text));
}

export function isPointsStart(text) {
  return /^【配点】/.test(normalizeForMatch(text));
}
