// 第2層: 教材構造 → 学習アプリ（../html-v2）の Exercise View JSON。
//
// 今回作る問題（ユーザーの選択、2026-11-16「暗記と〇×から」）:
//   - true_false  … トレーニングの〇×の多問（(1)〜(n) の各取引を1問ずつ）
//   - recall_text … 理論マスターの条文を (1)(2) ごとに1枚の暗記カード（見出し → 本文を思い出す）
//                   と、トレーニングの「述べなさい」の問題
// それ以外（計算・3区分以上の振り分け・選ぶ・空欄）は今回は作らず、件数だけを diagnostics に残す。
//
// 原文は書き換えない。表示用の飾り（小さい字・点線枠・分数）は answerRich / guidanceRich に
// 教材構造の segments をそのまま渡す。プレーンな文字列（answerText 等）は行の text をつないだもの。

import { buildCalculationSteps } from "./calculation.mjs";
import { layoutReadingLines } from "./readingLayout.mjs";
import { categoryLegend, parseGroupedAnswer, parseSelectedAnswer, parseInlineValueAnswers } from "./choiceItems.mjs";
import { removeAlignmentSpaces, removeAlignmentSpacesMultiline, removeAlignmentSpacesInSegments, replaceFontSymbolsDeep } from "./displayText.mjs";

const SCHEMA_VERSION = "exercise-view-schema-v1.8.0";
const SUBJECT = "shohizei";

// 問題データの文字は、位置合わせの空白を消したもの（displayText.mjs）。原文は教材構造に残っている。
function rawSpan(text, source, nodeId) {
  return {
    text: removeAlignmentSpacesMultiline(text),
    source: source ? { documentId: source.doc, locator: `p.${source.page} line ${source.line}` } : null,
    bsmNodeId: nodeId ?? null,
    inherited: false,
  };
}

function structureNode(id, title) {
  return { structureNodeId: id, titleRaw: rawSpan(title, null, id) };
}

function richLine(line, depth = 0) {
  return {
    segments: removeAlignmentSpacesInSegments(line.segments ?? [{ kind: "text", text: line.text }]),
    frame: line.visual?.frame ?? "none",
    depth,
  };
}

function baseExercise({ id, type, stableId, structure, structurePath, prompt, instructionRaw, provenance }) {
  return {
    exerciseId: id,
    exerciseType: type,
    sourceBookStructureIds: [],
    sourceItemIds: [stableId],
    stableItemIds: [stableId],
    contentFingerprints: [],
    prompt,
    body: null,
    choices: null,
    expectedAnswer: [],
    judgement: null,
    explanation: null,
    answerForm: null,
    withheldAnswerContent: null,
    structureType: null,
    subQuestions: null,
    bodySegments: null,
    structurePath,
    structure,
    instructionRaw,
    generationRule: null,
    eligibility: "eligible",
    ineligibilityReasons: [],
    provenance,
    reviewOverride: null,
  };
}

// ---- トレーニング ----

/** 問題文の (n) の行と、その折り返しの行をまとめる。【 】の小見出しは各問の前置きとして持つ。 */
function questionItems(problem) {
  const items = new Map();
  let groupHeading = null;
  let current = null;
  for (const l of problem.question.lines) {
    if (l.marker?.kind === "bracket-heading") {
      groupHeading = l;
      current = null;
      continue;
    }
    const m = l.marker?.kind === "paren-number" ? l.marker.raw.match(/[0-9０-９]+/) : null;
    if (m) {
      const no = Number(m[0].replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)));
      current = { no, lines: [l], groupHeading };
      items.set(no, current);
    } else if (current) current.lines.push(l);
  }
  return items;
}

const toHalf = (t) => t.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

/**
 * 解答の〇×を問題番号ごとに集める。教材には2つの書き方がある:
 *   1) 1問1行: 「(n)  ○」「(n)  × 理由…」（理由は次の行へ折り返すことがある）
 *   2) まとめ書き: 「○ …… (1)、(4)、…」「× …… (2)、(3)、…」（番号の並びは次の行へ続くことがある）
 *   3) 表: 「(1) (2) … (10)」の行のすぐ下に「× ○ …」の行（真下の記号がその番号の答え）。
 *      表の後ろに「(1) …」で始まる説明があれば、その番号の理由にする
 * 同じ番号が○にも×にも出る場合は、その番号を使わない（diag に残す）。
 */
function answerJudgements(problem, diag) {
  const out = new Map();
  let current = null;
  for (const l of problem.answer.lines) {
    if (l.judgement) {
      current = { judgement: l.judgement, lines: [l] };
      out.set(l.judgement.itemNo, current);
    } else if (current && !l.marker) current.lines.push(l);
    else current = null;
  }
  if (out.size > 0) return out;

  const table = tableJudgements(problem.answer.lines);
  if (table.size > 0) return table;

  const grouped = new Map();
  let symbol = null;
  for (const l of problem.answer.lines) {
    const t = l.text.trim();
    const head = t.match(/^([○〇×])\s*[…‥・.\s]+(.*)$/);
    let listText;
    if (head) {
      symbol = head[1] === "〇" ? "○" : head[1];
      listText = head[2];
    } else if (symbol && /^[（(][0-9０-９]+[）)]/.test(t)) listText = t;
    else {
      symbol = null;
      continue;
    }
    for (const m of listText.matchAll(/[（(]\s*([0-9０-９]+)\s*[）)]/g)) {
      const no = Number(toHalf(m[1]));
      if (grouped.has(no) && grouped.get(no).judgement.symbol !== symbol) {
        grouped.get(no).conflict = true;
        continue;
      }
      grouped.set(no, { judgement: { itemNo: no, symbol, symbolRaw: symbol, reasonRaw: null }, lines: [l], grouped: true });
    }
  }
  for (const [no, v] of grouped) {
    if (v.conflict) {
      diag.push({ reason: "true-false-grouped-conflict", problem: problem.parsed.no, item: no });
      grouped.delete(no);
    }
  }
  return grouped;
}

