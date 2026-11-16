// 第1層（教材構造）: 理論マスター（暗記用の条文集）。
//
// 階層: テーマ → 理論（N－N タイトル〔ランク〕）→ 項目（N．タイトル 重要度）→ (1) → ① → イ → (ｲ)
// 参考・プラスα は、その位置の理論の下に「補足（supplement）」として置く。
//
// 教材の使い方の説明によれば、見た目に意味がある:
//   - 小さい文字 … カッコ書き（条文番号も同じ大きさ）
//   - 点線の枠 … 施行令・施行規則の部分（ただし厳密に区分できない部分は枠なし）
// ここでは見た目の事実（文字の大きさ・点線の枠の内か外か）を記録し、意味の判定は
// 書式の型で決まるもの（条文番号の形）だけにする。決めきれないものは unknown。

import { pageLines, maxSpanSize, makeIdFactory, FW_DIGITS, toHalfWidthDigits } from "../common/layout.mjs";

const D = `[${FW_DIGITS}]+`;
const THEME_HEAD = new RegExp(`^テーマ\\s*(${D})`);
const THEORY_CODE = new RegExp(`^(${D})\\s*[－-]\\s*(${D})$`);
const RANK = /〔ランク\s*([Ａ-ＣA-C])\s*〕/;
const ITEM_HEADING = new RegExp(`^(${D})\\s*[．.]\\s*(.*)$`);
const IMPORTANCE = /^重要度\s*([◎○〇△])/; // 〇（漢数字のゼロ）も○として扱う。原文の文字は importanceSymbolRaw に残す
const SUPPLEMENT = /^(参考|プラスα)/;
const MEMO_PAGE = /^（\s*ＭＥＭＯ\s*）$/;

// 本文の行頭記号と、その入れ子の深さ（数が小さいほど外側）。
const CLAUSE_MARKERS = [
  [1, "paren-number", new RegExp(`^[（(]\\s*(${D})\\s*[）)]`)],
  [2, "circled-number", /^([①-⑳])/],
  [3, "iroha", /^([イロハニホヘトチリヌルヲワカヨタレソツネナラム])[\s　]/],
  [4, "paren-kana", /^[（(]\s*([ｲﾛﾊﾆﾎﾍﾄﾁﾘﾇﾙｦﾜｶﾖﾀﾚｿﾂﾈﾅﾗﾑ])\s*[）)]/],
];
function clauseMarker(text) {
  const t = text.trim();
  for (const [depth, kind, re] of CLAUSE_MARKERS) {
    const m = t.match(re);
    if (m) return { depth, kind, raw: m[0].trim() };
  }
  return null;
}

// 条文番号の型: 「（法４①）」「（法２①八、令２①～③）」「（令20の２）」など。
const ARTICLE_REF = /^（\s*(法|令|規|基通|措法|措令)[^（）]*）$/;

/** その行で一番多く使われている文字の大きさ（本文の大きさの目安）。 */
function dominantSize(lines) {
  const count = new Map();
  for (const l of lines) for (const s of l.spans) {
    const k = s.size.toFixed(1);
    count.set(k, (count.get(k) ?? 0) + [...s.text.trim()].length);
  }
  let best = null;
  for (const [k, n] of count) if (!best || n > best[1]) best = [k, n];
  return best ? Number(best[0]) : null;
}

function insideAny(bbox, rects) {
  const cx = (bbox[0] + bbox[2]) / 2;
  const cy = (bbox[1] + bbox[3]) / 2;
  return rects.some((r) => cx >= r[0] && cx <= r[2] && cy >= r[1] && cy <= r[3]);
}

/**
 * 行を文字の大きさで区切った segments にする。
 * openParen: 前の行から続いている小さい文字のカッコ書きの、開きカッコの残り数。
 */
