// 教材構造（第1層）→ 学習アプリ用の問題データ（第2層 Exercise View）。
//
// 問い方の候補（formCandidates）と答えの形がそろうものだけを問題にする。そろわないものは作らず、
// diagnostics に理由の名前つきで残す（推測で埋めない）。原文の文字は言い換えない。
// 表示用に、行の連続した空白を1つにまとめ、PDFの行の折り返しをつなぐ（教材構造の原文はそのまま）。
//
// 形式（WISHLIST W-9 の決定）:
//   語群から選ぶ     → choice_item（空欄ごと）
//   1つ選ぶ          → choice_item
//   2つ以上選ぶ      → true_false（解答への道の「ア 〇 / エ ×：理由」を選択肢ごとに。〇×が無ければ作らない）
//   語句・名称を書く → multi_blank
//   定義・説明を書く → recall_text
//   並べ替える       → ordering
//   計算する         → まだ作らない

import { CIRCLED } from "../exam/patterns.mjs";

export const SCHEMA_VERSION = "exercise-view-schema-v1.8.0";
export const GENERATOR = "zaihyo-exams-exercise-view-0.1";
const SUBJECT = "zaihyo";

export function displayText(t) {
  return t.replace(/[\s　]+/g, " ").trim();
}

function rawSpan(text, source, nodeId) {
  return {
    text,
    source: source ? { documentId: source.doc, locator: `pdf:page=${source.page};row=${source.row}` } : null,
    bsmNodeId: nodeId ?? null,
    inherited: false,
  };
}

const PARAGRAPH_START = /^[\s　]*([0-9０-９]+[.．]|[（(][0-9０-９]+[）)]|[①-⑳]|[Ａ-Ｚ][\s　]|【|〔|※)/;

/** PDF の行の並び → 段落ごとにつないだ文。新しい段落は、行頭の項番号・字下げで見分ける。 */
export function joinRows(rows) {
  const paras = [];
  let prev = null;
  for (const r of rows) {
    const t = displayText(r.text);
    if (!t) continue;
    const startsNew =
      !prev ||
      r.paragraphStart ||
      PARAGRAPH_START.test(r.text) ||
      (/[。」）)]$/.test(displayText(prev.text)) && r.x > prev.x + 4);
    if (startsNew) paras.push(t);
    else paras[paras.length - 1] += t;
    prev = r;
  }
  return paras.join("\n");
}

function richFromRows(rows) {
  const text = joinRows(rows);
  return text.split("\n").map((t) => ({ segments: [{ kind: "text", text: t }], frame: "none", depth: 0, continues: false }));
}

function structureNode(id, title) {
  return { structureNodeId: id, titleRaw: rawSpan(title, null, id) };
}

function ancestors(byId, q) {
  const out = [];
  for (let cur = q; cur; cur = cur.parent ? byId.get(cur.parent) : null) out.unshift(cur);
  return out;
}

function nodeTitle(n) {
  if (n.kind === "daimon") return displayText(n.heading.text).replace(/\s*[－-]\s*\d+\s*点\s*[－-]\s*$/, "");
  return displayText(n.heading.text).slice(0, 40);
}

function questionLabel(chain) {
  return chain
    .filter((n) => n.kind !== "daimon")
    .map((n) => (n.kind === "toi" ? `問${n.parsed.no}` : n.kind === "shomon" ? `${n.parsed.no}` : `(${n.parsed.no})`))
    .join(" ");
}

/** 問題文: 問・小問・枝問の指示文と本文（記号つきの文は opts.withLabeled のときだけ）。 */
function contextRows(chain, { withLabeled = true, withOwnPassage = true } = {}) {
  const rows = [];
  chain.forEach((n, i) => {
    if (n.kind === "daimon") return;
    const own = i === chain.length - 1;
    // 節の境目（指示文・本文・記号つきの文）では必ず段落を改める（joinRows が見る印）
    const mark = (rs) => rs.map((r, k) => (k === 0 ? { ...r, paragraphStart: true } : r));
    rows.push(...mark(n.instruction.filter((r) => displayText(r.text))));
    if (withLabeled) for (const l of n.labeledItems) rows.push(...mark(l.rows));
    if (!own || withOwnPassage) rows.push(...mark(n.passage));
  });
  return rows;
}

