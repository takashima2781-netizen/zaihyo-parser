// 答案用紙（B）と解答（C）の前半 → 解答欄の単位ごとの「答え」。
//
// 答案用紙と解答の前半は同じ配置で、解答には答案用紙の枠の位置に答えが書き込まれている。
// 行の数は一致しない（答えが複数行になる・書き込み欄の行数が違う）ので、行の順番には頼らない。
// 見出し（問１・１・１(1)・(2)…）で区切った単位ごとに、
//   答案用紙にも同じ位置にある文字 → 定型の文（template）
//   答案用紙に無い文字            → 答え（slot）
// とする。どちらとも決められないものは作らない（unresolved へ）。

import { contentRows, isBlankText, normalizeForMatch } from "../common/rows.mjs";
import { isGuidanceStart, isPointsStart, parseSheetHeading } from "./patterns.mjs";
import { findDaimonRows, unitKey } from "./problem.mjs";

const HEADING_MAX_X = 130;
const SAME_X = 12;

/** 文書の行 → 大問ごとの区間（理論の大問だけ）。 */
export function daimonSections(rows, daimonNos) {
  const ds = findDaimonRows(rows);
  return ds
    .map((d, k) => ({ d, rows: rows.slice(d.index + 1, k + 1 < ds.length ? ds[k + 1].index : rows.length) }))
    .filter((s) => daimonNos.includes(s.d.parsed.no));
}

/** 解答の区間を、答え・配点・解答への道に分ける。 */
export function splitAnswerSection(rows) {
  const p = rows.findIndex((r) => r.role === null && isPointsStart(r.text));
  const g = rows.findIndex((r) => r.role === null && isGuidanceStart(r.text));
  const keyEnd = p >= 0 ? p : g >= 0 ? g : rows.length;
  return {
    keyRows: rows.slice(0, keyEnd),
    pointsRows: p >= 0 ? contentRows(rows.slice(p, g >= 0 ? g : rows.length)) : [],
    guidanceRows: g >= 0 ? rows.slice(g + 1) : [],
    guidanceHeading: g >= 0 ? rows[g] : null,
  };
}

function inkSpans(row) {
  return row.spans.filter((s) => !isBlankText(s.text));
}

/**
 * 区間の行を見出しで単位に分ける。
 * @returns {Array<{key:string, path:object, headingRow:object, rest:string, rows:Array<{row:object, spans:Array}>}>}
 */
export function sheetUnits(rows, daimonNo) {
  const units = [];
  let path = { daimon: daimonNo, toi: null, shomon: null, edamon: null };
  let unit = null;
  for (const r of contentRows(rows)) {
    const spans = inkSpans(r);
    if (spans.length === 0) continue;
    const first = spans[0];
    const h = first.bbox[0] < HEADING_MAX_X ? parseSheetHeading(first.text) : null;
    if (h) {
      if (h.toi !== null) path = { daimon: daimonNo, toi: h.toi, shomon: null, edamon: null };
      else if (h.shomon !== null) path = { ...path, shomon: h.shomon, edamon: h.edamon };
      else path = { ...path, edamon: h.edamon };
      unit = { key: unitKey(path), path: { ...path }, headingRow: r, rest: h.rest, rows: [] };
      units.push(unit);
      const restSpans = spans.slice(1);
      if (h.rest) unit.rows.push({ row: r, spans: [{ text: h.rest, bbox: first.bbox, size: first.size, fromHeading: true }, ...restSpans] });
      else if (restSpans.length) unit.rows.push({ row: r, spans: restSpans });
      continue;
    }
    if (!unit) continue; // 大問の見出しと最初の「問」の間の行（解答の題名など）は単位に入れない
    unit.rows.push({ row: r, spans });
  }
  return units;
}

function sameX(a, b) {
  return Math.abs(a.bbox[0] - b.bbox[0]) <= SAME_X;
}

/** 正規化した prefix の長さぶんだけ原文の先頭を切り出す。 */
function splitRawByNormalizedPrefix(raw, prefixNorm) {
  let consumed = 0;
  let i = 0;
  const chars = [...raw];
  while (i < chars.length && consumed < prefixNorm.length) {
    consumed += normalizeForMatch(chars[i]).length;
    i += 1;
  }
  return [chars.slice(0, i).join(""), chars.slice(i).join("")];
}

/**
 * 解答の単位と答案用紙の単位を比べ、解答の各文字のかたまりを template / slot に分ける。
 * @returns {{segments:Array, slots:Array, unmatchedSheetSpans:number}}
 */
