// 第1層（教材構造）: 理論ドクター（問い・解答・解説のある理論問題集）。
//
// 第1章 テーマ別理論問題: 「基礎力養成／実力養成／質疑応答／参考／研究」の見出し（右に題名）
//                          → 問い → 「解 答」 → 解答 → 「解 説」 → 解説
// 第2章 国税庁質疑応答事例・第3章 軽減税率制度に関するＱ＆Ａ:
//                          「（問題）N．題名」 → 問い → 「【回答要旨】」 → 答え
// 問題の外にある行（章の扉、理論体系の図 など）は問題に入れず、unplaced に数だけ残す。

import { pageLines, makeIdFactory, toHalfWidthDigits } from "../common/layout.mjs";
import { restoreFractions } from "../common/fractions.mjs";
import { segmentLine } from "../theory/buildTheory.mjs";

const RUNNING_HEAD = /^(テーマ\s*[0-9０-９]+|第[0-9０-９]+章|テーマ別理論問題)/;
const CH1_LABEL = /^(基礎力養成|実力養成|質疑応答|参考|研究)\s*/;
const QA_HEADING = /^(?:問題\s*|問[0-9０-９]+．[0-9０-９]+\s*)?([0-9０-９]+)．\s*(.+)$/;
const ANSWER_MARK = /^(解\s*答|【回答要旨】)$/;
const EXPLANATION_MARK = /^解\s*説$/;
const CHAPTER = /^第\s*([0-9０-９]+)\s*章$/;

// 空白だけの文字のかたまりは大きさの判定に使わない（飾りの空白が大きい字で入っていることがある）
function maxSpanSize(line) {
  const sizes = line.spans.filter((s) => s.text.trim() !== "").map((s) => s.size);
  return sizes.length ? Math.max(...sizes) : 0;
}

function dominantSize(lines) {
  const count = new Map();
  for (const l of lines) for (const s of l.spans) count.set(s.size.toFixed(1), (count.get(s.size.toFixed(1)) ?? 0) + [...s.text.trim()].length);
  let best = null;
  for (const [k, n] of count) if (!best || n > best[1]) best = [k, n];
  return best ? Number(best[0]) : null;
}

export function buildDoctor({ bookId, doc }) {
  const nextId = makeIdFactory(bookId);
  const problems = [];
  const unresolved = [];
  let unplaced = 0;
  let chapter = null;
  let theme = null; // { no, titleRaw }（第1章）
  let subTheme = null;
  let cur = null; // 今の問題
  let part = null; // "question" | "answer" | "explanation"

  for (const page of doc.pages) {
    let lines = pageLines(doc, page, { runningHeadPattern: RUNNING_HEAD });
    const restored = restoreFractions(lines, page.drawings);
    lines = restored.lines;
    unresolved.push(...restored.unresolved);
    const head = lines.find((l) => l.role === "runningHead");
    if (head) {
      const t = head.text.trim();
      const tm = t.match(/^テーマ\s*([0-9０-９]+)\s*(.*)$/);
      if (tm) theme = { no: Number(toHalfWidthDigits(tm[1])), titleRaw: tm[2].trim() };
    }
    const body = lines.filter((l) => !l.role);
    const bodySize = dominantSize(body.filter((l) => maxSpanSize(l) < 9.5));
    let openParen = 0;

    for (let i = 0; i < body.length; i++) {
      const l = body[i];
      const t = l.text.trim();
      if (t === "") continue;
      const size = maxSpanSize(l);

      const ch = size >= 15 ? t.match(CHAPTER) : null;
      if (ch) {
        chapter = Number(toHalfWidthDigits(ch[1]));
        cur = null;
        subTheme = null;
        if (chapter !== 1) theme = null;
        continue;
      }
      if (size >= 15) continue; // 章の扉の大見出し
      // 小見出し（「課税の対象（国内取引）」「国内取引の判定」）。理論体系の図の見出し（◆）は除く
      if (size >= 10.4 && size < 15 && !/^◆/.test(t) && !/^テーマ/.test(t)) {
        subTheme = t;
        cur = null;
        continue;
      }
      if (size >= 12) continue; // テーマの扉の見出しなど

      // 問題の始まり
      const c1 = chapter === 1 && l.bbox[0] <= 60 ? t.match(CH1_LABEL) : null;
      const qa = chapter >= 2 && l.bbox[0] <= 50 ? t.match(QA_HEADING) : null;
      if (c1 || qa) {
        let titleRaw;
        if (c1) {
          const sameBlock = body.filter((x, k) => k > i && x.block === l.block && x.bbox[0] > 150);
          titleRaw = [t.slice(c1[0].length).trim(), ...sameBlock.map((x) => x.text.trim())].filter(Boolean).join(" ");
          for (const x of sameBlock) x.consumed = true;
        } else titleRaw = qa[2].trim();
        // 題名の無い「参考」は囲みの見出しではなく本文中の語なので、問題の始まりにしない
        if (c1 && c1[1] === "参考" && !titleRaw) {
          if (cur) cur[part].push({ text: l.text, segments: [{ kind: "text", text: l.text, style: "body" }], visual: { frame: "none", indentX: Math.round(l.bbox[0]) }, source: l.source });
          else unplaced += 1;
          continue;
        }
        cur = {
          id: nextId("problem"),
          kind: "doctorProblem",
          stableId: `${bookId}:ch${chapter}:${problems.length + 1}`,
          parsed: {
            chapter,
            labelRaw: c1 ? c1[1] : null,
            noRaw: qa ? qa[1] : null,
            titleRaw: titleRaw || "unknown",
            themeNo: chapter === 1 ? theme?.no ?? "unknown" : null,
            themeTitleRaw: chapter === 1 ? theme?.titleRaw ?? "unknown" : null,
            subThemeRaw: subTheme ?? "unknown",
          },
          source: [l.source],
          question: [],
          answer: [],
          explanation: [],
        };
        problems.push(cur);
        part = "question";
        openParen = 0;
        continue;
      }
      if (l.consumed) continue;
      if (!cur) {
        unplaced += 1;
        continue;
      }
      if (ANSWER_MARK.test(t.replace(/\s+/g, " "))) {
        part = "answer";
        openParen = 0;
        continue;
      }
      if (EXPLANATION_MARK.test(t)) {
        part = "explanation";
        openParen = 0;
        continue;
      }
      const seg = l.segments ? { segments: l.segments.map((s) => (s.kind === "fraction" ? s : { ...s, style: "body" })), openParen } : segmentLine(l, bodySize, openParen);
      openParen = seg.openParen ?? openParen;
      cur[part].push({ text: l.text, segments: seg.segments, visual: { frame: "none", indentX: Math.round(l.bbox[0]) }, source: l.source });
    }
  }

  for (const p of problems) {
    if (p.answer.length === 0 && p.parsed.labelRaw !== "参考") unresolved.push({ reason: "doctor-answer-not-found", problem: p.stableId, source: p.source });
  }

  return {
    meta: { schema: "shohizei-doctor-structure-draft-0.1", bookId, documents: [{ docId: doc.docId, file: doc.file, pageCount: doc.pageCount, tool: doc.tool, toolVersion: doc.toolVersion, invocation: doc.invocation, diag: doc.diag }] },
    kind: "doctorBook",
    children: problems,
    unplacedLineCount: unplaced,
    unresolved,
  };
}