function guidanceOf(chain) {
  const q = chain.at(-1);
  if (q.guidance?.length) return q.guidance;
  for (let i = chain.length - 2; i >= 0; i--) if (chain[i].guidance?.length && chain[i].kind !== "toi") return chain[i].guidance;
  return [];
}

function slotsOf(q) {
  return q.answer ? q.answer.segments.filter((s) => s.type === "slot") : [];
}

/** 欄の名前が無い答えに、指示文の空欄の番号（「空欄②に…」）を順に当てる。数が合わなければ当てない。 */
function slotLabels(q) {
  const slots = slotsOf(q);
  const named = slots.map((s) => s.label);
  if (named.every((l) => l)) return named;
  const inInstruction = [...new Set([...q.instructionText].filter((c) => CIRCLED.includes(c)))];
  const range = q.instructionText.match(/([①-⑳])[\s　]*から[\s　]*([①-⑳])/);
  const labels = range ? [...CIRCLED].slice(CIRCLED.indexOf(range[1]), CIRCLED.indexOf(range[2]) + 1) : inInstruction;
  if (named.every((l) => !l) && labels.length === slots.length) return labels;
  return named;
}

export function buildExamExercises(structure, { diag = [] } = {}) {
  const byId = new Map(structure.nodes.map((n) => [n.id, n]));
  const set = structure.set;
  const leaves = structure.nodes.filter((n) => (n.kind === "shomon" || n.kind === "edamon") && n.children.length === 0);
  const out = [];
  for (const q of leaves) {
    const chain = ancestors(byId, q);
    const daimon = chain[0];
    const toi = chain.find((n) => n.kind === "toi");
    const structureRef = {
      book: structureNode(`zexam:book:${set.book.id}`, set.book.title),
      theme: structureNode(`zexam:${set.id}`, set.title),
      section: structureNode(`zexam:${daimon.id}`, nodeTitle(daimon)),
      topic: structureNode(`zexam:${(toi ?? daimon).id}`, toi ? `問${toi.parsed.no}` : nodeTitle(daimon)),
    };
    const ctx = {
      q,
      chain,
      structure: structureRef,
      structurePath: chain.map((n) => `zexam:${n.id}`),
      label: questionLabel(chain),
      provenance: { generator: GENERATOR, sourceKind: "zaihyo_exam_structure", setId: set.id, questionId: q.id },
      guidance: guidanceOf(chain),
    };
    const forms = q.formCandidates.map((c) => c.form);
    const before = out.length;
    if (!q.answer) diag.push({ reason: "no-answer", question: q.id });
    else if (forms.includes("calculate")) diag.push({ reason: "calculation-not-yet", question: q.id, forms });
    else if (forms.includes("choose_from_word_bank")) out.push(...wordBankExercises(ctx, diag));
    else if (forms.includes("choose_options")) {
      const count = q.formCandidates.find((c) => c.form === "choose_options").count;
      out.push(...(count === 1 ? chooseOneExercises(ctx, diag) : chooseManyExercises(ctx, count, diag)));
    } else if (forms.includes("order")) out.push(...orderingExercises(ctx, diag));
    else if (forms.includes("write_text")) out.push(...recallExercises(ctx, diag));
    else if (forms.includes("write_terms")) out.push(...termsExercises(ctx, diag));
    else diag.push({ reason: "form-unknown", question: q.id });
    if (out.length === before && !diag.some((d) => d.question === q.id)) diag.push({ reason: "no-exercise", question: q.id });
  }
  return out;
}