const ITEM_NO_ONLY = /^[（(]\s*([0-9０-９]+)\s*[）)]$/;
const MARK_ONLY = /^[○〇×]$/;

/** 3) 表の形の〇×（番号の行と、その真下の記号の行）。表が無ければ空の Map。 */
function tableJudgements(lines) {
  const bboxOf = (l) => l.source?.bbox ?? l.bbox;
  // 同じ高さ（上端の差が2pt以内）の行を1段にまとめる
  const tiers = [];
  for (const l of lines) {
    const b = bboxOf(l);
    if (!b) return new Map();
    const t = tiers.at(-1);
    if (t && Math.abs(bboxOf(t[0])[1] - b[1]) <= 2) t.push(l);
    else tiers.push([l]);
  }
  const out = new Map();
  let lastTableTier = -1;
  for (let i = 0; i + 1 < tiers.length; i++) {
    const nos = tiers[i];
    const marks = tiers[i + 1];
    if (!nos.every((l) => ITEM_NO_ONLY.test(l.text.trim())) || !marks.every((l) => MARK_ONLY.test(l.text.trim()))) continue;
    for (const m of marks) {
      const mb = bboxOf(m);
      const mc = (mb[0] + mb[2]) / 2;
      const hit = nos.filter((n) => {
        const nb = bboxOf(n);
        return Math.abs((nb[0] + nb[2]) / 2 - mc) <= Math.max(8, (nb[2] - nb[0]) / 2);
      });
      if (hit.length !== 1) continue;
      const no = Number(toHalf(hit[0].text.trim().match(ITEM_NO_ONLY)[1]));
      const symbol = m.text.trim() === "〇" ? "○" : m.text.trim();
      out.set(no, { judgement: { itemNo: no, symbol, symbolRaw: m.text.trim(), reasonRaw: null }, lines: [m], grouped: true });
    }
    lastTableTier = i + 1;
  }
  if (!out.size) return out;
  // 表の後ろの説明「(1) 個人事業者が…」（次の「(n)」の行までが1つの理由）。
  // 番号は小さい順にだけ進み、「◆」で始まる参考（条文の抜き書き）に入ったら終わり
  let current = null;
  let lastNo = 0;
  for (const l of tiers.slice(lastTableTier + 1).flat()) {
    const t = l.text.trim();
    if (/^◆/.test(t)) break;
    const m = t.match(/^[（(]\s*([0-9０-９]+)\s*[）)]\s*(.+)$/);
    const no = m ? Number(toHalf(m[1])) : null;
    if (m && out.has(no) && no > lastNo) {
      current = out.get(no);
      current.reasonText = m[2];
      lastNo = no;
      continue;
    }
    if (m && no <= lastNo) break;
    if (current) current.reasonText += t;
  }
  return out;
}

