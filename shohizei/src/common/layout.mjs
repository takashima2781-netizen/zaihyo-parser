// ページの行をそろえる共通処理（教材の種類に依存しない）。
//
// - 行の文字列化と、出典（文書・ページ・位置）の付与
// - ページの付属物（柱・ページ番号・著作権表示）の見分け。消さずに role を付ける
// - 空白だけの行の見分け

import { lineText } from "../extract/extract.mjs";

export const FW_DIGITS = "0-9０-９";

export function toHalfWidthDigits(s) {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

/**
 * ページ付属物の判定。runningHeads は柱として出る語（例: ["問題編", "解答編"]）。
 * 柱は版面の上端近く（topLimit より上）にあるものだけを柱とみなす。
 */
export function furnitureRole(line, { runningHeads = [], runningHeadPattern = null, topLimit = 45, bottomLimit = null } = {}) {
  const text = lineText(line).trim();
  if (/Copyright|TAC Co\.,?\s*Ltd|All Rights Reserved/.test(text)) return "copyright";
  if (new RegExp(`^[－-]\\s*[${FW_DIGITS}ivxⅰ-ⅹ]+\\s*[－-]$`, "i").test(text)) return "pageNumber";
  const top = line.bbox[1];
  if (top < topLimit) {
    if (runningHeads.includes(text)) return "runningHead";
    if (runningHeadPattern && runningHeadPattern.test(text)) return "runningHead";
  }
  if (bottomLimit != null && top > bottomLimit && text === "") return "blank";
  return null;
}

/**
 * 抽出文書のページを、教材構造の組み立てに使う「行」の並びにする。
 * 並びは抽出結果の順（PyMuPDF の block → line の順）のまま。並べ替えはしない。
 */
export function pageLines(doc, page, furnitureOptions) {
  return page.lines.map((line, index) => {
    const text = lineText(line);
    const role = furnitureRole(line, furnitureOptions) ?? (text.trim() === "" ? "blank" : null);
    return {
      text,
      role, // null = 本文。付属物・空白なら名前
      spans: line.spans,
      bbox: line.bbox,
      block: line.block,
      source: { doc: doc.docId, page: page.page, line: index, bbox: line.bbox },
    };
  });
}

export function maxSpanSize(line) {
  return Math.max(...line.spans.map((s) => s.size));
}

/** ID の発行（同じ入力なら同じ並びで同じIDになる）。 */
export function makeIdFactory(prefix) {
  const counters = new Map();
  return (kind) => {
    const n = (counters.get(kind) ?? 0) + 1;
    counters.set(kind, n);
    return `${prefix}:${kind}-${n}`;
  };
}
