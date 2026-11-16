// トレーニング教材の見出しなどの型（教材の原文そのものではなく、書式の型だけ）。
// 型に当てはまらないものは unknown のまま残し、ここで無理に分類しない。

import { FW_DIGITS, toHalfWidthDigits } from "../common/layout.mjs";

const D = `[${FW_DIGITS}]+`;

export const LEVELS = ["基礎", "応用", "研究", "総合"];

// 目次の1行: 「問題N タイトル〔難度〕（シートあり） ･･････ 問題のページ （解答のページ）」
const TOC_PROBLEM = new RegExp(
  `^問題\\s*(${D})\\s*(.+?)\\s*〔(${LEVELS.join("|")})〕\\s*(（シートあり）)?\\s*[·･・…‥.\\s]*(${D})\\s*[（(]\\s*(${D})\\s*[）)]\\s*$`,
);
const TOC_SESSION = new RegExp(`^第\\s*(${D})\\s*回$`);

export function parseTocLine(text) {
  const t = text.trim();
  let m = t.match(TOC_SESSION);
  if (m) return { kind: "session", no: Number(toHalfWidthDigits(m[1])) };
  m = t.match(TOC_PROBLEM);
  if (m) {
    return {
      kind: "problem",
      no: Number(toHalfWidthDigits(m[1])),
      titleRaw: m[2],
      levelRaw: m[3],
      hasSheet: Boolean(m[4]),
      problemPage: Number(toHalfWidthDigits(m[5])),
      answerPage: Number(toHalfWidthDigits(m[6])),
    };
  }
  return null;
}

// 問題・解答の見出し: 「問題N タイトル・そのK（シートあり）」
const HEADING = new RegExp(`^問題\\s*(${D})\\s+(.*)$`);
export function parseProblemHeading(text) {
  const m = text.trim().match(HEADING);
  if (!m) return null;
  let title = m[2].trim();
  const hasSheet = /（シートあり）$/.test(title);
  if (hasSheet) title = title.replace(/（シートあり）$/, "").trim();
  const series = title.match(/・(その\s*[0-9０-９]+)$/);
  return {
    no: Number(toHalfWidthDigits(m[1])),
    titleRaw: title,
    seriesRaw: series ? series[1] : null,
    hasSheetMark: hasSheet,
  };
}

export function parseLevel(text) {
  const t = text.trim();
  return LEVELS.includes(t) ? t : null;
}

// 目安時間: 「１分」「－55分－」など
const TIME = new RegExp(`^[－-]?\\s*(${D})\\s*分\\s*[－-]?$`);
export function parseTime(text) {
  const m = text.trim().match(TIME);
  return m ? { raw: text.trim(), minutes: Number(toHalfWidthDigits(m[1])) } : null;
}

// 行頭の記号（候補）。どの階層かはここでは決めない。
const MARKERS = [
  ["paren-number", new RegExp(`^[（(]\\s*(${D})\\s*[）)]`)],
  ["circled-number", /^([①-⑳])/],
  ["roman", /^([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ])\s/],
  ["number", new RegExp(`^(${D})\\s`)],
  ["question", new RegExp(`^問\\s*(${D})`)],
  ["bracket-heading", /^(【[^】]+】)/],
];
export function parseMarker(text) {
  const t = text.trim();
  for (const [kind, re] of MARKERS) {
    const m = t.match(re);
    if (m) return { kind, raw: m[0].trim() };
  }
  return null;
}

// 問題文の空欄: 「[ ① ]」
export function findBlanks(text) {
  return [...text.matchAll(/\[\s*([①-⑳])\s*\]/g)].map((m) => m[1]);
}

// 解答の〇×: 「(n)  ○」「(n)  × 理由…」
const JUDGEMENT = new RegExp(`^[（(]\\s*(${D})\\s*[）)]\\s*([○〇×])\\s*(.*)$`);
export function parseJudgement(text) {
  const m = text.trim().match(JUDGEMENT);
  if (!m) return null;
  return {
    itemNo: Number(toHalfWidthDigits(m[1])),
    symbol: m[2] === "〇" ? "○" : m[2],
    symbolRaw: m[2],
    reasonRaw: m[3] || null,
  };
}

export const GUIDANCE_HEADING = /^【解答への道】/;

// 問い方の候補。指示文の言い回しだけを根拠にし、根拠（evidence）を一緒に残す。
const FORM_CUES = [
  ["fill_in_blank", /語句又は数字を記入/],
  ["true_false_set", /○を?、?.{0,30}×を付/],
  // 3つ以上の区分に振り分ける（例: ○・△・×、「課」「非」…）
  ["classify_items", /○、.{0,20}△、.{0,20}×を|「[^」]{1,2}」を、.{0,30}「[^」]{1,2}」を/],
  ["select_applicable", /選びなさい/],
  ["statement_recall", /述べなさい/],
  ["calculation", /求めなさい|計算しなさい/],
];
export function questionFormCandidates(instructionText) {
  const out = [];
  for (const [form, re] of FORM_CUES) {
    const m = instructionText.match(re);
    if (m) out.push({ form, evidence: m[0] });
  }
  // 3区分以上の振り分けに当たるときは、〇×（2区分）の候補は外す。
  if (out.some((c) => c.form === "classify_items")) return out.filter((c) => c.form !== "true_false_set");
  return out;
}