function trainingExercises(structure, diag, bookTitles) {
  const bookId = structure.meta.bookId;
  const allProblems = structure.children.flatMap((s) => s.children);
  setRightEdgesFromLines(allProblems.flatMap((p) => [...(p.question?.lines ?? []), ...(p.answer?.lines ?? []), ...(p.guidance?.lines ?? [])]));
  const bookTitle = bookTitles[bookId] ?? bookId;
  const exercises = [];
  const provenance = { generator: "shohizei-exercise-view-0.1", sourceKind: "shohizei_training_structure", bookId };
  for (const session of structure.children) {
    const sessionTitle = session.raw ?? "（回の見出しなし）";
    for (const p of session.children) {
      const forms = p.question?.formCandidates.map((f) => f.form) ?? [];
      // 〇×の指示でも、解答に3つ目の記号（△ など）が出てくるものは振り分けとして扱う
      if (forms.includes("true_false_set") && p.answer && parseGroupedAnswer(p.answer.lines).symbols.length >= 3) {
        forms.splice(forms.indexOf("true_false_set"), 1, "classify_items");
      }
      const theme = structureNode(`${bookId}`, bookTitle);
      const section = structureNode(`${bookId}:session-${session.parsed.no}`, sessionTitle);
      const topic = structureNode(p.stableId, `問題${p.parsed.no} ${p.parsed.titleRaw}`);
      const structureRef = { theme, section, topic };
      const path = [theme, section, topic].map((n) => n.structureNodeId);
      const guidanceRich = p.guidance ? richLines(p.guidance.lines) : null;
      const instructionRaw = p.question?.instructionRaw ? rawSpan(p.question.instructionRaw.replace(/\s*\n\s*/g, ""), p.source[1], p.id) : null;

      if (forms.includes("true_false_set")) {
        const items = questionItems(p);
        const answers = answerJudgements(p, diag);
        let made = 0;
        for (const [no, item] of items) {
          const a = answers.get(no);
          if (!a) {
            diag.push({ reason: "true-false-answer-not-found", problem: p.parsed.no, item: no });
            continue;
          }
          const bodyText = item.lines.map((l) => l.text.trim()).join("");
          const ex = baseExercise({
            id: `${p.stableId}:tf-${no}`,
            type: "true_false",
            stableId: `${p.stableId}:item-${no}`,
            structure: structureRef,
            structurePath: path,
            prompt: rawSpan((item.groupHeading ? item.groupHeading.text.trim() + "\n" : "") + bodyText, item.lines[0].source, p.id),
            instructionRaw,
            provenance,
          });
          ex.judgement = {
            symbolRaw: rawSpan(a.judgement.symbol, a.lines[0].source, p.id),
            answerBodyRaw: rawSpan(a.grouped ? a.judgement.symbol : a.lines.map((l) => l.text.trim()).join(""), a.lines[0].source, p.id),
          };
          const reason = a.reasonText ?? (a.grouped ? "" : [a.judgement.reasonRaw, ...a.lines.slice(1).map((l) => l.text.trim())].filter(Boolean).join(""));
          ex.explanation = reason ? { raw: rawSpan(reason, a.lines[0].source, p.id), role: "reason" } : null;
          ex.guidanceRich = guidanceRich;
          exercises.push(ex);
          made += 1;
        }
        if (made === 0) diag.push({ reason: "true-false-no-items", problem: p.parsed.no });
        continue;
      }

      // 問い方が分からない（指示文の言い回しで決まらない）問題は、解答の形から順に当てはめる:
      // 記号ごとの番号の並び → 取引ごとの短い文（事業区分など） → 計算・判定の段階 → 自己採点の暗記カード
      const HANDLED = ["true_false_set", "classify_items", "select_applicable", "statement_recall", "calculation"];
      const isFallback = !forms.some((f) => HANDLED.includes(f));
      const items = questionItems(p);
      const groupedFallback = isFallback && p.answer ? parseGroupedAnswer(p.answer.lines) : null;
      const groupedCovers = groupedFallback && items.size > 0 && [...items.keys()].filter((no) => groupedFallback.answerOf.has(no)).length >= items.size * 0.8;
      const inlineFallback = isFallback && p.answer && !groupedCovers ? parseInlineValueAnswers(p.answer.lines) : null;
      const inlineCovers =
        inlineFallback && items.size >= 3 && [...items.keys()].filter((no) => inlineFallback.has(no)).length >= items.size * 0.8 && new Set(inlineFallback.values()).size <= 8;

      if (inlineCovers) {
        // 事業区分など: 解答に出てくる答えの文を選択肢にする（第一種〜第六種は番号の順）
        const order = (v) => {
          const k = "一二三四五六".indexOf((v.match(/第([一二三四五六])種/) ?? [])[1]);
          return k === -1 ? 99 : k;
        };
        const values = [...new Set([...items.keys()].map((no) => inlineFallback.get(no)).filter(Boolean))].sort((a, b) => order(a) - order(b));
        let made = 0;
        for (const [no, item] of items) {
          const correct = inlineFallback.get(no);
          if (!correct) {
            diag.push({ reason: "choice-item-answer-not-found", problem: p.parsed.no, item: no });
            continue;
          }
          const ex = baseExercise({
            id: `${p.stableId}:choice-${no}`,
            type: "choice_item",
            stableId: `${p.stableId}:item-${no}`,
            structure: structureRef,
            structurePath: path,
            prompt: rawSpan((item.groupHeading ? item.groupHeading.text.trim() + "\n" : "") + item.lines.map((l) => l.text.trim()).join(""), item.lines[0].source, p.id),
            instructionRaw,
            provenance,
          });
          ex.choiceOptions = values.map((v) => ({ value: v, label: v }));
          ex.correctChoice = correct;
          ex.guidanceRich = guidanceRich;
          ex.choiceMeta = { kind: "inline-answer" };
          exercises.push(ex);
          made += 1;
        }
        if (made > 0) continue;
      }

      if (((forms.includes("classify_items") || forms.includes("select_applicable")) || groupedCovers) && p.answer) {
        const isClassify = forms.includes("classify_items") || groupedCovers;
        let choices;
        let answerOf;
        if (isClassify) {
          const parsed = parseGroupedAnswer(p.answer.lines);
          const legend = new Map([...categoryLegend(p.question.instructionRaw ?? ""), ...parsed.legend]);
          for (const no of parsed.conflicts) diag.push({ reason: "choice-item-conflict", problem: p.parsed.no, item: no });
          const symbols = [...new Set([...legend.keys(), ...parsed.symbols])];
          choices = symbols.map((sym) => ({ value: sym, label: legend.has(sym) ? `${sym} ${legend.get(sym)}` : sym }));
          answerOf = (no) => (parsed.conflicts.has(no) ? null : parsed.answerOf.get(no) ?? null);
        } else {
          const selected = parseSelectedAnswer(p.answer.lines);
          if (selected.size === 0) {
            diag.push({ reason: "select-answer-not-found", problem: p.parsed.no });
            continue;
          }
          choices = [
            { value: "yes", label: "該当する" },
            { value: "no", label: "該当しない" },
          ];
          answerOf = (no) => (selected.has(no) ? "yes" : "no");
        }
        let made = 0;
        for (const [no, item] of items) {
          const correct = answerOf(no);
          if (!correct) {
            diag.push({ reason: "choice-item-answer-not-found", problem: p.parsed.no, item: no });
            continue;
          }
          const ex = baseExercise({
            id: `${p.stableId}:choice-${no}`,
            type: "choice_item",
            stableId: `${p.stableId}:item-${no}`,
            structure: structureRef,
            structurePath: path,
            prompt: rawSpan((item.groupHeading ? item.groupHeading.text.trim() + "\n" : "") + item.lines.map((l) => l.text.trim()).join(""), item.lines[0].source, p.id),
            instructionRaw,
            provenance,
          });
          ex.choiceOptions = choices;
          ex.correctChoice = correct;
          ex.guidanceRich = guidanceRich;
          ex.choiceMeta = { kind: isClassify ? "classify" : "select" };
          exercises.push(ex);
          made += 1;
        }
        if (made === 0) diag.push({ reason: "choice-item-no-items", problem: p.parsed.no });
        continue;
      }

      if (forms.includes("statement_recall") && p.answer) {
        const answerText = p.answer.lines.map((l) => l.text.trim()).join("\n");
        const ex = baseExercise({
          id: `${p.stableId}:recall`,
          type: "recall_text",
          stableId: p.stableId,
          structure: structureRef,
          structurePath: path,
          prompt: rawSpan(p.question.lines.map((l) => l.text.trim()).join("\n"), p.question.lines[0]?.source, p.id),
          instructionRaw: null,
          provenance,
        });
        ex.expectedAnswer = [{ answerText: rawSpan(answerText, p.answer.lines[0]?.source, p.id) }];
        ex.answerRich = richLines(p.answer.lines);
        ex.guidanceRich = guidanceRich;
        exercises.push(ex);
        continue;
      }

      if ((forms.includes("calculation") || isFallback) && p.answer) {
        const itemTexts = new Map([...questionItems(p)].map(([no, it]) => [no, it.lines.map((l) => l.text.trim()).join("")]));
        const steps = buildCalculationSteps(p.answer.lines, itemTexts);
        const graded = steps.filter((st) => st.expected || st.judgement?.options);
        if (graded.length === 0 && !isFallback) {
          diag.push({ reason: "calculation-no-gradable-step", problem: p.parsed.no });
          continue;
        }
        if (graded.length > 0) {
        for (const st of steps) if (!st.expected && !st.judgement?.options) diag.push({ reason: "calculation-step-not-graded", problem: p.parsed.no, step: st.labelRaw });
        const ex = baseExercise({
          id: `${p.stableId}:calc`,
          type: "calculation_steps",
          stableId: p.stableId,
          structure: structureRef,
          structurePath: path,
          prompt: rawSpan(p.question.lines.map((l) => l.text.trim()).join("\n"), p.question.lines[0]?.source, p.id),
          instructionRaw: null,
          provenance,
        });
        ex.promptRich = richLines(p.question.lines);
        ex.calculationSteps = steps.map((st) => ({
          groupLabel: st.groupLabel ? removeAlignmentSpaces(st.groupLabel) : null,
          labelRaw: st.labelRaw ? removeAlignmentSpaces(st.labelRaw) : null,
          expected: st.expected,
          answerTextRaw: st.answerTextRaw ? removeAlignmentSpaces(st.answerTextRaw) : null,
          judgement: st.judgement,
          workRich: richLines(st.workLines),
        }));
        ex.guidanceRich = guidanceRich;
        ex.calculationMeta = { timeRaw: p.parsed.timeRaw, levelRaw: p.parsed.levelRaw, hasSheet: p.parsed.hasSheet, fromForm: isFallback ? "fallback" : "calculation" };
        exercises.push(ex);
        continue;
        }
      }

      // 最後の受け皿: 問題文を見て解答を思い出す自己採点の暗記カード（日付で答える・文で答える など）
      if (isFallback && p.answer && p.answer.lines.length) {
        const ex = baseExercise({
          id: `${p.stableId}:recall`,
          type: "recall_text",
          stableId: p.stableId,
          structure: structureRef,
          structurePath: path,
          prompt: rawSpan(p.question.lines.map((l) => l.text.trim()).join("\n"), p.question.lines[0]?.source, p.id),
          instructionRaw: null,
          provenance,
        });
        ex.promptRich = richLines(p.question.lines);
        ex.expectedAnswer = [{ answerText: rawSpan(p.answer.lines.map((l) => l.text.trim()).join("\n"), p.answer.lines[0]?.source, p.id) }];
        ex.answerRich = richLines(p.answer.lines);
        ex.guidanceRich = guidanceRich;
        ex.recallMeta = { fromForm: "fallback", noOrdering: true };
        exercises.push(ex);
        continue;
      }

      diag.push({ reason: "form-not-converted-yet", problem: p.parsed.no, forms });
    }
  }
  return exercises;
}

