// 答練1回分（問題・答案用紙・解答）→ 教材構造（第1層）。
//
// 問いの木（problem.mjs）、解答欄ごとの答え（answerKey.mjs）、解答への道（guidance.mjs）を、
// 大問・問・小問・枝問の番号（nodeKey / unitKey）でつなぐ。つながらないものは推測で埋めず unresolved に残す。

import { documentRows } from "../common/rows.mjs";
import { buildAnswerKey, circleMarks } from "./answerKey.mjs";
import { attachUnderlines, underlineSegments } from "./underlines.mjs";
import { formCandidates } from "./forms.mjs";
import { buildGuidance } from "./guidance.mjs";
import { buildProblemTree, nodeKey, unitKey } from "./problem.mjs";

export const STRUCTURE_VERSION = "zaihyo-exam-structure-0.1";

/**
 * @param {object} o
 * @param {object} o.set { id, title, book, daimonNos }
 * @param {object} o.problemDoc extractDocument の結果（透かし除去済み）
 * @param {object} o.sheetDoc
 * @param {object} o.answerDoc
 */
export function buildExam({ set, problemDoc, sheetDoc, answerDoc }) {
  const unresolved = [];
  const key = buildAnswerKey({
    sheetRows: documentRows(sheetDoc),
    answerRows: documentRows(answerDoc),
    daimonNos: set.daimonNos,
    marks: { sheet: circleMarks(sheetDoc), answer: circleMarks(answerDoc) },
  });
  // 問題の見出しは、解答に出てくる見出しの並びと照らして見つける（字下げの位置は回ごとにまちまち）
  const expectedPaths = new Map(key.daimons.map((d) => [d.daimon, d.units.map((u) => u.path)]));
  const problemRows = documentRows(problemDoc);
  const problem = buildProblemTree({ setId: set.id, rows: problemRows, daimonNos: set.daimonNos, expectedPaths });
  // 「上記下線部」の問い: 問題PDFの下線（行の下の細い横線）を、行の文字の範囲として残す
  attachUnderlines(problem.nodes, problemRows, underlineSegments(problemDoc));

  const nodes = problem.nodes;
  const children = new Map();
  for (const n of nodes) if (n.parent) children.set(n.parent, [...(children.get(n.parent) ?? []), n.id]);
  for (const n of nodes) n.children = children.get(n.id) ?? [];
  const byKey = new Map(nodes.map((n) => [nodeKey(nodes, n), n]));

  // 答え
  for (const d of key.daimons) {
    for (const u of d.units) {
      if (u.slots.length === 0) continue; // 問・小問の見出しだけの単位（答えは下の枝問にある）
      // 解答だけに「(1)」がある（問題の小問に枝問の見出しが無い）→ 枝問の無い小問に付ける
      const parentKey = u.path.edamon !== null ? unitKey({ ...u.path, edamon: null }) : null;
      const parent = parentKey ? byKey.get(parentKey) : null;
      const n = byKey.get(u.key) ?? (parent && parent.children.length === 0 && !parent.answer ? parent : null);
      if (!n) {
        unresolved.push({ reason: "answer-unit-without-question", key: u.key, source: u.heading.source });
        continue;
      }
      n.answer = { key: u.key, heading: u.heading, sheetHeading: u.sheetHeading, segments: u.segments, unmatchedSheetSpans: u.unmatchedSheetSpans };
      n.source.push(u.heading.source);
    }
    const daimon = byKey.get(unitKey({ daimon: d.daimon }));
    if (daimon) {
      daimon.pointsRaw = d.points;
      daimon.answerHeading = d.heading;
    }
  }

  // 解答への道
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const hasToi = new Set(nodes.filter((n) => n.kind === "toi").map((n) => byId.get(n.parent).parsed.no)); // 問の層がある大問
  const guidanceDiag = [];
  for (const d of key.daimons) {
    const g = buildGuidance(d.guidanceRows, d.daimon);
    guidanceDiag.push(...g.diag);
    for (const b of g.blocks) {
      // 解説に「設問１」があっても、答案用紙・問題の木に問の層が無い回がある → 問の層なしでも探す
      const find = (p) => byKey.get(unitKey({ daimon: d.daimon, ...p })) ?? (p.toi !== null && !hasToi.has(d.daimon) ? byKey.get(unitKey({ daimon: d.daimon, ...p, toi: null })) : undefined);
      const targets = b.refs ? b.refs.map((r) => find({ toi: b.toi, shomon: r.shomon, edamon: r.edamon })) : [find({ toi: b.toi })];
      const block = { heading: b.heading, rows: b.rows.map(({ text, source }) => ({ text, source })), optionJudgements: b.optionJudgements.map(({ x, ...j }) => j), sharedWith: b.refs && b.refs.length > 1 ? b.refs : null };
      targets.forEach((t, i) => {
        if (!t) {
          unresolved.push({ reason: "guidance-without-question", daimon: d.daimon, toi: b.toi, ref: b.refs?.[i] ?? null, source: b.heading?.source ?? b.rows[0]?.source ?? null });
          return;
        }
        (t.guidance ??= []).push(block);
      });
    }
  }

  // 問い方の候補と、答えが無い問い
  for (const n of nodes) {
    if (n.kind === "daimon" || n.outOfScope) continue;
    const isLeaf = n.children.length === 0 && n.kind !== "toi";
    // 末端の問いは、指示文が「。」で切れた後の行（本文に入った行）にも問い方が書かれていることがある
    // （「…示している。」の次の行に「上記Ａ～Ｅを…並び替えなさい。」など）。末端では本文の行も根拠に含める。
    const formText = (n.instructionText ?? "") + (isLeaf ? n.passage.map((r) => r.text.trim()).join("") : "");
    n.formCandidates = formCandidates(formText);
    if (isLeaf && !n.answer) unresolved.push({ reason: "question-without-answer", id: n.id, source: n.heading.source });
  }
  // 末端の問いに問い方の言い回しが無い（「(1) 同一種類…の場合」だけ）→ 上の節の指示文の問い方を使う（どこから来たかを残す）
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) {
    if (n.kind === "daimon" || n.outOfScope || n.children.length !== 0 || n.kind === "toi") continue;
    for (let p = nodeById.get(n.parent); n.formCandidates.length === 0 && p && p.kind !== "daimon"; p = nodeById.get(p.parent)) {
      n.formCandidates = (p.formCandidates ?? []).map((c) => ({ ...c, inheritedFrom: p.id }));
    }
    if (n.formCandidates.length === 0) unresolved.push({ reason: "form-unknown", id: n.id, source: n.heading.source });
  }

  return {
    structureVersion: STRUCTURE_VERSION,
    set: { id: set.id, title: set.title, book: set.book, daimonNos: set.daimonNos },
    documents: [problemDoc, sheetDoc, answerDoc].map((d) => ({ docId: d.docId, file: d.file, tool: d.tool, toolVersion: d.toolVersion, pageCount: d.pageCount, watermarkLinesRemoved: d.diag.watermarkLinesRemoved })),
    nodes,
    unresolved,
    diag: [...problem.diag, ...key.diag, ...guidanceDiag],
  };
}
