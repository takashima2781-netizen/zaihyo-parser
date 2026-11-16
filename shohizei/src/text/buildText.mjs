// 第1層（教材構造）: 基本テキスト・速修テキスト（読む用）。
//
// 階層: 第N回（36pt） → テーマN 題名（22pt） → 節「N-N 題名」（20pt） → 本文の行と図
// 図・表（figures.mjs で見つけた範囲）の中の行は文字としては入れず、図の置き場所（figure）にする。
// 第1回より前（受講案内・目次など）は入れない（unplaced に数だけ残す）。
// 各ページ上端の柱（節の題名など、y < 45）とページ番号・著作権表示は除く。

import { makeIdFactory, toHalfWidthDigits } from "../common/layout.mjs";
import { lineText } from "../extract/extract.mjs";
import { restoreFractions } from "../common/fractions.mjs";
import { findFigures } from "./figures.mjs";

function textSize(line) {
  const sizes = line.spans.filter((s) => s.text.trim() !== "").map((s) => s.size);
  return sizes.length ? Math.max(...sizes) : 0;
}

const SESSION = /^第\s*([0-9０-９]+)\s*回$/;
// 基本テキスト: 「テーマ１」（22pt）の次の行に題名。速修テキスト: 「テーマ１ 題名」（24pt）の1行
const THEME = /^テーマ\s*([0-9０-９]+)\s*(.*)$/;
const SECTION = /^([0-9０-９]+)\s*[-－‐]\s*([0-9０-９]+)\s*(.*)$/;

