// ページの文字のかたまり（span）を「行（row）」にまとめる共通処理。教材の種類に依存しない。
//
// 答案用紙・解答は、1つの行に見える並び（「① エ ② オ …」）が PyMuPDF では別々の line に分かれて出る。
// そこで span を縦位置（中心の y）でまとめ直し、左から順に並べたものを1行とする。
// 原文の文字は書き換えない（span の text をそのまま持つ）。行の文字列 text は span をつないだもので、
// span の間が離れているときだけ半角空白を1つはさむ（表示・照合用。原文は spans に残る）。

export const ROW_Y_TOLERANCE = 3;

export function toHalfWidth(s) {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")");
}

/** 照合用の正規化: 空白を除き、全角数字・括弧を半角にする。原文の代わりには使わない。 */
export function normalizeForMatch(s) {
  return toHalfWidth(s).replace(/[\s　]/g, "");
}

export function isBlankText(s) {
  return s.replace(/[\s　]/g, "") === "";
}

function joinSpans(spans) {
  let out = "";
  let prev = null;
  for (const s of spans) {
    if (prev) {
      const gap = s.bbox[0] - prev.bbox[2];
      const touchesSpace = /[\s　]$/.test(out) || /^[\s　]/.test(s.text);
      if (gap > s.size * 0.5 && !touchesSpace) out += " ";
    }
    s.start = out.length; // 行の文字の中で、この span が始まる位置（下線の位置を文字に当てるのに使う）
    out += s.text;
    prev = s;
  }
  return out;
}

/**
 * 1ページの span を行にまとめる。
 * @returns {Array<{page:number, y:number, x:number, text:string, spans:Array, source:object, role:string|null}>}
 */
export function pageRows(doc, page) {
  const spans = [];
  for (const line of page.lines) {
    for (const s of line.spans) spans.push({ ...s, block: line.block, yc: (s.bbox[1] + s.bbox[3]) / 2 });
  }
  spans.sort((a, b) => a.yc - b.yc || a.bbox[0] - b.bbox[0]);
  const groups = [];
  for (const s of spans) {
    const g = groups.at(-1);
    if (g && Math.abs(g.yc - s.yc) < ROW_Y_TOLERANCE) g.spans.push(s);
    else groups.push({ yc: s.yc, spans: [s] });
  }
  return groups.map((g, index) => {
    g.spans.sort((a, b) => a.bbox[0] - b.bbox[0]);
    const bbox = [
      Math.min(...g.spans.map((s) => s.bbox[0])),
      Math.min(...g.spans.map((s) => s.bbox[1])),
      Math.max(...g.spans.map((s) => s.bbox[2])),
      Math.max(...g.spans.map((s) => s.bbox[3])),
    ];
    const spansOut = g.spans.map((s) => (s.chars ? { text: s.text, bbox: s.bbox, size: s.size, chars: s.chars } : { text: s.text, bbox: s.bbox, size: s.size }));
    const text = joinSpans(spansOut);
    return {
      page: page.page,
      y: Math.round(g.yc * 100) / 100,
      x: firstInkX(spansOut) ?? bbox[0],
      text,
      spans: spansOut,
      role: furnitureRole(text, bbox, page) ?? (isBlankText(text) ? "blank" : null),
      source: { doc: doc.docId, page: page.page, row: index, bbox },
    };
  });
}

/** 行の最初の「文字のある」span の左端（空白だけの span は字下げに数えない）。 */
function firstInkX(spans) {
  for (const s of spans) {
    if (!isBlankText(s.text)) {
      const lead = s.text.length - s.text.replace(/^[\s　]+/, "").length;
      // 先頭の空白の分だけ右へずらす（等幅でないので概算。字下げの比較にだけ使う）
      return s.bbox[0] + lead * s.size * 0.5;
    }
  }
  return null;
}

/**
 * ページの付属物（著作権表示・柱・ページ番号）の見分け。消さずに role を付ける。
 * 柱（「財実完答①」「財実完答①Ｃ18－1」など）は上端近くの短い行。
 */
export function furnitureRole(text, bbox, page) {
  const t = text.trim();
  if (/無断複写・複製を禁じます/.test(t)) return "copyright";
  if (/Copyright|TAC Co\.,?\s*Ltd|All Rights Reserved/.test(t)) return "copyright";
  if (/^[－-]\s*[Ａ-ＺA-Z]?\s*[0-9０-９]+\s*[－-]$/.test(t)) return "pageNumber";
  if (bbox[1] < 60 && t.length > 0 && t.length <= 16 && !/^〔/.test(t)) return "runningHead";
  if (page.height && bbox[1] > page.height - 40 && isBlankText(t)) return "blank";
  return null;
}

export function documentRows(doc) {
  return doc.pages.flatMap((p) => pageRows(doc, p));
}

/** 本文の行だけ（付属物・空白を除く）。 */
export function contentRows(rows) {
  return rows.filter((r) => r.role === null);
}
