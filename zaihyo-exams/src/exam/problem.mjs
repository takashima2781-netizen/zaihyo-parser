// 問題PDF（A）→ 問いの木（大問 → 問 → 小問 → 枝問）。
//
// - 見出しの形（patterns.mjs）と字下げ（x位置）で節を見つける。層は固定しない（「問」の層が無い教材もある）。
// - 各節の行を、指示文・本文・選択肢・語群・記号つきの文に分ける。行の原文は rows に残す。
// - 判断できない行は本文（passage）に残す（捨てない・推測で別の役割にしない）。

import { contentRows, normalizeForMatch } from "../common/rows.mjs";
import {
  CIRCLED,
  isNextOption,
  isWordBankHeading,
  OPTION_SERIES,
  parseDaimon,
  parseEdamonHeading,
  parseLabeledStatement,
  parseOptionLine,
  parseShomonHeading,
  parseToiHeading,
  parseWordBankLine,
} from "./patterns.mjs";

const MARGIN_TOLERANCE = 4;

/** 大問の見出し行の位置を返す（A・B・C 共通で使う）。 */
export function findDaimonRows(rows) {
  return rows
    .map((r, i) => ({ r, i, d: r.role === null ? parseDaimon(r.text) : null }))
    .filter((x) => x.d)
    .map((x) => ({ index: x.i, row: x.r, parsed: x.d }));
}

function rowRef(r) {
  return { text: r.text, source: r.source, x: r.x };
}

/**
 * @param {object} o
 * @param {string} o.setId
 * @param {Array} o.rows documentRows(problemDoc)
 * @param {number[]} o.daimonNos 読む大問（理論）の番号
 * @param {Map<number, Array<object>>} [o.expectedPaths] 大問ごとの、解答に出てくる見出しの並び（path の配列）。
 *   あれば、問題の見出しの候補のうち、この並びの次に来るものだけを見出しとする（字下げの位置は回ごとにまちまちなので）。
 *   引用文の項番号「１ 研究及び開発」「(1) 表示期間より…」を見出しと取り違えないため。
 */
export function buildProblemTree({ setId, rows, daimonNos, expectedPaths = new Map() }) {
  const nodes = [];
  const diag = [];
  const daimons = findDaimonRows(rows);
  for (let k = 0; k < daimons.length; k++) {
    const d = daimons[k];
    const end = k + 1 < daimons.length ? daimons[k + 1].index : rows.length;
    if (!daimonNos.includes(d.parsed.no)) {
      nodes.push(daimonNode(setId, d, { outOfScope: true }));
      continue;
    }
    const sectionRows = contentRows(rows.slice(d.index + 1, end));
    const events = headingEvents(expectedPaths.get(d.parsed.no) ?? []);
    buildDaimon({ setId, d, sectionRows, nodes, diag, events });
  }
  for (const n of nodes) splitContent(n);
  return { nodes, diag };
}

/** 解答の単位の並び → 見出しが現れる順番（問・小問・枝問の切り替わり）。 */
export function headingEvents(paths) {
  const events = [];
  let prev = { toi: null, shomon: null, edamon: null };
  for (const p of paths) {
    if (p.toi !== null && p.toi !== prev.toi) {
      events.push({ kind: "toi", no: p.toi });
      prev = { toi: p.toi, shomon: null, edamon: null };
    }
    if (p.shomon !== null && p.shomon !== prev.shomon) {
      events.push({ kind: "shomon", no: p.shomon });
      prev = { ...prev, shomon: p.shomon, edamon: null };
    }
    if (p.edamon !== null && p.edamon !== prev.edamon) {
      events.push({ kind: "edamon", no: p.edamon });
      prev = { ...prev, edamon: p.edamon };
    }
  }
  return events;
}

function daimonNode(setId, d, extra = {}) {
  return {
    id: `${setId}:d${d.parsed.no}`,
    kind: "daimon",
    parent: null,
    heading: rowRef(d.row),
    parsed: { no: d.parsed.no, points: d.parsed.points },
    source: [d.row.source],
    contentRows: [],
    ...extra,
  };
}

/** 行が見出しの形なら候補を返す（問・小問・枝問のどれか）。 */
function headingCandidates(r) {
  const out = [];
  const th = parseToiHeading(r.text);
  if (th) out.push({ kind: "toi", no: th.no, points: th.points, rest: th.rest });
  const sh = parseShomonHeading(r.text);
  if (sh) out.push({ kind: "shomon", no: sh.no, rest: sh.rest });
  const ed = parseEdamonHeading(r.text);
  if (ed) out.push({ kind: "edamon", no: ed.no, rest: ed.rest });
  return out;
}