export function buildText({ bookId, doc }) {
  const nextId = makeIdFactory(bookId);
  const sessions = [];
  let session = null;
  let theme = null;
  let section = null;
  let unplaced = 0;
  let themeSize = null;
  let figureCount = 0;
  const unresolved = [];

  const ensureSection = (title, source) => {
    if (!theme) {
      theme = { id: nextId("theme"), kind: "textTheme", parsed: { no: "unknown", titleRaw: "unknown" }, source: [source], children: [] };
      session.children.push(theme);
    }
    section = { id: nextId("section"), kind: "textSection", stableId: `${bookId}:${theme.parsed.no}:${theme.children.length + 1}`, parsed: { codeRaw: null, titleRaw: title }, source: [source], blocks: [] };
    theme.children.push(section);
  };

  for (const page of doc.pages) {
    // ページ付属物（柱・ページ番号・著作権表示）を除いた行
    let lines = page.lines
      .map((l, i) => ({ text: lineText(l), spans: l.spans, bbox: l.bbox, block: l.block, role: null, source: { doc: doc.docId, page: page.page, line: i, bbox: l.bbox } }))
      .filter((l) => l.text.trim() !== "")
      .filter((l) => !(l.bbox[1] < 45 && textSize(l) <= 10))
      .filter((l) => !/Copyright|TAC Co\.,?\s*Ltd|All Rights Reserved/.test(l.text))
      .filter((l) => !/^[－-]\s*[\s0-9０-９ivxⅰ-ⅹ()（）]+\s*[－-]$/i.test(l.text.trim()));

    // 見出し（19pt以上）を含むかたまりは図にしない（枠で囲まれたテーマ・節の見出しを文字として読むため）
    const figures = findFigures(page, lines).filter((f) => !f.lineIndexes.some((i) => textSize(lines[i]) >= 19));
    const inFigure = new Set(figures.flatMap((f) => f.lineIndexes));
    const restored = restoreFractions(lines, page.drawings);
    lines = restored.lines;
    unresolved.push(...restored.unresolved);

    // 図と行を、ページの上から順に並べる（図はその範囲の上端の位置に置く）
    const items = [];
    lines.forEach((l, i) => {
      if (inFigure.has(i) || l.role) return;
      items.push({ y: l.bbox[1], x: l.bbox[0], line: l });
    });
    figures.forEach((f) => items.push({ y: f.rect[1], x: f.rect[0], figure: f }));
    items.sort((a, b) => a.y - b.y || a.x - b.x);

    for (const it of items) {
      if (it.figure) {
        if (!session) continue; // 本文が始まる前（受講案内など）の図は入れない
        if (!section) ensureSection("（節の見出しの前）", { doc: doc.docId, page: page.page, bbox: it.figure.rect });
        figureCount += 1;
        section.blocks.push({ kind: "figure", id: `${bookId}:fig-${figureCount}`, page: page.page, rect: it.figure.rect, source: [{ doc: doc.docId, page: page.page, bbox: it.figure.rect }] });
        continue;
      }
      const l = it.line;
      if (l.consumed) continue;
      const t = l.text.trim();
      const size = textSize(l);
      const sm = size >= 30 ? t.match(SESSION) : null;
      if (sm || (size >= 28 && /^巻末付録/.test(t))) {
        session = { id: nextId("session"), kind: "textSession", parsed: { raw: t, no: sm ? Number(toHalfWidthDigits(sm[1])) : "appendix" }, source: [l.source], children: [] };
        sessions.push(session);
        theme = null;
        section = null;
        continue;
      }
      const tm = size >= 21 && size < 30 ? t.match(THEME) : null;
      // 速修テキストは「第N回」の見出しが文字になっていないため、最初のテーマで本文の始まりとする
      if (!session && tm) {
        session = { id: nextId("session"), kind: "textSession", parsed: { raw: "", no: "main" }, source: [l.source], children: [] };
        sessions.push(session);
      }
      if (!session) {
        unplaced += 1;
        continue;
      }
      if (tm) {
        // 題名は同じ大きさで同じかたまりにある次の行
        const titleLines = items.filter((x) => x.line && x.line !== l && x.line.block === l.block && textSize(x.line) >= 21).map((x) => x.line);
        for (const x of titleLines) x.consumed = true;
        const title = [tm[2].trim(), ...titleLines.map((x) => x.text.trim())].filter(Boolean).join(" ");
        theme = { id: nextId("theme"), kind: "textTheme", parsed: { no: Number(toHalfWidthDigits(tm[1])), titleRaw: title || "unknown" }, source: [l.source], children: [] };
        themeSize = size;
        session.children.push(theme);
        section = null;
        continue;
      }
      // 節の見出し: テーマの見出しより小さく、19pt以上の「N-N 題名」
      const sec = size >= 19 && size < (themeSize ?? 21) ? t.match(SECTION) : null;
      if (sec) {
        ensureSection(sec[3].trim() || "unknown", l.source);
        section.parsed.codeRaw = `${toHalfWidthDigits(sec[1])}-${toHalfWidthDigits(sec[2])}`;
        continue;
      }
      if (!section) ensureSection(theme ? "（テーマの概要）" : "（本文）", l.source);
      section.blocks.push({
        kind: "line",
        text: l.text,
        segments: l.segments ?? null,
        style: size >= 12 ? "heading" : "body",
        source: l.source,
      });
    }
  }

  // 学習記録のキー: 節番号（N-N）があればそれ、無ければ回・テーマ・順番。重なったら -2, -3 …
  const used = new Map();
  for (const s of sessions) {
    for (const t of s.children) {
      t.children.forEach((sec, k) => {
        const base = sec.parsed.codeRaw ? `sec-${sec.parsed.codeRaw}` : `s${s.parsed.no}-t${t.parsed.no}-${k + 1}`;
        const n = (used.get(base) ?? 0) + 1;
        used.set(base, n);
        sec.stableId = `${bookId}:${base}${n > 1 ? `-${n}` : ""}`;
      });
    }
  }

  return {
    meta: {
      schema: "shohizei-text-structure-draft-0.1",
      bookId,
      documents: [{ docId: doc.docId, file: doc.file, pageCount: doc.pageCount, tool: doc.tool, toolVersion: doc.toolVersion, invocation: doc.invocation, diag: doc.diag }],
    },
    kind: "textBook",
    children: sessions,
    figureCount,
    unplacedLineCount: unplaced,
    unresolved,
  };
}