// ---- 理論マスター ----

// PDFの行の折り返し: 前の行が版面の右端近くまで届いているときだけ、次の行をその続き
// （continues: true）とみなす。表示側はつなげて1段落にする（原文の行そのものは segments に残る）。
// 「① 定 義」のような短い見出し行の次の行はつなげない。
let rightEdgeByPage = new Map();
function setRightEdges(structure) {
  rightEdgeByPage = new Map();
  const visit = (n) => {
    for (const l of n.lines ?? []) {
      const k = `${l.source.doc}:${l.source.page}`;
      rightEdgeByPage.set(k, Math.max(rightEdgeByPage.get(k) ?? 0, l.source.bbox[2]));
    }
    for (const c of n.children ?? []) visit(c);
  };
  structure.children.forEach(visit);
}
function setRightEdgesFromLines(lines) {
  rightEdgeByPage = new Map();
  for (const l of lines) {
    const k = `${l.source.doc}:${l.source.page}`;
    rightEdgeByPage.set(k, Math.max(rightEdgeByPage.get(k) ?? 0, l.source.bbox[2]));
  }
}
/** 行の並びを表示用にする。行頭記号のある行は必ず新しい段落。 */
function richLines(lines, depth = 0) {
  return lines.map((l, i) => ({ ...richLine(l, depth), continues: !l.marker && continuesFrom(lines, i) }));
}
// 括弧が開いたまま行が終わっていれば、次の行はその続き（カッコ書きは字が小さく、右端まで
// 届かないまま折り返すことがあるため、右端の判定だけでは見分けられない）。
function parenDepthAfter(lines, upTo) {
  let depth = 0;
  for (let i = 0; i <= upTo; i++) {
    const text = (lines[i].segments ?? [{ text: lines[i].text }]).map((g) => g.text ?? "").join("") || lines[i].text;
    for (const ch of text) {
      if (ch === "（" || ch === "(") depth += 1;
      else if (ch === "）" || ch === ")") depth = Math.max(0, depth - 1);
    }
  }
  return depth;
}
function continuesFrom(lines, i) {
  if (i === 0) return false;
  return reachesRightEdge(lines[i - 1]) || parenDepthAfter(lines, i - 1) > 0;
}
function reachesRightEdge(line) {
  const edge = rightEdgeByPage.get(`${line.source.doc}:${line.source.page}`);
  return edge != null && line.source.bbox[2] >= edge - 12;
}

function collectLines(node, depth, out) {
  const lines = node.lines ?? [];
  lines.forEach((l, i) => out.push({ ...richLine(l, depth), continues: continuesFrom(lines, i) }));
  for (const c of node.children ?? []) collectLines(c, depth + 1, out);
  return out;
}