function baseExercise(ctx, { id, type, stableIds, prompt = null, body = null, instructionRaw = null }) {
  const ex = {
    exerciseId: id,
    exerciseType: type,
    sourceBookStructureIds: ctx.structurePath,
    sourceItemIds: [ctx.q.id],
    stableItemIds: stableIds,
    contentFingerprints: [],
    prompt,
    body,
    choices: null,
    expectedAnswer: [],
    judgement: null,
    explanation: null,
    answerForm: null,
    withheldAnswerContent: null,
    structureType: null,
    subQuestions: null,
    bodySegments: null,
    structurePath: ctx.structurePath,
    structure: ctx.structure,
    instructionRaw,
    generationRule: null,
    eligibility: "eligible",
    ineligibilityReasons: [],
    provenance: ctx.provenance,
    reviewOverride: null,
    questionLabel: ctx.label,
  };
  if (ctx.guidance.length) {
    ex.guidanceRich = ctx.guidance.flatMap((b) => richFromRows(b.rows.map((r) => ({ ...r, x: r.source.bbox[0] }))));
  }
  return ex;
}

function promptOf(ctx, opts) {
  const rows = contextRows(ctx.chain, opts);
  return rawSpan(joinRows(rows), rows[0]?.source, ctx.q.id);
}

function findWordBank(chain) {
  for (let i = chain.length - 1; i >= 0; i--) if (chain[i].wordBank?.entries.length) return chain[i].wordBank;
  return null;
}

function wordBankExercises(ctx, diag) {
  const wb = findWordBank(ctx.chain);
  if (!wb) {
    diag.push({ reason: "word-bank-not-found", question: ctx.q.id });
    return [];
  }
  const symbols = new Set(wb.entries.map((e) => e.symbol));
  const options = wb.entries.map((e) => ({ value: e.symbol, label: `${e.symbol} ${displayText(e.text)}` }));
  const labels = slotLabels(ctx.q);
  const prompt = promptOf(ctx);
  const out = [];
  slotsOf(ctx.q).forEach((slot, i) => {
    const answer = displayText(slot.text);
    if (!symbols.has(answer)) {
      diag.push({ reason: "word-bank-answer-not-in-bank", question: ctx.q.id, slot: i });
      return;
    }
    const tag = labels[i] ?? String(i + 1);
    const stable = `zexam:${ctx.q.id}:slot-${tag}`;
    const ex = baseExercise(ctx, {
      id: `${stable}:choice`,
      type: "choice_item",
      stableIds: [stable],
      prompt: { ...prompt, text: `${prompt.text}\n空欄 ${labels[i] ?? ""}`.trimEnd() },
    });
    ex.choiceOptions = options;
    ex.correctChoice = answer;
    ex.choiceMeta = { kind: "word-bank", blank: labels[i] ?? null, answerSource: slot.sources[0] };
    out.push(ex);
  });
  return out;
}

function chooseOneExercises(ctx, diag) {
  const q = ctx.q;
  const slots = slotsOf(q);
  const answer = slots.length === 1 ? displayText(slots[0].text) : null;
  if (!q.options.length || !answer || !q.options.some((o) => o.symbol === answer)) {
    diag.push({ reason: "choose-one-answer-not-in-options", question: q.id });
    return [];
  }
  const stable = `zexam:${q.id}`;
  const ex = baseExercise(ctx, { id: `${stable}:choice`, type: "choice_item", stableIds: [stable], prompt: promptOf(ctx) });
  ex.choiceOptions = q.options.map((o) => ({ value: o.symbol, label: `${o.symbol} ${displayText(o.text)}` }));
  ex.correctChoice = answer;
  ex.choiceMeta = { kind: "choose-one", answerSource: slots[0].sources[0] };
  return [ex];
}