// 解答の並びで、問題に見出しが無い（または読めない）ものを飛ばしてよい数
const EVENT_LOOKAHEAD = 2;
const LEVEL = { toi: 1, shomon: 2, edamon: 3 };

function buildDaimon({ setId, d, sectionRows, nodes, diag, events }) {
  const daimon = daimonNode(setId, d);
  nodes.push(daimon);
  const margin = d.row.x;
  let toi = null;
  let shomon = null;
  let edamon = null;
  let next = 0; // events の次に待つ位置
  const current = () => edamon ?? shomon ?? toi ?? daimon;

  const candsByRow = sectionRows.map(headingCandidates);
  const appearsLater = (i, e) => candsByRow.slice(i + 1).some((cs) => cs.some((c) => c.kind === e.kind && c.no === e.no));
  const accept = (r, i) => {
    const cands = candsByRow[i];
    if (cands.length === 0) return null;
    if (events.length === 0) {
      // 解答の並びが無いとき: 大問の見出しと同じ字下げの見出しだけ（以前の決まり）
      const atMargin = Math.abs(r.x - margin) <= MARGIN_TOLERANCE;
      const c = cands.find((c) =>
        c.kind === "toi" ? atMargin && /^$|^[（(]/.test(c.rest) : c.kind === "shomon" ? atMargin : shomon && r.x >= margin - MARGIN_TOLERANCE,
      );
      return c ?? null;
    }
    for (let k = next; k < Math.min(events.length, next + 1 + EVENT_LOOKAHEAD); k++) {
      // 上の層（問・小問）を飛ばして下の層に当てない（飛ばした小問の枝問を前の小問に付けてしまう）
      if (events.slice(next, k).some((e) => LEVEL[e.kind] < LEVEL[events[k].kind])) break;
      const c = cands.find((c) => c.kind === events[k].kind && c.no === events[k].no);
      // 待っている見出しが後ろの行にあるなら、ここは飛ばさない（引用文の項番号「２ 決算時の処理」を小問２と取り違えない）
      if (c && k > next && appearsLater(i, events[next])) return null;
      if (c) {
        if (k > next) diag.push({ reason: "expected-heading-not-found", daimon: d.parsed.no, skipped: events.slice(next, k), page: r.page });
        next = k + 1;
        return c;
      }
    }
    return null;
  };

  for (const [i, r] of sectionRows.entries()) {
    const c = accept(r, i);
    if (c?.kind === "toi") {
      toi = {
        id: `${daimon.id}:t${c.no}`,
        kind: "toi",
        parent: daimon.id,
        heading: rowRef(r),
        parsed: { no: c.no, points: c.points },
        source: [r.source],
        contentRows: [],
      };
      if (!/^$|^[（(]/.test(c.rest)) toi.headingRest = c.rest.length ? r.text.replace(/^[\s　]*(?:問[\s　]*[0-9０-９]+|【設問[0-9０-９]+】)[\s　]*/, "") : undefined;
      nodes.push(toi);
      shomon = null;
      edamon = null;
      continue;
    }
    if (c?.kind === "shomon") {
      const parent = toi ?? daimon;
      shomon = {
        id: `${parent.id}:s${c.no}`,
        kind: "shomon",
        parent: parent.id,
        heading: rowRef(r),
        headingRest: c.rest,
        parsed: { no: c.no },
        source: [r.source],
        contentRows: [],
      };
      if (nodes.some((n) => n.id === shomon.id)) {
        diag.push({ reason: "duplicate-shomon-number", id: shomon.id, page: r.page });
        shomon.id += `~${r.page}-${r.source.row}`;
      }
      nodes.push(shomon);
      edamon = null;
      continue;
    }
    if (c?.kind === "edamon") {
      const parent = shomon ?? toi ?? daimon;
      edamon = {
        id: `${parent.id}:e${c.no}`,
        kind: "edamon",
        parent: parent.id,
        heading: rowRef(r),
        headingRest: c.rest,
        parsed: { no: c.no },
        source: [r.source],
        contentRows: [],
      };
      if (nodes.some((n) => n.id === edamon.id)) {
        diag.push({ reason: "duplicate-edamon-number", id: edamon.id, page: r.page });
        edamon.id += `~${r.page}-${r.source.row}`;
      }
      nodes.push(edamon);
      continue;
    }
    current().contentRows.push(r);
  }
  if (events.length && next < events.length) diag.push({ reason: "expected-heading-not-found", daimon: d.parsed.no, skipped: events.slice(next), page: null });
}

/**
 * 節の行を役割に分ける。
 * - instruction: 見出しの後ろの文から、行末が「。」になるまで
 * - options: 「ア …」「イ …」と続く行（字下げが深い次の行はその選択肢の続き）
 * - wordBank: 【語群】の後ろの「ア 語 イ 語 …」の行
 * - labeledItems: 「Ａ …」の行
 * - passage: それ以外（空欄①…を含む本文・前提条件など）
 */
function splitContent(n) {
  if (!n.contentRows) return;
  const instruction = [];
  const passage = [];
  const options = [];
  const labeledItems = [];
  let wordBank = null;
  let mode = "instruction";
  if (n.headingRest !== undefined) {
    instruction.push({ text: n.headingRest, source: n.heading.source, x: n.heading.x, fromHeading: true });
    if (/。[\s　]*$/.test(n.headingRest)) mode = "body";
  }
  let lastOption = null;
  let optionSeries = null;
  for (const r of n.contentRows) {
    if (mode === "wordBank") {
      const entries = parseWordBankLine(r.text);
      if (entries) {
        for (const e of entries) wordBank.entries.push({ ...e, source: r.source });
        wordBank.rows.push(rowRef(r));
        continue;
      }
      mode = "body";
    }
    if (isWordBankHeading(r.text)) {
      wordBank = { heading: rowRef(r), entries: [], rows: [] };
      mode = "wordBank";
      continue;
    }
    const opt = parseOptionLine(r.text);
    const prevSymbol = options.at(-1)?.symbol ?? null;
    if (opt && isNextOption(prevSymbol, opt.symbol, optionSeries) && !parseWordBankLine(r.text)?.[1]) {
      if (prevSymbol === null) optionSeries = OPTION_SERIES.find((ser) => ser[0] === opt.symbol);
      lastOption = { symbol: opt.symbol, text: opt.text, x: r.x, rows: [rowRef(r)] };
      options.push(lastOption);
      mode = "body";
      continue;
    }
    if (lastOption && r.x > lastOption.x + 4 && !parseLabeledStatement(r.text)) {
      lastOption.rows.push(rowRef(r));
      lastOption.text += r.text.trim();
      continue;
    }
    lastOption = null;
    const lab = parseLabeledStatement(r.text);
    if (lab && mode !== "instruction") {
      labeledItems.push({ ...lab, rows: [rowRef(r)] });
      continue;
    }
    if (mode === "instruction") {
      instruction.push(rowRef(r));
      if (/。[\s　]*$/.test(r.text)) mode = "body";
      continue;
    }
    passage.push(rowRef(r));
  }
  n.instruction = instruction;
  n.passage = passage;
  n.options = options;
  n.wordBank = wordBank;
  n.labeledItems = labeledItems;
  n.blankLabels = [...new Set(passage.flatMap((r) => blanksInPassageRow(r.text)))];
  n.instructionText = instruction.map((r) => r.text.trim()).join("");
  delete n.contentRows;
}

/**
 * 本文の空欄①…: 前後に空白がある丸数字だけを空欄とみなす。行頭の丸数字（「① 当社は…」の箇条）は空欄にしない。
 */
export function blanksInPassageRow(text) {
  const out = [];
  const t = text.replace(/^[\s　]+/, "");
  const chars = [...t];
  for (let i = 1; i < chars.length; i++) {
    if (!CIRCLED.includes(chars[i])) continue;
    const before = chars[i - 1];
    const after = chars[i + 1];
    if (/[\s　]/.test(before) && (after === undefined || /[\s　]/.test(after))) out.push(chars[i]);
  }
  return out;
}

/** 照合のための節の鍵（大問・問・小問・枝問）。答案用紙・解答の単位と同じ形。 */
export function nodeKey(nodes, n) {
  const byId = new Map(nodes.map((x) => [x.id, x]));
  const path = { daimon: null, toi: null, shomon: null, edamon: null };
  for (let cur = n; cur; cur = cur.parent ? byId.get(cur.parent) : null) path[cur.kind] = cur.parsed.no;
  return unitKey(path);
}

export function unitKey(p) {
  return `d${p.daimon ?? "-"}/t${p.toi ?? "-"}/s${p.shomon ?? "-"}/e${p.edamon ?? "-"}`;
}

export { normalizeForMatch };