function theoryExercises(structure, diag) {
  const bookId = structure.meta.bookId;
  setRightEdges(structure);
  const exercises = [];
  const provenance = { generator: "shohizei-exercise-view-0.1", sourceKind: "shohizei_theory_structure", bookId };
  for (const theme of structure.children) {
    const themeTitle = `理論マスター テーマ${theme.parsed.no} ${theme.parsed.titleRaw ?? ""}`.trim();
    const themeNode = structureNode(theme.stableId, themeTitle);
    for (const theory of theme.children) {
      if (theory.kind !== "theory") continue;
      const theoryTitle = `${theory.parsed.codeRaw} ${theory.parsed.titleRaw}`;
      const sectionNode = structureNode(theory.stableId, theoryTitle);
      theory.children.forEach((heading, hi) => {
        if (heading.kind === "supplement") {
          // 参考・プラスα も暗記カードにする（ユーザー「全部進めていきましょう」、2026-11-17）。
          // 題名が「⇒…」で始まるものは中身の続きなので答えに入れ、問いは「理論 › 参考」だけにする。
          // 「重要度○」だけの行は答えに入れない。
          const sup = heading;
          const titleIsContent = sup.parsed.titleRaw && /^⇒/.test(sup.parsed.titleRaw);
          const supLines = (sup.lines ?? []).filter((l) => !/^重要度\s*[◎○〇△]\s*$/.test(l.text.trim()));
          const answerRich = [
            ...(titleIsContent ? [richLine({ text: sup.parsed.titleRaw, source: sup.source[0] })] : []),
            ...collectLines({ lines: supLines, children: sup.children }, 0, []),
          ];
          if (answerRich.length === 0) {
            diag.push({ reason: "supplement-without-body", theory: theory.parsed.code });
            return;
          }
          const label = `${sup.parsed.labelRaw}${sup.parsed.titleRaw && !titleIsContent ? " " + sup.parsed.titleRaw : ""}`;
          const topicNode = structureNode(`${theory.stableId}:supplement-${hi + 1}`, sup.parsed.labelRaw);
          const stableId = `${theory.stableId}:supplement-${hi + 1}`;
          const ex = baseExercise({
            id: `${stableId}:recall`,
            type: "recall_text",
            stableId,
            structure: { theme: themeNode, section: sectionNode, topic: topicNode },
            structurePath: [themeNode, sectionNode, topicNode].map((n) => n.structureNodeId),
            prompt: rawSpan([theoryTitle, label].join("\n"), sup.source[0], sup.id),
            instructionRaw: null,
            provenance,
          });
          ex.expectedAnswer = [{ answerText: rawSpan(answerRich.map((l) => l.segments.map((g) => g.text ?? "").join("")).join("\n"), null, sup.id) }];
          ex.answerRich = answerRich;
          ex.recallMeta = { rankRaw: theory.parsed.rankRaw, importanceRaw: null, supplement: sup.parsed.labelRaw };
          exercises.push(ex);
          return;
        }
        if (heading.kind !== "heading") return;
        const headingTitle = `${heading.parsed.markerRaw}${heading.parsed.titleRaw}`;
        const topicNode = structureNode(`${theory.stableId}:heading-${hi + 1}`, headingTitle);
        const structureRef = { theme: themeNode, section: sectionNode, topic: topicNode };
        const path = [themeNode, sectionNode, topicNode].map((n) => n.structureNodeId);

        // カードの単位: 見出しの下の (1)(2)… ごと。(1) が無い見出しは見出しごとに1枚。
        // ただし、(1) が1行だけで本文を持たない（列挙そのもの）場合や、(1) より前に見出し直属の本文が
        // ある場合は、分けると中身が欠けるので見出しごとに1枚にする。
        const units = heading.children.filter((c) => c.parsed?.marker?.kind === "paren-number");
        const unitHasBody = (u) => u.lines.length > 1 || u.children.length > 0;
        const splitByUnit =
          units.length > 0 && units.length === heading.children.length && units.every(unitHasBody) && (heading.lines?.length ?? 0) === 0;
        if (units.length > 0 && !splitByUnit) diag.push({ reason: "recall-card-per-heading-instead-of-unit", theory: theory.parsed.code, heading: hi + 1 });
        const cards = splitByUnit
          ? units.map((u) => ({ node: u, title: u.lines[0], rest: { lines: u.lines.slice(1), children: u.children } }))
          : [{ node: heading, title: null, rest: { lines: heading.lines, children: heading.children } }];
        cards.forEach((card, ci) => {
          const answerRich = collectLines(card.rest, 0, []);
          if (answerRich.length === 0) {
            diag.push({ reason: "recall-card-without-body", theory: theory.parsed.code, heading: hi + 1 });
            return;
          }
          const promptText = [theoryTitle, headingTitle, card.title ? card.title.text.trim() : null].filter(Boolean).join("\n");
          const stableId = card.title ? `${theory.stableId}:heading-${hi + 1}:unit-${ci + 1}` : `${theory.stableId}:heading-${hi + 1}`;
          const ex = baseExercise({
            id: `${stableId}:recall`,
            type: "recall_text",
            stableId,
            structure: structureRef,
            structurePath: path,
            prompt: rawSpan(promptText, card.title ? card.title.source : heading.source[0], card.node.id),
            instructionRaw: null,
            provenance,
          });
          ex.promptRich = card.title ? [richLine(card.title)] : null;
          ex.expectedAnswer = [{ answerText: rawSpan(answerRich.map((l) => l.segments.map((s) => s.text ?? "").join("")).join("\n"), null, card.node.id) }];
          ex.answerRich = answerRich;
          ex.recallMeta = { rankRaw: theory.parsed.rankRaw, importanceRaw: heading.parsed.importanceRaw };
          exercises.push(ex);
        });
      });
    }
  }
  return exercises;
}

// ---- 暗記カード → 並べ替え（ordering） ----
//
// ユーザーの選択（2026-11-16）: 暗記カードを並べ替え問題としても出す。
//   - ピースの区切り:「、」「。」の直後。区切りが無く2ピースに満たない本文だけ、文節で分ける
//     （財表の「並び替え問題に変換」と同じ html-v2/js/phraseSegmenter.js の autoSplitPhraseText）
//   - ピースが MAX_PIECES を超えるカードは、段落（①・イ などの行頭記号の切れ目）で2問以上に分ける
// ピースはつなげると必ず本文に戻る（文字を足したり消したりしない）。ただし表示と同じく、PDFの
// 折り返しの直前の空白だけは詰める。分数を含むカードは文字列にできないので作らない。

