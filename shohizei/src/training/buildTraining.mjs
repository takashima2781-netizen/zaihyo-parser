// 第1層（教材構造）: トレーニング（問題PDF・解答PDF・シートPDF）を1冊の構造にまとめる。
//
// 問題と解答は別のPDF。つなぐ鍵は目次の「問題番号」（ページの並びではない）。
// 型に当てはまらない行は unknown のまま残し、行を落とさない（どの行も、どこかのノードの lines に入る）。

import { pageLines, maxSpanSize, makeIdFactory } from "../common/layout.mjs";
import { restoreFractions } from "../common/fractions.mjs";
import {
  parseTocLine,
  parseProblemHeading,
  parseLevel,
  parseTime,
  parseMarker,
  findBlanks,
  parseJudgement,
  GUIDANCE_HEADING,
  questionFormCandidates,
} from "./patterns.mjs";

const HEADING_MIN_SIZE = 12; // 見出しの文字（本文 9pt、見出し 14pt 前後）

function lineNode(line) {
  const node = { text: line.text, source: line.source };
  const marker = parseMarker(line.text);
  if (marker) node.marker = marker;
  if (line.segments) node.segments = line.segments;
  return node;
}

function collectLines(doc, runningHead) {
  const out = [];
  const fractionsUnresolved = [];
  for (const page of doc.pages) {
    let lines = pageLines(doc, page, { runningHeads: [runningHead] });
    const isBodyPage = lines.some((l) => l.role === "runningHead");
    const restored = restoreFractions(lines);
    lines = restored.lines;
    fractionsUnresolved.push(...restored.unresolved);
    for (const l of lines) out.push({ ...l, bodyPage: isBodyPage });
  }
  return { lines: out, fractionsUnresolved };
}

/** 問題編／解答編の行を、見出し（問題N）ごとに区切る。見出しより前の行は preface に入る。 */
function splitByHeading(lines) {
  const sections = [];
  const preface = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.bodyPage || l.role) continue;
    const heading = maxSpanSize(l) >= HEADING_MIN_SIZE ? parseProblemHeading(l.text) : null;
    if (heading) {
      current = { heading, headingLine: l, levelLine: null, timeLine: null, body: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      preface.push(l);
      continue;
    }
    // 見出しと同じかたまりにある難度（例: 「基礎」）
    if (!current.levelLine && l.block === current.headingLine.block && parseLevel(l.text)) {
      current.levelLine = l;
      continue;
    }
    // 見出し直後の目安時間（例: 「１分」）
    if (!current.timeLine && current.body.length === 0 && parseTime(l.text)) {
      current.timeLine = l;
      continue;
    }
    current.body.push(l);
  }
  return { sections, preface };
}

function parseToc(doc) {
  const entries = [];
  const unparsed = [];
  for (const page of doc.pages) {
    const lines = pageLines(doc, page, { runningHeads: ["問題編"] });
    if (lines.some((l) => l.role === "runningHead")) break; // 問題編に入ったら目次は終わり
    for (const l of lines) {
      if (l.role) continue;
      const parsed = parseTocLine(l.text);
      if (parsed) entries.push({ ...parsed, source: l.source });
      // 目次の行らしい（問題番号で始まり、点線のリーダーがある）のに読めなかったものだけを記録する。
      // 学習記録シートの「問題N」の欄などは目次ではないので対象にしない。
      else if (/^問題\s*[0-9０-９]/.test(l.text.trim()) && /[·･…‥]{3,}/.test(l.text)) unparsed.push({ text: l.text, source: l.source });
    }
  }
  return { entries, unparsed };
}

