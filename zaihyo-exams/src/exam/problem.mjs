// 問題PDF（A）→ 問いの木（大問 → 問 → 小問 → 枝問）。
//
// - 見出しの形（patterns.mjs）と字下げ（x位置）で節を見つける。層は固定しない（「問」の層が無い教材もある）。
// - 各節の行を、指示文・本文・選択肢・語群・記号つきの文に分ける。行の原文は rows に残す。
// - 判断できない行は本文（passage）に残す（捨てない・推測で別の役割にしない）。

import { contentRows, normalizeForMatch } from "../common/rows.mjs";
import {
  CIRCLED,
  isWordBankHeading,
  kanaIndex,
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
 */
export function buildProblemTree({ setId, rows, daimonNos }) {
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
    buildDaimon({ setId, d, sectionRows, nodes, diag });
  }
  for (const n of nodes) splitContent(n);
  return { nodes, diag };
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

function buildDaimon({ setId, d, sectionRows, nodes, diag }) {
  const daimon = daimonNode(setId, d);
  nodes.push(daimon);
  const margin = d.row.x;
  let toi = null;
  let shomon = null;
  let edamon = null;
  const current = () => edamon ?? shomon ?? toi ?? daimon;

  for (const r of sectionRows) {
    const atMargin = Math.abs(r.x - margin) <= MARGIN_TOLERANCE;
    const th = atMargin ? parseToiHeading(r.text) : null;
    if (th && /^$|^[（(]/.test(th.rest)) {
      toi = {
        id: `${daimon.id}:t${th.no}`,
        kind: "toi",
        parent: daimon.id,
        heading: rowRef(r),
        parsed: { no: th.no, points: th.points },
        source: [r.source],
        contentRows: [],
      };
      nodes.push(toi);
      shomon = null;
      edamon = null;
      continue;
    }
    const sh = atMargin ? parseShomonHeading(r.text) : null;
    if (sh) {
      const parent = toi ?? daimon;
      shomon = {
        id: `${parent.id}:s${sh.no}`,
        kind: "shomon",
        parent: parent.id,
        heading: rowRef(r),
        headingRest: sh.rest,
        parsed: { no: sh.no },
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
    const ed = shomon && r.x >= margin - MARGIN_TOLERANCE ? parseEdamonHeading(r.text) : null;
    if (ed) {
      edamon = {
        id: `${shomon.id}:e${ed.no}`,
        kind: "edamon",
        parent: shomon.id,
        heading: rowRef(r),
        headingRest: ed.rest,
        parsed: { no: ed.no },
        source: [r.source],
        contentRows: [],
      };
      nodes.push(edamon);
      continue;
    }
    current().contentRows.push(r);
  }
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
    const expected = lastOption ? kanaIndex(lastOption.symbol) + 1 : 0;
    if (opt && kanaIndex(opt.symbol) === expected && !parseWordBankLine(r.text)?.[1]) {
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