export function classifyUnit(answerUnit, sheetUnit) {
  const templ = (sheetUnit?.rows ?? []).flatMap((u) => u.spans.map((s) => ({ ...s, norm: normalizeForMatch(s.text), used: false })));
  const segments = [];
  answerUnit.rows.forEach((u, rowIndex) => {
    if (rowIndex > 0) segments.push({ type: "break" });
    for (const s of u.spans) {
      const norm = normalizeForMatch(s.text);
      const src = { ...u.row.source, bbox: s.bbox };
      if (s.fromHeading) {
        segments.push({ type: "text", text: s.text, source: src });
        continue;
      }
      const exact = templ.find((t) => !t.used && t.norm === norm && sameX(t, s));
      if (exact) {
        exact.used = true;
        segments.push({ type: "text", text: s.text, source: src });
        continue;
      }
      const prefix = templ.find((t) => !t.used && t.norm && norm.startsWith(t.norm) && norm.length > t.norm.length && sameX(t, s));
      if (prefix) {
        prefix.used = true;
        const [head, tail] = splitRawByNormalizedPrefix(s.text, prefix.norm);
        segments.push({ type: "text", text: head, source: src });
        segments.push({ type: "slot", text: tail, source: src });
        continue;
      }
      segments.push({ type: "slot", text: s.text, source: src });
    }
  });
  return { segments: mergeSlots(segments), unmatchedSheetSpans: templ.filter((t) => !t.used && !t.fromHeading).length };
}

const LABEL = /^([①-⑳]|[Ａ-Ｚ]|[一-鿿]{1,4})$/;

/** 続いている答え（同じ行で隣り合う・答えだけの行が続く）を1つの欄にまとめ、欄の名前を付ける。 */
function mergeSlots(segments) {
  const out = [];
  for (const seg of segments) {
    const prev = out.at(-1);
    const prevNonBreak = [...out].reverse().find((x) => x.type !== "break");
    if (seg.type === "slot" && prev && prev.type === "slot") {
      prev.lines[prev.lines.length - 1].text += seg.text;
      prev.sources.push(seg.source);
      continue;
    }
    if (seg.type === "slot" && prev && prev.type === "break" && prevNonBreak?.type === "slot" && out.at(-2) === prevNonBreak) {
      out.pop(); // 答えだけの行が続く → 同じ欄の次の行
      prevNonBreak.lines.push({ text: seg.text });
      prevNonBreak.sources.push(seg.source);
      continue;
    }
    if (seg.type === "slot") {
      const labelSeg = prevNonBreak?.type === "text" && LABEL.test(normalizeForMatch(prevNonBreak.text)) ? prevNonBreak : null;
      out.push({ type: "slot", label: labelSeg ? normalizeForMatch(labelSeg.text) : null, lines: [{ text: seg.text }], sources: [seg.source] });
      continue;
    }
    out.push(seg);
  }
  for (const s of out) if (s.type === "slot") s.text = s.lines.map((l) => l.text.trim()).join("");
  return out;
}

/**
 * 答案用紙・解答の理論の大問 → 単位ごとの答え。
 */
export function buildAnswerKey({ sheetRows, answerRows, daimonNos }) {
  const sheetSections = new Map(daimonSections(sheetRows, daimonNos).map((s) => [s.d.parsed.no, s]));
  const result = [];
  const diag = [];
  for (const sec of daimonSections(answerRows, daimonNos)) {
    const no = sec.d.parsed.no;
    const parts = splitAnswerSection(sec.rows);
    const sheetSec = sheetSections.get(no);
    if (!sheetSec) diag.push({ reason: "sheet-daimon-not-found", daimon: no });
    const sheetByKey = new Map(sheetSec ? sheetUnits(sheetSec.rows, no).map((u) => [u.key, u]) : []);
    const units = sheetUnits(parts.keyRows, no).map((u) => {
      const sheetUnit = sheetByKey.get(u.key) ?? null;
      if (!sheetUnit) diag.push({ reason: "sheet-unit-not-found", key: u.key });
      const c = classifyUnit(u, sheetUnit);
      return {
        key: u.key,
        path: u.path,
        heading: { text: u.headingRow.text, source: u.headingRow.source },
        sheetHeading: sheetUnit ? { text: sheetUnit.headingRow.text, source: sheetUnit.headingRow.source } : null,
        segments: c.segments,
        slots: c.segments.filter((s) => s.type === "slot"),
        unmatchedSheetSpans: c.unmatchedSheetSpans,
      };
    });
    result.push({
      daimon: no,
      heading: { text: sec.d.row.text, source: sec.d.row.source },
      units,
      points: parts.pointsRows.map((r) => ({ text: r.text, source: r.source })),
      guidanceHeading: parts.guidanceHeading ? { text: parts.guidanceHeading.text, source: parts.guidanceHeading.source } : null,
      guidanceRows: parts.guidanceRows,
    });
  }
  return { daimons: result, diag };
}