export function segmentLine(line, bodySize, openParen) {
  const segments = [];
  let depth = openParen;
  for (const span of line.spans) {
    if (span.text === "") continue;
    const small = bodySize != null && span.size < bodySize - 0.5;
    const last = segments[segments.length - 1];
    const style = small ? "small" : "body";
    if (last && last.style === style) last.text += span.text;
    else segments.push({ text: span.text, style });
  }
  for (const seg of segments) {
    if (seg.style !== "small") continue;
    const t = seg.text.trim();
    if (t === "") seg.role = "blank";
    else if (ARTICLE_REF.test(t)) seg.role = "articleRef";
    else if (/^[（(]/.test(t) || depth > 0) seg.role = "parenthetical";
    else seg.role = "unknown";
    if (seg.role === "parenthetical" || seg.role === "unknown") {
      for (const ch of seg.text) {
        if (ch === "（" || ch === "(") depth += 1;
        else if (ch === "）" || ch === ")") depth = Math.max(0, depth - 1);
      }
    }
  }
  return { segments, openParen: depth };
}

export function buildTheory({ bookId, doc, themeNo }) {
  const nextId = makeIdFactory(bookId);
  const unresolved = [];
  const target = String(themeNo);
  const themePages = [];
  for (const page of doc.pages) {
    const lines = pageLines(doc, page, { runningHeadPattern: THEME_HEAD });
    const head = lines.find((l) => l.role === "runningHead");
    const m = head ? head.text.trim().match(THEME_HEAD) : null;
    const no = m ? toHalfWidthDigits(m[1]) : null;
    if (no === target) themePages.push({ page, lines });
  }
  if (themePages.length === 0) throw new Error(`テーマ${themeNo} のページが見つかりません`);

  const theme = {
    id: nextId("theme"),
    stableId: `${bookId}:theme-${themeNo}`,
    kind: "theme",
    parsed: { no: Number(themeNo), titleRaw: null },
    source: [],
    contents: [], // 扉ページの理論一覧（原文の行）
    children: [],
  };

  let theory = null; // 今の理論
  let pendingTheoryHeader = null; // 「1－1」を読んだ後、タイトル・ランクを集めている途中
  let container = null; // 本文を入れる先（項目 or 補足 or 理論）
  let stack = []; // 行頭記号の入れ子
  let lastNode = null; // 記号の無い行を続けて入れる先
  let openParen = 0;
  let headingOpen = false; // 項目見出しの直後（折り返しの行を見出しに含める）

  const startContainer = (node) => {
    container = node;
    stack = [];
    lastNode = node;
    openParen = 0;
  };

  for (const { page, lines } of themePages) {
    const body = lines.filter((l) => !l.role);
    const bodySize = dominantSize(body.filter((l) => maxSpanSize(l) < 9.5));
    const dashedRects = page.drawings.filter((d) => d.dashed).map((d) => d.rect);
    const head = lines.find((l) => l.role === "runningHead");
    if (theme.source.length === 0 && head) theme.source.push(head.source);
    if (!theme.parsed.titleRaw && head) theme.parsed.titleRaw = head.text.trim().replace(THEME_HEAD, "").trim();

    // 扉ページ（テーマの大見出しと理論の一覧だけのページ）
    const isCover = body.some((l) => maxSpanSize(l) >= 16 && THEME_HEAD.test(l.text.trim()));
    if (isCover) {
      for (const l of body) theme.contents.push({ text: l.text, source: l.source });
      continue;
    }
    if (body.length > 0 && MEMO_PAGE.test(body[0].text.trim()) && body.slice(1).every((l) => l.text.trim() === "")) {
      continue; // （ＭＥＭＯ）だけのページ
    }

    for (const l of body) {
      // 先頭の私用領域の文字（見出しの飾りアイコン）は判定のときだけ除く。原文（text）はそのまま。
      const t = l.text.trim().replace(/^[\uE000-\uF8FF]+\s*/, "");
      const size = maxSpanSize(l);
      if (t === "") continue;

      // 理論の見出し
      if (size >= 13 && THEORY_CODE.test(t)) {
        const m = t.match(THEORY_CODE);
        const code = `${toHalfWidthDigits(m[1])}-${toHalfWidthDigits(m[2])}`;
        theory = {
          id: nextId("theory"),
          stableId: `${bookId}:theory-${code}`,
          kind: "theory",
          parsed: { code, codeRaw: t, titleRaw: "", rankRaw: "unknown" },
          source: [l.source],
          children: [],
        };
        theme.children.push(theory);
        pendingTheoryHeader = theory;
        startContainer(theory);
        continue;
      }
      if (pendingTheoryHeader && (size >= 11.5 || RANK.test(t)) && !ITEM_HEADING.test(t)) {
        const rank = t.match(RANK);
        const titlePart = t.replace(RANK, "").trim();
        if (titlePart) pendingTheoryHeader.parsed.titleRaw += titlePart;
        if (rank) pendingTheoryHeader.parsed.rankRaw = rank[1];
        pendingTheoryHeader.source.push(l.source);
        continue;
      }
      pendingTheoryHeader = null;

      // 参考・プラスα
      // （大きな飾り記号は文字を持たないため、見出しの文字は本文より少し大きい程度。項目見出しと同じ基準）
      if (size >= 9.5 && SUPPLEMENT.test(t)) {
        const node = {
          id: nextId("supplement"),
          kind: "supplement",
          parsed: { labelRaw: t.match(SUPPLEMENT)[1], titleRaw: t.replace(SUPPLEMENT, "").trim() || null },
          source: [l.source],
          lines: [],
          children: [],
        };
        if (theory) theory.children.push(node);
        else {
          theme.children.push(node);
          unresolved.push({ reason: "supplement-before-any-theory", source: [l.source] });
        }
        startContainer(node);
        continue;
      }

      // 項目の見出し（１．タイトル）。本文より大きい文字。
      const im = size >= 9.5 ? t.match(ITEM_HEADING) : null;
      if (im) {
        const node = {
          id: nextId("heading"),
          kind: "heading",
          parsed: { markerRaw: `${im[1]}．`, titleRaw: im[2].trim(), importanceRaw: "unknown" },
          source: [l.source],
          lines: [],
          children: [],
        };
        if (theory) theory.children.push(node);
        else unresolved.push({ reason: "heading-before-any-theory", source: [l.source] });
        startContainer(node);
        headingOpen = true;
        continue;
      }
      // 項目見出しの折り返し（見出しと同じ大きさの文字で、行頭記号の無い行が直後に続く）
      if (headingOpen && size >= 9.5 && !clauseMarker(t) && !IMPORTANCE.test(t)) {
        container.parsed.titleContinuationRaw = (container.parsed.titleContinuationRaw ?? []).concat(l.text);
        container.source.push(l.source);
        continue;
      }
      if (!IMPORTANCE.test(t)) headingOpen = false;
      const imp = t.match(IMPORTANCE);
      if (imp && container?.kind === "heading" && container.parsed.importanceRaw === "unknown") {
        container.parsed.importanceRaw = imp[1] === "〇" ? "○" : imp[1];
        container.parsed.importanceSymbolRaw = imp[1];
        container.source.push(l.source);
        continue;
      }

      // 本文の行
      if (!container) {
        unresolved.push({ reason: "line-before-any-theory", source: [l.source] });
        continue;
      }
      const seg = segmentLine(l, bodySize, openParen);
      openParen = seg.openParen;
      const lineNode = {
        text: l.text,
        segments: seg.segments,
        visual: { frame: insideAny(l.bbox, dashedRects) ? "dashed" : "none", indentX: Math.round(l.bbox[0]) },
        source: l.source,
      };
      const marker = clauseMarker(l.text);
      if (marker) {
        const node = { id: nextId("clause"), kind: "clause", parsed: { marker }, source: [l.source], lines: [lineNode], children: [] };
        while (stack.length && stack[stack.length - 1].parsed.marker.depth >= marker.depth) stack.pop();
        const parent = stack.length ? stack[stack.length - 1] : container;
        parent.children.push(node);
        stack.push(node);
        lastNode = node;
      } else {
        (lastNode.lines ?? (lastNode.lines = [])).push(lineNode);
      }
    }
  }

  return {
    meta: {
      schema: "shohizei-theory-structure-draft-0.1",
      bookId,
      themeNo: Number(themeNo),
      documents: [{ docId: doc.docId, file: doc.file, pageCount: doc.pageCount, tool: doc.tool, toolVersion: doc.toolVersion, invocation: doc.invocation, diag: doc.diag }],
      pages: themePages.map((p) => p.page.page),
    },
    kind: "theoryBook",
    children: [theme],
    unresolved,
  };
}