function chooseManyExercises(ctx, count, diag) {
  const q = ctx.q;
  const slots = slotsOf(q);
  const answers = slots.length === 1 ? displayText(slots[0].text).split(/[、,，\s]+/).filter(Boolean) : [];
  const judgements = new Map(ctx.guidance.flatMap((b) => b.optionJudgements).map((j) => [j.symbol, j]));
  const negative = /適切でない|誤っている|正しくない|妥当でない/.test(q.instructionText);
  const positive = !negative && /適切な|正しい|妥当な/.test(q.instructionText);
  if (answers.length !== count || (!negative && !positive)) {
    diag.push({ reason: "choose-many-answer-shape", question: q.id });
    return [];
  }
  // 解答への道の〇×と、解答の記号が食い違わないことを確かめる（食い違えば作らない）
  const picked = q.options.filter((o) => judgements.get(o.symbol)?.mark === (negative ? "×" : "○")).map((o) => o.symbol);
  if (q.options.some((o) => !judgements.has(o.symbol)) || picked.join() !== [...answers].sort((a, b) => a.localeCompare(b)).join()) {
    diag.push({ reason: "choose-many-judgements-mismatch", question: q.id });
    return [];
  }
  // 指示欄: 問・小問の指示文と本文。並べ替え用の記号つきの文（Ａ～Ｅ）は、選択肢の〇×には関係しないので出さない
  const instruction = rawSpan(joinRows(contextRows(ctx.chain, { withLabeled: false })), q.instruction[0]?.source, q.id);
  return q.options.map((o) => {
    const j = judgements.get(o.symbol);
    const stable = `zexam:${q.id}:option-${o.symbol}`;
    const ex = baseExercise(ctx, {
      id: `${stable}:tf`,
      type: "true_false",
      stableIds: [stable],
      body: rawSpan(`${o.symbol} ${displayText(o.text)}`, o.rows[0].source, q.id),
      instructionRaw: instruction,
    });
    ex.judgement = {
      symbolRaw: rawSpan(j.mark, j.source, q.id),
      answerBodyRaw: rawSpan(j.rows.map((r) => displayText(r.text)).join(""), j.source, q.id),
    };
    ex.explanation = j.reason ? { raw: rawSpan(displayText(j.reason), j.source, q.id), role: null } : null;
    ex.trueFalseMeta = { derivedFrom: "choose-options", optionsToChoose: count, markRaw: j.markRaw };
    return ex;
  });
}

function orderingExercises(ctx, diag) {
  const q = ctx.q;
  const items = ctx.chain.flatMap((n) => n.labeledItems);
  const order = slotsOf(q).map((s) => displayText(s.text));
  const byLabel = new Map(items.map((it) => [it.label, it]));
  if (items.length < 2 || order.length !== items.length || new Set(order).size !== order.length || order.some((l) => !byLabel.has(l))) {
    diag.push({ reason: "ordering-answer-shape", question: q.id });
    return [];
  }
  const stable = `zexam:${q.id}`;
  const ex = baseExercise(ctx, { id: `${stable}:ordering`, type: "ordering", stableIds: [stable], prompt: promptOf(ctx, { withLabeled: false }) });
  ex.orderingItems = items.map((it, i) => ({ id: `item-${i}`, label: it.label, text: displayText(it.text) }));
  ex.correctOrder = order.map((l) => `item-${items.indexOf(byLabel.get(l))}`);
  ex.orderingMeta = { pieceSplit: "labeled-statements" };
  return [ex];
}

function recallExercises(ctx, diag) {
  const q = ctx.q;
  const slots = slotsOf(q);
  if (slots.length !== 1) {
    diag.push({ reason: "write-text-slot-count", question: q.id, slots: slots.length });
    return [];
  }
  const stable = `zexam:${q.id}`;
  const ex = baseExercise(ctx, { id: `${stable}:recall`, type: "recall_text", stableIds: [stable], prompt: promptOf(ctx) });
  const s = slots[0];
  ex.expectedAnswer = [{ answerText: rawSpan(s.lines.map((l) => displayText(l.text)).join(""), sourceOf(s), q.id) }];
  return [ex];
}

function sourceOf(slot) {
  const s = slot.sources[0];
  return { doc: s.doc, page: s.page, row: s.row };
}

