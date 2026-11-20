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
//   1つの文の正誤    → true_false（解答の正誤欄の〇×と理由欄）

import { CIRCLED, parseWordBankLine } from "../exam/patterns.mjs";

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
function contextRows(chain, { withLabeled = true, withOwnPassage = true, withOptions = false } = {}) {
  const rows = [];
  chain.forEach((n, i) => {
    if (n.kind === "daimon") return;
    const own = i === chain.length - 1;
    // 節の境目（指示文・本文・記号つきの文）では必ず段落を改める（joinRows が見る印）
    const mark = (rs) => rs.map((r, k) => (k === 0 ? { ...r, paragraphStart: true } : r));
    rows.push(...mark(n.instruction.filter((r) => displayText(r.text))));
    if (withLabeled) for (const l of n.labeledItems) rows.push(...mark(l.rows));
    if (!own || withOwnPassage) rows.push(...mark(n.passage));
    if (withOptions) for (const o of n.options) rows.push(...mark(o.rows));
    if (withOptions && n.wordBank) rows.push(...mark(n.wordBank.rows));
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

// 金額・数量の答え「5,500 千円」「△100」「0」
const AMOUNT = /^[△▲]?[\d０-９][\d０-９,，.．]*[\s　]*(千円|円|百万円|%|％)?$/;

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
    // 指示文に「計算」とは書いていなくても、答えに金額がある問いは計算の問い（語句の穴埋めにはしない）
    else if (q.answer.segments.some((s) => s.type === "slot" && AMOUNT.test(s.text.trim()))) diag.push({ reason: "calculation-not-yet", question: q.id, forms, evidence: "amount-in-answer" });
    else if (slotsOf(q).length === 1 && slotsOf(q)[0].evidence === "circled-in-answer") out.push(...circledChoiceExercises(ctx, diag));
    else if (forms.includes("judge_statement")) out.push(...judgeStatementExercises(ctx, diag));
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
  // 【語群】の見出しが無く、選択肢が1行に1つずつ並ぶ教材 → その選択肢を語群として使う
  const opts = optionsOf(chain);
  if (opts.length) return { entries: opts.map((o) => ({ symbol: o.symbol, text: o.text, source: o.rows[0].source })), fromOptions: true };
  // 見出しも無く、本文の中に「ア 管理 イ 享受 ウ 行使 …」の行がある（「次の語句から選び」）
  for (let i = chain.length - 1; i >= 0; i--) {
    const entries = (chain[i].passage ?? []).flatMap((r) => {
      const e = parseWordBankLine(r.text);
      return e && e.length >= 2 ? e.map((x) => ({ ...x, source: r.source })) : [];
    });
    if (entries.length >= 2 && new Set(entries.map((e) => e.symbol)).size === entries.length) return { entries, fromPassage: true };
  }
  return null;
}

/** 選択肢（ア…・イロハ…）。無ければ【選択肢】【語群】の語、記号つきの文（Ａ…）。小問に無ければ上の節のもの。 */
function optionsOf(chain) {
  for (let i = chain.length - 1; i >= 0; i--) if (chain[i].options?.length) return chain[i].options;
  for (let i = chain.length - 1; i >= 0; i--)
    if (chain[i].wordBank?.entries.length)
      return chain[i].wordBank.entries.map((e) => ({ symbol: e.symbol, text: e.text, rows: [{ text: e.text, source: e.source }], fromWordBank: true }));
  for (let i = chain.length - 1; i >= 0; i--)
    if (chain[i].labeledItems?.length) return chain[i].labeledItems.map((l) => ({ symbol: l.label, text: l.text, rows: l.rows, fromLabeled: true }));
  return [];
}

function wordBankExercises(ctx, diag, wb = findWordBank(ctx.chain)) {
  if (!wb) {
    diag.push({ reason: "word-bank-not-found", question: ctx.q.id });
    return [];
  }
  const symbols = new Set(wb.entries.map((e) => e.symbol));
  const options = wb.entries.map((e) => ({ value: e.symbol, label: `${e.symbol} ${displayText(e.text)}` }));
  const slots = slotsOf(ctx.q);
  const labels = slotLabels(ctx.q);
  let picks = slots.map((slot, i) => ({ label: labels[i] ?? null, answer: displayText(slot.text), source: slot.sources[0] }));
  if (picks.some((p) => !symbols.has(p.answer))) {
    // 解答の欄の名前と記号が答案用紙の枠とずれて、「①オ ②エ」「イＣ ロＩ」と1つの欄に読めたとき → 空欄の名前と記号の組に分ける
    const pairs = labelSymbolPairs(ctx.q, symbols);
    if (pairs) picks = pairs;
    else if (slots.length === 1 && splitSymbols(slots[0].text).every((x) => symbols.has(x))) {
      // 「２つ選び」で答えが「ウ、オ」→ 語群つきの問いと答えの記号の暗記カード
      return chooseAsRecall(ctx, diag, "word-bank-answer-many");
    }
  }
  const prompt = promptOf(ctx);
  const out = [];
  picks.forEach((p, i) => {
    if (!symbols.has(p.answer)) {
      diag.push({ reason: "word-bank-answer-not-in-bank", question: ctx.q.id, slot: i });
      return;
    }
    const tag = p.label ?? String(i + 1);
    const stable = `zexam:${ctx.q.id}:slot-${tag}`;
    const ex = baseExercise(ctx, {
      id: `${stable}:choice`,
      type: "choice_item",
      stableIds: [stable],
      prompt: { ...prompt, text: `${prompt.text}\n空欄 ${p.label ?? ""}`.trimEnd() },
    });
    ex.choiceOptions = options;
    ex.correctChoice = p.answer;
    ex.choiceMeta = { kind: "word-bank", blank: p.label, answerSource: p.source };
    out.push(ex);
  });
  return out;
}

function splitSymbols(text) {
  return displayText(text).split(/[、,，\s]+/).filter(Boolean);
}

/**
 * 解答の単位の文字（定型の文も答えも）をつないで、「空欄の名前＋記号」の組の並びとして読めれば、その組を返す。
 * 空欄の名前は丸数字か、語群の記号に無いかな（「空欄イ～ヘ」に記号Ａ～Ｊで答える教材）。全体が組の並びでなければ null。
 */
function labelSymbolPairs(q, symbols) {
  const segs = q.answer.segments.filter((s) => s.type !== "break");
  const text = segs.map((s) => s.text).join("").replace(/[\s　]+/g, "");
  const out = [];
  for (let i = 0; i < text.length; i += 2) {
    const label = text[i];
    const symbol = text[i + 1];
    const isLabel = CIRCLED.includes(label) || (/[ア-ンぁ-ん]/.test(label) && !symbols.has(label));
    if (!isLabel || !symbols.has(symbol)) return null;
    out.push({ label, answer: symbol, source: segs.find((s) => s.type === "slot")?.sources[0] ?? null });
  }
  if (out.length < 2 || new Set(out.map((p) => p.label)).size !== out.length) return null;
  return out;
}

function chooseOneExercises(ctx, diag) {
  const q = ctx.q;
  const slots = slotsOf(q);
  const answer = slots.length === 1 ? displayText(slots[0].text).trim() : null;
  const options = optionsOf(ctx.chain);
  const symbols = new Set(options.map((o) => o.symbol));
  // 「表の①～⑥に当てはまるものを【選択肢】から選び」: 欄ごとに記号が1つ → 欄ごとの選択問題
  if (slots.length > 1 && slots.every((s) => symbols.has(displayText(s.text)))) {
    return wordBankExercises(ctx, diag, { entries: options.map((o) => ({ symbol: o.symbol, text: o.text, source: o.rows[0].source })) });
  }
  if (!options.length || !answer || !options.some((o) => o.symbol === answer)) {
    // 答えが記号2つ以上（「２つ」と書いていない複数選択）・記号と説明の両方を答える など → 選択肢を見せて答える暗記カード
    if (options.length && slots.length) return chooseAsRecall(ctx, diag, "choose-one-answer-shape");
    diag.push({ reason: "choose-one-answer-not-in-options", question: q.id });
    return [];
  }
  const stable = `zexam:${q.id}`;
  const ex = baseExercise(ctx, { id: `${stable}:choice`, type: "choice_item", stableIds: [stable], prompt: promptOf(ctx, { withLabeled: !options[0].fromLabeled }) });
  ex.choiceOptions = options.map((o) => ({ value: o.symbol, label: `${o.symbol} ${displayText(o.text)}` }));
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
  if ((count !== "all" && answers.length !== count) || (!negative && !positive) || !q.options.length) {
    // 〇×に分けられない（「該当するもの」「特徴」など向きの言葉が無い・選択肢が上の節にある）→ 選択肢を見せて答える暗記カード
    return chooseAsRecall(ctx, diag, "choose-many-answer-shape");
  }
  // 解答への道の〇×と、解答の記号が食い違わないことを確かめる（食い違えば〇×は作らない）
  const picked = q.options.filter((o) => judgements.get(o.symbol)?.mark === (negative ? "×" : "○")).map((o) => o.symbol);
  if (q.options.some((o) => !judgements.has(o.symbol)) || picked.join() !== [...answers].sort((a, b) => a.localeCompare(b)).join()) {
    return chooseAsRecall(ctx, diag, "choose-many-judgements-mismatch");
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

/** 選ぶ問いを、選択肢つきの問いと解答の記号の暗記カードにする（選択式・〇×にできないとき）。理由は diagnostics に残す。 */
function chooseAsRecall(ctx, diag, reason) {
  const q = ctx.q;
  const slots = slotsOf(q);
  if (slots.length === 0) {
    diag.push({ reason, question: q.id });
    return [];
  }
  diag.push({ reason, question: q.id, builtAs: "recall_text" });
  const stable = `zexam:${q.id}`;
  const ex = baseExercise(ctx, { id: `${stable}:recall`, type: "recall_text", stableIds: [stable], prompt: promptOf(ctx, { withOptions: true }) });
  const text = slots.length === 1 ? singleSlotAnswer(slots[0]) : answerWithTemplate(q.answer.segments);
  ex.expectedAnswer = [{ answerText: rawSpan(text, sourceOf(slots[0]), q.id) }];
  ex.recallMeta = { derivedFrom: "choose-options" };
  return [ex];
}

function recallExercises(ctx, diag) {
  const q = ctx.q;
  const slots = slotsOf(q);
  if (slots.length === 0) {
    diag.push({ reason: "write-text-slot-count", question: q.id, slots: 0 });
    return [];
  }
  const stable = `zexam:${q.id}`;
  const ex = baseExercise(ctx, { id: `${stable}:recall`, type: "recall_text", stableIds: [stable], prompt: promptOf(ctx) });
  const s = slots[0];
  // 欄が2つ以上（「名称」「目的」など）→ 答案用紙の欄の名前も含めて、解答の並びのまま1つの模範解答にする
  const text = slots.length === 1 ? singleSlotAnswer(s) : answerWithTemplate(q.answer.segments);
  ex.expectedAnswer = [{ answerText: rawSpan(text, sourceOf(s), q.id) }];
  return [ex];
}

/** 「いずれかを〇で囲みなさい」→ 〇で囲む候補の語から選ぶ choice_item。 */
function circledChoiceExercises(ctx, diag) {
  const q = ctx.q;
  const slot = slotsOf(q)[0];
  const candidates = [...new Set(slot.candidates ?? [])];
  if (candidates.length < 2 || !candidates.includes(slot.text)) {
    diag.push({ reason: "circled-answer-shape", question: q.id });
    return [];
  }
  const stable = `zexam:${q.id}`;
  const ex = baseExercise(ctx, { id: `${stable}:choice`, type: "choice_item", stableIds: [stable], prompt: promptOf(ctx) });
  ex.choiceOptions = candidates.map((c) => ({ value: c, label: c }));
  ex.correctChoice = slot.text;
  ex.choiceMeta = { kind: "circled", answerSource: slot.sources[0] };
  return [ex];
}

/**
 * 答えの欄が「記号欄 理由欄」「正誤欄 理由欄」と横に並ぶ解答: 1行目が欄の名前だけで、記号はほかの行の中に1文字だけ離れて書かれている。
 * → 「記号欄 Ａ」「理由欄 …」に並べ直す。この形でなければ null。
 */
export function columnAnswer(lines) {
  const header = (lines[0] ?? "").trim().split(/[\s　]+/);
  if (header.length !== 2 || !header.every((h) => /^\S{1,4}欄$/.test(h))) return null;
  const rest = lines.slice(1);
  const marks = rest.flatMap((l) => [...l.matchAll(/(?:^|[\s　])([Ａ-Ｚア-ン〇○×])(?=[\s　]|$)/g)].map((m) => m[1]));
  if (marks.length !== 1) return null;
  const reason = rest.map((l) => l.replace(/(^|[\s　])[Ａ-Ｚア-ン〇○×](?=[\s　]|$)/, "$1").trim()).join("");
  return `${header[0]} ${marks[0]}\n${header[1]} ${displayText(reason)}`;
}

/**
 * 1つの文の正誤（「正しければ正誤欄に〇、間違っていれば×と理由」）→ true_false。
 * 解答の欄から、ひとつだけ離れて書かれた 〇/× を正誤、残りを理由とする（「正誤欄」「理由欄」の札は除く）。
 */
function judgeStatementExercises(ctx, diag) {
  const q = ctx.q;
  const slots = slotsOf(q);
  const lines = slots.flatMap((s) => s.lines.map((l) => l.text));
  const marks = lines.flatMap((l) => [...l.matchAll(/(?:^|[\s　])([〇○×])(?=[\s　]|$)/g)].map((m) => m[1]));
  if (!q.passage.length || marks.length !== 1) {
    diag.push({ reason: "judge-statement-answer-shape", question: q.id, marks: marks.length });
    return [];
  }
  const reason = lines
    .map((l) => l.replace(/(^|[\s　])[〇○×](?=[\s　]|$)/, "$1").replace(/正誤欄|理由欄/g, "").trim())
    .join("");
  const stable = `zexam:${q.id}`;
  const ex = baseExercise(ctx, {
    id: `${stable}:tf`,
    type: "true_false",
    stableIds: [stable],
    body: rawSpan(joinRows(q.passage), q.passage[0].source, q.id),
    instructionRaw: rawSpan(joinRows(contextRows(ctx.chain, { withOwnPassage: false })), q.instruction[0]?.source, q.id),
  });
  const mark = marks[0] === "×" ? "×" : "○";
  ex.judgement = { symbolRaw: rawSpan(mark, slots[0].sources[0], q.id), answerBodyRaw: reason ? rawSpan(displayText(reason), slots[0].sources[0], q.id) : null };
  ex.explanation = reason ? { raw: rawSpan(displayText(reason), slots[0].sources[0], q.id), role: null } : null;
  ex.trueFalseMeta = { derivedFrom: "judge-statement", markRaw: marks[0] };
  return [ex];
}

function singleSlotAnswer(slot) {
  return columnAnswer(slot.lines.map((l) => l.text)) ?? slot.lines.map((l) => displayText(l.text)).join("");
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
    // 空欄は本文に出てくる順に置く（表では「⑧」が「⑦」より先に出ることがある）
    const found = [];
    for (const u of units) {
      const m = text.match(new RegExp(`[\\s\\u3000]*${u.label}[\\s\\u3000]*`));
      if (!m) {
        diag.push({ reason: "terms-blank-not-in-passage", question: q.id, label: u.label });
        return [];
      }
      found.push({ u, start: m.index, end: m.index + m[0].length });
    }
    found.sort((a, b) => a.start - b.start);
    segments = [];
    let pos = 0;
    for (const f of found) {
      segments.push({ type: "text", text: (pos ? " " : "") + text.slice(pos, f.start) + " " });
      segments.push({ type: "blank", blankId: f.u.id, label: f.u.label, blankUnitId: f.u.id, order: segments.filter((s) => s.type === "blank").length + 1 });
      pos = f.end;
    }
    segments.push({ type: "text", text: " " + text.slice(pos) });
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

/** 解答の単位の並び（定型の文・答え・改行）→ 1つの文。欄の名前と答えのあいだは「 」、行は改行でつなぐ。 */
function answerWithTemplate(segments) {
  const lines = [[]];
  for (const seg of segments) {
    if (seg.type === "break") lines.push([]);
    else if (seg.type === "slot") lines.at(-1).push(seg.lines.map((l) => displayText(l.text)).join(""));
    else if (seg.text.trim()) lines.at(-1).push(displayText(seg.text).trim());
  }
  return lines
    .map((l) => l.join(" ").trim())
    .filter(Boolean)
    .join("\n");
}