export function buildTraining({ bookId, problemDoc, answerDoc, sheetDoc = null }) {
  const nextId = makeIdFactory(bookId);
  const unresolved = [];

  const toc = parseToc(problemDoc);
  for (const u of toc.unparsed) unresolved.push({ reason: "toc-line-not-parsed", source: [u.source] });

  const problemSide = collectLines(problemDoc, "問題編");
  const answerSide = collectLines(answerDoc, "解答編");
  for (const f of [...problemSide.fractionsUnresolved, ...answerSide.fractionsUnresolved]) unresolved.push(f);

  const problems = splitByHeading(problemSide.lines);
  const answers = splitByHeading(answerSide.lines);

  const byNo = (sections, side) => {
    const map = new Map();
    for (const s of sections) {
      if (map.has(s.heading.no)) {
        unresolved.push({ reason: `duplicate-${side}-heading`, problemNo: s.heading.no, source: [s.headingLine.source] });
        continue;
      }
      map.set(s.heading.no, s);
    }
    return map;
  };
  const problemByNo = byNo(problems.sections, "problem");
  const answerByNo = byNo(answers.sections, "answer");

  // 回（session）と問題の並びは目次に従う。目次に無い問題番号が本文にあれば unresolved。
  const sessions = [];
  let session = null;
  const tocProblemNos = new Set();
  for (const e of toc.entries) {
    if (e.kind === "session") {
      session = { id: nextId("session"), kind: "session", raw: `第${e.no}回`, parsed: { no: e.no }, source: [e.source], children: [] };
      sessions.push(session);
      continue;
    }
    tocProblemNos.add(e.no);
    if (!session) {
      session = { id: nextId("session"), kind: "session", raw: null, parsed: { no: "unknown" }, source: [], children: [] };
      sessions.push(session);
    }
    session.children.push(buildProblemNode(e));
  }
  for (const no of problemByNo.keys()) {
    if (!tocProblemNos.has(no)) unresolved.push({ reason: "problem-not-in-toc", problemNo: no, source: [problemByNo.get(no).headingLine.source] });
  }
  for (const no of answerByNo.keys()) {
    if (!tocProblemNos.has(no)) unresolved.push({ reason: "answer-not-in-toc", problemNo: no, source: [answerByNo.get(no).headingLine.source] });
  }

  function buildProblemNode(tocEntry) {
    const p = problemByNo.get(tocEntry.no);
    const a = answerByNo.get(tocEntry.no);
    const node = {
      id: nextId("problem"),
      stableId: `${bookId}:problem-${tocEntry.no}`,
      kind: "problem",
      parsed: {
        no: tocEntry.no,
        titleRaw: p ? p.heading.titleRaw : tocEntry.titleRaw,
        seriesRaw: p ? p.heading.seriesRaw : null,
        levelRaw: p?.levelLine ? p.levelLine.text.trim() : "unknown",
        timeRaw: p?.timeLine ? parseTime(p.timeLine.text).raw : "unknown",
        hasSheet: tocEntry.hasSheet,
        tocPages: { problem: tocEntry.problemPage, answer: tocEntry.answerPage },
        tocTitleRaw: tocEntry.titleRaw,
        tocLevelRaw: tocEntry.levelRaw,
      },
      source: [tocEntry.source],
      question: null,
      answer: null,
      guidance: null,
      sheetRef: null,
      unresolved: [],
    };

    if (!p) node.unresolved.push({ reason: "problem-body-not-found" });
    else {
      node.source.push(p.headingLine.source);
      const body = p.body.map(lineNode);
      for (const b of body) {
        const blanks = findBlanks(b.text);
        if (blanks.length) b.blanks = blanks;
      }
      // 指示文: 本文の先頭から、行頭記号のある行の手前まで（複数行に折り返していることがある）。
      const firstMarked = body.findIndex((b) => b.marker);
      const instructionLines = body.slice(0, firstMarked === -1 ? body.length : firstMarked);
      const instructionRaw = instructionLines.length ? instructionLines.map((b) => b.text).join("\n") : null;
      node.question = {
        headingRaw: p.headingLine.text,
        instructionRaw,
        formCandidates: instructionRaw ? questionFormCandidates(instructionRaw.replace(/\s*\n\s*/g, "")) : [],
        lines: body,
      };
      if (node.question.formCandidates.length === 0) node.question.formCandidates = [{ form: "unknown", evidence: null }];
      if (p.heading.titleRaw !== tocEntry.titleRaw && p.heading.titleRaw.replace(/\s/g, "") !== tocEntry.titleRaw.replace(/\s/g, "")) {
        node.unresolved.push({ reason: "title-differs-from-toc" });
      }
      if (p.levelLine && p.levelLine.text.trim() !== tocEntry.levelRaw) node.unresolved.push({ reason: "level-differs-from-toc" });
      if (p.heading.hasSheetMark !== tocEntry.hasSheet) node.unresolved.push({ reason: "sheet-mark-differs-from-toc" });
    }

    if (!a) node.unresolved.push({ reason: "answer-not-found" });
    else {
      node.source.push(a.headingLine.source);
      const all = a.body.map(lineNode);
      const g = all.findIndex((l) => GUIDANCE_HEADING.test(l.text.trim()));
      const answerLines = g === -1 ? all : all.slice(0, g);
      for (const l of answerLines) {
        const j = parseJudgement(l.text);
        if (j) l.judgement = j;
      }
      node.answer = { headingRaw: a.headingLine.text, lines: answerLines };
      node.guidance = g === -1 ? null : { headingRaw: all[g].text, lines: all.slice(g + 1) };
    }

    if (tocEntry.hasSheet) {
      // シートPDFは画像だけで文字が無いため、どのページがこの問題のものかは読み取れない。
      node.sheetRef = sheetDoc
        ? { doc: sheetDoc.docId, pages: "unknown", textAvailable: sheetDoc.textAvailable }
        : { doc: "unknown", pages: "unknown" };
    }
    return node;
  }

  const prefaceText = problems.preface.map((l) => ({ text: l.text, source: l.source }));

  return {
    meta: {
      schema: "shohizei-training-structure-draft-0.1",
      bookId,
      documents: [problemDoc, answerDoc, sheetDoc].filter(Boolean).map((d) => ({
        docId: d.docId,
        file: d.file,
        pageCount: d.pageCount,
        tool: d.tool,
        toolVersion: d.toolVersion,
        invocation: d.invocation,
        textAvailable: d.textAvailable ?? true,
        diag: d.diag,
      })),
    },
    kind: "trainingBook",
    children: sessions,
    unplaced: { problemPreface: prefaceText, answerPreface: answers.preface.map((l) => ({ text: l.text, source: l.source })) },
    unresolved,
  };
}