/** 空欄つきの本文（教材の本文の①… か、答案用紙の定型の文）と、各空欄の答え → multi_blank。 */
function termsExercises(ctx, diag) {
  const q = ctx.q;
  const slots = slotsOf(q);
  const labels = slotLabels(q);
  const stableBase = `zexam:${q.id}`;
  const units = slots.map((s, i) => ({ label: labels[i] ?? null, slot: s, id: `${stableBase}:slot-${labels[i] ?? i + 1}` }));
  if (new Set(units.map((u) => u.id)).size !== units.length) {
    diag.push({ reason: "terms-duplicate-slot", question: q.id });
    return [];
  }
  const circled = units.every((u) => u.label && CIRCLED.includes(u.label));
  const passageOwner = circled ? [...ctx.chain].reverse().find((n) => units.every((u) => n.blankLabels?.includes(u.label))) : null;
  let segments;
  let bodyText;
  let bodySource;
  if (passageOwner) {
    // 教材の本文の空欄（①…）にそのまま答えを入れる
    const text = joinRows(passageOwner.passage);
    segments = [];
    let rest = text;
    for (const u of units) {
      const re = new RegExp(`[\\s\\u3000]*${u.label}[\\s\\u3000]*`);
      const m = rest.match(re);
      if (!m) {
        diag.push({ reason: "terms-blank-not-in-passage", question: q.id, label: u.label });
        return [];
      }
      segments.push({ type: "text", text: rest.slice(0, m.index) + " " });
      segments.push({ type: "blank", blankId: u.id, label: u.label, blankUnitId: u.id, order: segments.filter((s) => s.type === "blank").length + 1 });
      rest = " " + rest.slice(m.index + m[0].length);
    }
    segments.push({ type: "text", text: rest });
    bodyText = text;
    bodySource = passageOwner.passage[0]?.source;
  } else {
    // 答案用紙の定型の文（「甲とは、[　]をいう。」「Ａ[　] Ｂ[　]」）に答えを入れる
    segments = [];
    let n = 0;
    const answerSegs = q.answer.segments;
    answerSegs.forEach((seg, k) => {
      if (seg.type === "break") {
        segments.push({ type: "text", text: "\n" });
        return;
      }
      if (seg.type === "text") {
        // 欄の名前（Ａ・名称など）は空欄の札として出るので、本文としては重ねて出さない
        const next = answerSegs.slice(k + 1).find((x) => x.type !== "break");
        if (next?.type === "slot" && next.label && next.label === displayText(seg.text)) return;
        segments.push({ type: "text", text: displayText(seg.text) });
        return;
      }
      const u = units[n++];
      segments.push({ type: "blank", blankId: u.id, label: u.label ?? String(n), blankUnitId: u.id, order: n });
    });
    bodyText = segments.map((s) => (s.type === "blank" ? ` ${s.label} ` : s.text)).join("");
    bodySource = q.answer.heading.source;
  }
  // 指示欄には問・小問の指示文を出す。空欄つきで本文欄に出す本文（passageOwner の本文）は重ねて出さない
  const shownInBody = new Set((passageOwner?.passage ?? []).map((r) => r.source));
  const intro = joinRows(contextRows(ctx.chain).filter((r) => !shownInBody.has(r.source)));
  const ex = baseExercise(ctx, {
    id: `${stableBase}:multi`,
    type: "multi_blank",
    stableIds: units.map((u) => u.id),
    body: rawSpan(bodyText, bodySource, q.id),
    instructionRaw: rawSpan(intro, q.instruction[0]?.source, q.id),
  });
  ex.structureType = "shared_body_blanks";
  ex.answerForm = "blank";
  ex.bodySegments = segments;
  ex.expectedAnswer = units.map((u) => ({
    blankUnitId: u.id,
    sourceItemId: q.id,
    stableItemId: u.id,
    answerText: rawSpan(displayText(u.slot.text), sourceOf(u.slot), q.id),
  }));
  ex.multiBlankMeta = { bodyFrom: passageOwner ? "problem-passage" : "answer-sheet-template" };
  return [ex];
}