const MAX_PIECES = 12;

function parenBalance(text) {
  let d = 0;
  for (const ch of text) {
    if (ch === "（" || ch === "(") d += 1;
    else if (ch === "）" || ch === ")") d = Math.max(0, d - 1);
  }
  return d;
}

function paragraphsOf(card) {
  const paras = [];
  for (const line of card.answerRich) {
    if (line.segments.some((s) => s.kind === "fraction")) return null;
    const text = line.segments.map((s) => s.text ?? "").join("");
    // 前の段落で括弧が閉じていないとき、または閉じ括弧から始まるときも続きとみなす
    // （条文の入れ子の切れ目をまたいでカッコ書きが続いている場合）。
    const prevOpen = paras.length > 0 && parenBalance(paras[paras.length - 1].text) > 0;
    if ((line.continues || prevOpen || /^[ 　]*[）)]/.test(text)) && paras.length) {
      const last = paras[paras.length - 1];
      last.text = last.text.replace(/[ 　]+$/, "") + text;
    } else paras.push({ text });
  }
  return paras.map((p) => ({ text: p.text.replace(/^[ 　]+|[ 　]+$/g, "") })).filter((p) => p.text);
}

// 「、」「。」の直後で区切る。ただし括弧（カッコ書き・条文番号）は崩さない（ユーザー指示、2026-11-17
// 「。のあとに括弧がある時、これを。で区切られちゃうとこまる」）:
//   - 括弧の中の「、」「。」では区切らない
//   - 「、」「。」のすぐ後に括弧が始まるときは、その括弧を前のピースに含め、閉じた直後で区切る
// 文字は1つも足し引きしない（つなげると元の文に戻る）。
/** 文節の区切りでも括弧の中では切らない: 括弧が閉じきるまで、次の断片を前の断片につなげる。 */
export function keepParenthesesWhole(pieces) {
  const out = [];
  let open = 0;
  for (const piece of pieces) {
    if (out.length && (open > 0 || /^[ 　]*[）)]/.test(piece))) out[out.length - 1] += piece;
    else out.push(piece);
    open = parenBalance(out[out.length - 1]);
  }
  return out;
}

export function splitByPunctuation(text) {
  const OPEN = "（(";
  const CLOSE = "）)";
  const pieces = [];
  let cur = "";
  let depth = 0;
  let deferred = false; // 区切りの直後に括弧が始まったので、括弧が閉じるまで区切りを待っている
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    cur += ch;
    if (OPEN.includes(ch)) depth += 1;
    else if (CLOSE.includes(ch)) {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && deferred) {
        deferred = false;
        const next = chars[i + 1];
        if (next !== undefined && !"、。".includes(next) && !OPEN.includes(next)) {
          pieces.push(cur);
          cur = "";
        }
      }
      continue;
    }
    if (depth === 0 && "、。".includes(ch)) {
      let j = i + 1;
      while (j < chars.length && /[ 　]/.test(chars[j])) j += 1;
      if (j < chars.length && OPEN.includes(chars[j])) {
        deferred = true;
        continue;
      }
      // 「。」の直後に閉じ括弧が来る（括弧の外側で閉じている）ときも区切らない
      if (j < chars.length && CLOSE.includes(chars[j])) continue;
      pieces.push(cur);
      cur = "";
    }
  }
  if (cur) pieces.push(cur);
  return pieces.filter((t) => t.trim() !== "");
}

function piecesOf(paragraphs, phraseSplit) {
  // 段落の終わりもピースの切れ目にする（段落をまたいでピースをつなげない）
  let pieces = paragraphs.flatMap((p) => splitByPunctuation(p.text).map((t) => ({ text: t, para: p })));
  let method = "punctuation";
  if (pieces.length < 2 && phraseSplit) {
    pieces = paragraphs.flatMap((p) => keepParenthesesWhole(phraseSplit(p.text)).map((t) => ({ text: t, para: p })));
    method = "phrase";
  }
  return { pieces, method };
}

/** 段落の並びを、ピースの数が MAX_PIECES 以下になるように順番どおり束ねる（1段落だけで超えるものはそのまま1束）。 */
function groupParagraphs(paragraphs, countOf) {
  const groups = [];
  let cur = [];
  let n = 0;
  for (const p of paragraphs) {
    const c = countOf(p);
    if (cur.length && n + c > MAX_PIECES) {
      groups.push(cur);
      cur = [];
      n = 0;
    }
    cur.push(p);
    n += c;
  }
  if (cur.length) groups.push(cur);
  return groups;
}

function orderingFromRecall(card, diag, phraseSplit) {
  const paragraphs = paragraphsOf(card);
  if (!paragraphs) {
    diag.push({ reason: "ordering-skipped-fraction", card: card.exerciseId });
    return [];
  }
  const total = piecesOf(paragraphs, phraseSplit);
  if (total.pieces.length < 2) {
    diag.push({ reason: "ordering-skipped-too-few-pieces", card: card.exerciseId });
    return [];
  }
  const groups =
    total.pieces.length > MAX_PIECES && total.method === "punctuation"
      ? groupParagraphs(paragraphs, (p) => splitByPunctuation(p.text).length)
      : [paragraphs];
  const out = [];
  groups.forEach((group, gi) => {
    const { pieces, method } = piecesOf(group, phraseSplit);
    if (pieces.length < 2) {
      diag.push({ reason: "ordering-part-too-few-pieces", card: card.exerciseId, part: gi + 1 });
      return;
    }
    // ピースをつなげると必ずこの文になる（アプリの編集画面が、保存前に完全一致を確かめる基準）。
    const referenceText = group.map((p) => p.text).join("");
    if (pieces.map((p) => p.text).join("") !== referenceText) {
      diag.push({ reason: "ordering-pieces-do-not-rejoin", card: card.exerciseId, part: gi + 1 });
      return;
    }
    const partLabel = groups.length > 1 ? `（${gi + 1}／${groups.length}）` : "";
    const stableId = `${card.stableItemIds[0]}:order-${gi + 1}`;
    const items = pieces.map((p, i) => ({ id: `item-${i}`, label: String(i + 1), text: p.text }));
    const ex = baseExercise({
      id: `${stableId}:ordering`,
      type: "ordering",
      stableId,
      structure: card.structure,
      structurePath: card.structurePath,
      prompt: { ...card.prompt, text: card.prompt.text + partLabel },
      instructionRaw: { text: "本文になるように、下のピースを正しい順番に並べ替えなさい。", source: null, bsmNodeId: null, inherited: false },
      provenance: { ...card.provenance, derivedFrom: card.exerciseId },
    });
    ex.orderingItems = items;
    ex.correctOrder = items.map((it) => it.id);
    ex.assembledFromSource = true;
    ex.sourceExerciseId = card.exerciseId;
    ex.orderingMeta = { pieceSplit: method, part: gi + 1, parts: groups.length, referenceText };
    out.push(ex);
    if (pieces.length > MAX_PIECES) diag.push({ reason: "ordering-part-over-max-pieces", card: card.exerciseId, part: gi + 1, pieces: pieces.length });
  });
  return out;
}

// ---- 理論ドクター ----
// 第1章: 問い（述べなさい）→ 解答、解説は「解答への道」と同じ折りたたみで出す。
// 第2・3章: 問い → 回答要旨。「参考」の囲み（問いが無い）は、題名を問いに、中身を答えにする。

function doctorExercises(structure, diag) {
  const bookId = structure.meta.bookId;
  const exercises = [];
  const provenance = { generator: "shohizei-exercise-view-0.1", sourceKind: "shohizei_doctor_structure", bookId };
  const CHAPTER_TITLES = { 1: "テーマ別理論問題", 2: "国税庁質疑応答事例", 3: "軽減税率制度に関するＱ＆Ａ" };
  for (const p of structure.children) {
    const ch = p.parsed.chapter;
    const themeTitle =
      ch === 1 ? `理論ドクター テーマ${p.parsed.themeNo} ${p.parsed.themeTitleRaw}` : `理論ドクター 第${ch}章 ${CHAPTER_TITLES[ch] ?? ""}`.trim();
    const themeNode = structureNode(ch === 1 ? `${bookId}:theme-${p.parsed.themeNo}` : `${bookId}:ch${ch}`, themeTitle);
    const sectionNode = structureNode(`${themeNode.structureNodeId}:${p.parsed.subThemeRaw}`, p.parsed.subThemeRaw === "unknown" ? "（小見出しなし）" : p.parsed.subThemeRaw);
    const titleText = [p.parsed.labelRaw, p.parsed.noRaw ? `${p.parsed.noRaw}．` : null, p.parsed.titleRaw].filter(Boolean).join(" ");
    const topicNode = structureNode(p.stableId, titleText);
    const isNote = p.parsed.labelRaw === "参考" && p.answer.length === 0;
    const promptLines = isNote ? [] : p.question;
    const answerLines = isNote ? p.question : p.answer;
    if (answerLines.length === 0) {
      diag.push({ reason: "doctor-without-answer", problem: p.stableId });
      continue;
    }
    setRightEdgesFromLines([...p.question, ...p.answer, ...p.explanation]);
    const ex = baseExercise({
      id: `${p.stableId}:recall`,
      type: "recall_text",
      stableId: p.stableId,
      structure: { theme: themeNode, section: sectionNode, topic: topicNode },
      structurePath: [themeNode, sectionNode, topicNode].map((n) => n.structureNodeId),
      prompt: rawSpan([titleText, ...promptLines.map((l) => l.text.trim())].join("\n"), p.source[0], p.id),
      instructionRaw: null,
      provenance,
    });
    ex.promptRich = promptLines.length ? richLines(promptLines) : null;
    ex.answerRich = richLines(answerLines);
    ex.expectedAnswer = [{ answerText: rawSpan(answerLines.map((l) => l.text.trim()).join("\n"), answerLines[0].source, p.id) }];
    ex.guidanceRich = p.explanation.length ? richLines(p.explanation) : null;
    ex.guidanceLabel = "解説";
    ex.recallMeta = { doctorLabel: p.parsed.labelRaw, chapter: ch };
    exercises.push(ex);
  }
  return exercises;
}

// ---- テキスト（読む用。exerciseType: reading） ----
// ユーザーの選択（2026-11-17）: テキストは読む用に表示する。本文は文字、図・表は画像（figures）。
// 節（N-N）ごとに1つ。採点はせず、「読んだ」を記録する。

function textExercises(structure, figuresById, bookTitle, diag) {
  const bookId = structure.meta.bookId;
  const exercises = [];
  const provenance = { generator: "shohizei-exercise-view-0.1", sourceKind: "shohizei_text_structure", bookId };
  const themeNode = structureNode(bookId, bookTitle);
  for (const session of structure.children) {
    for (const theme of session.children) {
      const themeTitle = theme.parsed.no === "unknown" ? `${session.parsed.raw}（はじめ）` : `テーマ${theme.parsed.no} ${theme.parsed.titleRaw}`;
      const sectionNode = structureNode(`${bookId}:${session.parsed.no}:${theme.parsed.no}`, `${session.parsed.raw} ${themeTitle}`);
      for (const sec of theme.children) {
        const title = [sec.parsed.codeRaw, sec.parsed.titleRaw].filter(Boolean).join(" ");
        // ユーザーの要望（2026-11-19）: 節（N-N）の中の ❶❷… の見出しごとに1ページにする。
        // 全体像を見失わないよう、どの本・テーマ・節の、何番目の見出しかを readingMeta に持たせる。
        const parts = splitAtNumberedHeadings(sec.blocks);
        const outline = parts.map((pt) => pt.heading);
        const topicNode = structureNode(sec.stableId, title);
        parts.forEach((pt, k) => {
          const content = readingContentOf(pt.blocks, figuresById, diag);
          if (content.length === 0) return;
          // 見出しが1つも無い節は、これまでどおり節で1ページ（学習記録のキーも変えない）
          const stableId = parts.length === 1 ? sec.stableId : `${sec.stableId}:part-${k + 1}`;
          const ex = baseExercise({
            id: `${stableId}:reading`,
            type: "reading",
            stableId,
            structure: { theme: themeNode, section: sectionNode, topic: topicNode },
            structurePath: [themeNode, sectionNode, topicNode].map((n) => n.structureNodeId),
            prompt: rawSpan(pt.heading ? `${title} ${pt.heading}` : title, sec.source[0], sec.id),
            instructionRaw: null,
            provenance,
          });
          ex.readingContent = content;
          ex.readingMeta = {
            bookTitle,
            themeTitle: `${session.parsed.raw} ${themeTitle}`.trim(),
            sectionTitle: title,
            partTitle: pt.heading,
            part: k + 1,
            parts: parts.length,
            outline: outline.map((h) => h ?? "（はじめ）"),
          };
          exercises.push(ex);
        });
      }
    }
  }
  return exercises;
}

// 節の中を ❶❷…（➊➋…）で始まる見出しの行で分ける。最初の見出しより前に中身があれば「はじめ」の部分にする。
const NUMBERED_HEADING = /^[\s　]*[❶-❿➊-➓]/;
export function splitAtNumberedHeadings(blocks) {
  const parts = [{ heading: null, blocks: [] }];
  for (const b of blocks) {
    if (b.kind === "line" && b.style === "heading" && NUMBERED_HEADING.test(b.text)) parts.push({ heading: b.text.trim().replace(/\s+/g, " "), blocks: [b] });
    else parts[parts.length - 1].blocks.push(b);
  }
  return parts.filter((pt, k) => k > 0 || pt.blocks.length > 0);
}

function readingContentOf(blocks, figuresById, diag) {
  const content = [];
  let run = [];
  const flush = () => {
    // 段落のつながり・字下げは位置から決める（readingLayout.mjs）
    const layout = layoutReadingLines(run);
    if (run.length)
      content.push({
        kind: "lines",
        lines: run.map((b, i) => ({
          ...richLine(b, layout[i].depth),
          continues: layout[i].continues,
          ...(layout[i].rowJoin ? { rowJoin: true } : {}),
          ...(layout[i].rowJoinTight ? { rowJoinTight: true } : {}),
          ...(layout[i].indent ? { indent: layout[i].indent } : {}),
          heading: b.style === "heading",
        })),
      });
    run = [];
  };
  for (const b of blocks) {
    if (b.kind === "line") run.push(b);
    else {
      flush();
      const img = figuresById.get(b.id);
      if (!img) {
        diag.push({ reason: "text-figure-missing", figure: b.id });
        continue;
      }
      content.push({ kind: "figure", src: `data:image/jpeg;base64,${img.jpegBase64}`, width: img.width, height: img.height, page: b.page });
    }
  }
  flush();
  return content;
}

// 範囲を選ぶ画面で、テーマの上にまとめる教材（structure.book）。ユーザーの要望（2026-11-17、W-7）:
// 範囲の一覧が長いので、教材ごとに見出しを押して開閉したい。どの教材か決められないものには付けない。
const MATERIALS = [
  { test: (k, b) => k === "shohizei_theory_structure", id: "theory-master", title: "理論マスター" },
  { test: (k, b) => k === "shohizei_doctor_structure", id: "theory-doctor", title: "理論ドクター" },
  { test: (k, b) => /^training-basic-/.test(b), id: "training-basic", title: "トレーニング 基礎M・速修" },
  { test: (k, b) => /^training-advanced-/.test(b), id: "training-advanced", title: "トレーニング 上級（速修 No.5〜8）" },
  { test: (k, b) => /^text-basic-/.test(b), id: "text-basic", title: "基本テキスト" },
  { test: (k, b) => /^text-speed-/.test(b), id: "text-speed", title: "速修テキスト" },
];

export function withMaterial(ex) {
  if (!ex.structure || !ex.provenance) return ex;
  const m = MATERIALS.find((x) => x.test(ex.provenance.sourceKind, ex.provenance.bookId ?? ""));
  if (!m) return ex;
  return { ...ex, structure: { book: structureNode(`material:${m.id}`, m.title), ...ex.structure } };
}

export function buildShohizeiExerciseView({ trainings = [], theories = [], doctors = [], texts = [], bookTitles = {}, phraseSplit = null, generatedAt = new Date().toISOString() }) {
  const diagnostics = [];
  const base = [
    ...theories.flatMap((t) => theoryExercises(t, diagnostics)),
    ...doctors.flatMap((d) => doctorExercises(d, diagnostics)),
    ...trainings.flatMap((t) => trainingExercises(t, diagnostics, bookTitles)),
    ...texts.flatMap((t) => textExercises(t.structure, t.figuresById, bookTitles[t.structure.meta.bookId] ?? t.structure.meta.bookId, diagnostics)),
  ];
  // 並べ替えは、元の暗記カードのすぐ後ろに置く（範囲の中で教材の順に並ぶように）。
  const exercises = base
    .flatMap((ex) => (ex.exerciseType === "recall_text" && !ex.recallMeta?.noOrdering ? [ex, ...orderingFromRecall(ex, diagnostics, phraseSplit)] : [ex]))
    .map(withMaterial)
    .map(replaceFontSymbolsDeep);
  return {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      subject: SUBJECT,
      status: "shohizei-generated-draft",
      generatedAt,
      sourceBookStructureMasterPath: null,
      targetCheckBlockIds: [],
      displayText: "alignment-spaces-removed",
      generationRules: ["shohizei_true_false_v0.1", "shohizei_recall_text_v0.1", "shohizei_recall_to_ordering_v0.1", "shohizei_calculation_steps_v0.1"],
      exerciseCount: exercises.length,
      withheldExerciseCount: 0,
    },
    exercises,
    withheldExercises: [],
    diagnostics,
  };
}
